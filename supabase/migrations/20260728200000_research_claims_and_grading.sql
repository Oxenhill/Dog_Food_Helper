-- Research evidence layer: source metadata, deterministic grading, claim review.
--
-- Auto-activation is deliberately absent. Claims can only become active through
-- an explicit admin review action. Recommendation/scoring code is untouched.

create or replace function public.compute_research_evidence_grade(
  p_study_design text,
  p_species text,
  p_sample_size integer,
  p_funding_independent boolean,
  p_is_preprint boolean
)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select case
    -- Cross-species extrapolation is always the weakest grade. A preprint cap
    -- cannot improve an otherwise-E source to D.
    when p_species is not null and p_species <> 'dog' then 'E'
    when coalesce(p_is_preprint, false) then 'D'
    when p_species = 'dog'
      and p_study_design in ('systematic_review', 'meta_analysis') then 'A'
    when p_species = 'dog'
      and p_study_design in ('rct', 'controlled_trial')
      and p_funding_independent is true
      and p_sample_size >= 20 then 'B'
    when p_species = 'dog'
      and p_study_design in ('cohort', 'case_control') then 'C'
    when p_species = 'dog'
      and p_study_design in ('rct', 'controlled_trial')
      and p_funding_independent is false then 'C'
    else 'D'
  end
$function$;

comment on function public.compute_research_evidence_grade(text, text, integer, boolean, boolean)
is 'Deterministic A-E evidence grade from source metadata. Missing metadata cannot earn B; preprints are capped at D; explicit non-canine evidence is E.';

alter table public.research_documents
  add column if not exists topic_group text,
  add column if not exists discovery_topic text,
  add column if not exists source_name text,
  add column if not exists source_id text,
  add column if not exists doi text,
  add column if not exists pmid text,
  add column if not exists pmcid text,
  add column if not exists journal text,
  add column if not exists publication_year integer,
  add column if not exists study_design text,
  add column if not exists species text,
  add column if not exists sample_size integer,
  add column if not exists funding_declaration text,
  add column if not exists funding_independent boolean,
  add column if not exists is_preprint boolean not null default false,
  add column if not exists open_access boolean not null default false,
  add column if not exists abstract_only boolean not null default true,
  add column if not exists license text,
  add column if not exists retracted boolean not null default false,
  add column if not exists retraction_checked_at timestamptz,
  add column if not exists source_metadata jsonb not null default '{}'::jsonb,
  add column if not exists evidence_grade text generated always as (
    public.compute_research_evidence_grade(
      study_design,
      species,
      sample_size,
      funding_independent,
      is_preprint
    )
  ) stored;

alter table public.research_documents
  add constraint research_documents_topic_group_check
    check (topic_group is null or topic_group in ('A', 'B', 'C', 'D', 'E', 'F', 'G')),
  add constraint research_documents_source_name_check
    check (source_name is null or source_name in ('europe_pmc', 'pubmed', 'crossref', 'wsava', 'fediaf')),
  add constraint research_documents_publication_year_check
    check (publication_year is null or publication_year between 1800 and 2100),
  add constraint research_documents_study_design_check
    check (
      study_design is null or study_design in (
        'systematic_review',
        'meta_analysis',
        'rct',
        'controlled_trial',
        'cohort',
        'case_control',
        'case_series',
        'cross_sectional',
        'in_vitro',
        'narrative_review',
        'guideline',
        'other'
      )
    ),
  add constraint research_documents_species_check
    check (species is null or species in ('dog', 'cat', 'human', 'rodent', 'other')),
  add constraint research_documents_sample_size_check
    check (sample_size is null or sample_size > 0),
  add constraint research_documents_evidence_grade_check
    check (evidence_grade in ('A', 'B', 'C', 'D', 'E'));

create unique index if not exists research_documents_doi_unique_idx
  on public.research_documents (lower(doi))
  where doi is not null;

create unique index if not exists research_documents_source_record_unique_idx
  on public.research_documents (source_name, source_id)
  where source_name is not null and source_id is not null;

create index if not exists research_documents_discovery_topic_idx
  on public.research_documents (topic_group, discovery_topic);

create index if not exists research_documents_retraction_watch_idx
  on public.research_documents (retraction_checked_at)
  where doi is not null and retracted = false;

comment on column public.research_documents.source_metadata
is 'Verbatim structured metadata returned by the source API. Model-authored values are forbidden.';
comment on column public.research_documents.sample_size
is 'Structured source value only. Null when the source does not provide a standardized sample-size field.';
comment on column public.research_documents.funding_independent
is 'Deterministically derived from structured source funding metadata; null when independence cannot be verified.';
comment on column public.research_documents.evidence_grade
is 'Stored generated column; cannot be assigned by an application or model.';

create table if not exists public.research_topic_centroids (
  topic_key text primary key,
  topic_group text not null
    check (topic_group in ('A', 'B', 'C', 'D', 'E', 'F', 'G')),
  centroid_text text not null,
  embedding extensions.vector(1536) not null,
  embedding_model text not null,
  updated_at timestamptz not null default now()
);

create table if not exists public.research_document_relevance (
  document_id uuid not null references public.research_documents(id) on delete cascade,
  topic_key text not null,
  similarity double precision not null check (similarity between -1 and 1),
  evaluated_at timestamptz not null default now(),
  primary key (document_id, topic_key)
);

comment on table public.research_topic_centroids
is 'Cached 1536-dimension topic embeddings used to rank documents before any claim-drafting cost.';
comment on table public.research_document_relevance
is 'Embedding similarity against topic centroids. Claim drafting selects from this table before invoking a model.';

alter table public.research_topic_centroids enable row level security;
alter table public.research_document_relevance enable row level security;
revoke all on table public.research_topic_centroids from anon, authenticated;
revoke all on table public.research_document_relevance from anon, authenticated;

create table if not exists public.research_claims (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.research_documents(id) on delete cascade,
  chunk_id uuid not null references public.research_chunks(id) on delete cascade,
  supporting_quote text not null,
  subject_type text not null,
  subject_value text not null,
  applies_to_condition text,
  applies_to_life_stage text,
  direction text not null,
  effect_summary text not null,
  study_design text,
  species text,
  sample_size integer,
  funding_independent boolean,
  is_preprint boolean not null default false,
  evidence_grade text generated always as (
    public.compute_research_evidence_grade(
      study_design,
      species,
      sample_size,
      funding_independent,
      is_preprint
    )
  ) stored,
  corroborating_claim_ids uuid[] not null default '{}'::uuid[],
  status text not null default 'draft',
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_claims_supporting_quote_nonempty_check
    check (length(btrim(supporting_quote)) > 0),
  constraint research_claims_subject_type_check
    check (subject_type in ('ingredient', 'nutrient', 'ingredient_class', 'processing_method', 'biome_marker')),
  constraint research_claims_subject_value_nonempty_check
    check (length(btrim(subject_value)) > 0),
  constraint research_claims_life_stage_check
    check (applies_to_life_stage is null or applies_to_life_stage in ('growth', 'adult', 'senior', 'all_life_stages')),
  constraint research_claims_direction_check
    check (direction in ('supports', 'cautions_against', 'neutral', 'insufficient_evidence')),
  constraint research_claims_effect_summary_nonempty_check
    check (length(btrim(effect_summary)) > 0),
  constraint research_claims_study_design_check
    check (
      study_design is null or study_design in (
        'systematic_review',
        'meta_analysis',
        'rct',
        'controlled_trial',
        'cohort',
        'case_control',
        'case_series',
        'cross_sectional',
        'in_vitro',
        'narrative_review',
        'guideline',
        'other'
      )
    ),
  constraint research_claims_species_check
    check (species is null or species in ('dog', 'cat', 'human', 'rodent', 'other')),
  constraint research_claims_sample_size_check
    check (sample_size is null or sample_size > 0),
  constraint research_claims_evidence_grade_check
    check (evidence_grade in ('A', 'B', 'C', 'D', 'E')),
  constraint research_claims_status_check
    check (status in ('draft', 'active', 'queued_for_review', 'rejected', 'superseded')),
  constraint research_claims_rejection_note_check
    check (status <> 'rejected' or length(btrim(coalesce(review_note, ''))) > 0),
  constraint research_claims_active_review_check
    check (status <> 'active' or (reviewed_by is not null and reviewed_at is not null))
);

comment on table public.research_claims
is 'Offline-drafted, verbatim-supported evidence claims. No model runs in the request path and no auto-activation trigger exists.';
comment on column public.research_claims.supporting_quote
is 'Must be a literal substring of the referenced chunk. The trigger rejects, and never repairs, failures.';
comment on column public.research_claims.evidence_grade
is 'Generated from source metadata copied from research_documents; never assigned by a model or reviewer.';

create or replace function public.validate_and_sync_research_claim()
returns trigger
language plpgsql
set search_path = ''
as $function$
declare
  v_chunk_content text;
  v_study_design text;
  v_species text;
  v_sample_size integer;
  v_funding_independent boolean;
  v_is_preprint boolean;
  v_retracted boolean;
begin
  select
    rd.study_design,
    rd.species,
    rd.sample_size,
    rd.funding_independent,
    rd.is_preprint,
    rd.retracted
  into
    v_study_design,
    v_species,
    v_sample_size,
    v_funding_independent,
    v_is_preprint,
    v_retracted
  from public.research_documents rd
  where rd.id = new.document_id;

  if not found then
    raise exception 'Research claim document does not exist';
  end if;

  select rc.content
  into v_chunk_content
  from public.research_chunks rc
  where rc.id = new.chunk_id
    and rc.document_id = new.document_id;

  if not found then
    raise exception 'Research claim chunk does not belong to its document';
  end if;

  if position(new.supporting_quote in v_chunk_content) = 0 then
    raise exception 'supporting_quote is not a literal substring of its chunk';
  end if;

  if new.status = 'active' and v_retracted then
    raise exception 'A claim from a retracted document cannot be active';
  end if;

  -- These values are source-controlled. Any caller-supplied versions are
  -- overwritten, making the generated grade non-assignable in practice.
  new.study_design := v_study_design;
  new.species := v_species;
  new.sample_size := v_sample_size;
  new.funding_independent := v_funding_independent;
  new.is_preprint := v_is_preprint;
  new.updated_at := now();

  return new;
end
$function$;

create trigger research_claim_validate_and_sync
before insert or update on public.research_claims
for each row execute function public.validate_and_sync_research_claim();

create or replace function public.sync_research_claims_after_document_change()
returns trigger
language plpgsql
set search_path = ''
as $function$
begin
  update public.research_claims
  set
    status = case when new.retracted then 'superseded' else status end,
    document_id = document_id
  where document_id = new.id;
  return new;
end
$function$;

create trigger research_document_sync_claim_metadata
after update of study_design, species, sample_size, funding_independent, is_preprint, retracted
on public.research_documents
for each row execute function public.sync_research_claims_after_document_change();

create index if not exists research_claims_review_queue_idx
  on public.research_claims (status, created_at)
  where status in ('draft', 'queued_for_review');

create index if not exists research_claims_document_idx
  on public.research_claims (document_id);

create index if not exists research_claims_subject_idx
  on public.research_claims (subject_type, subject_value);

alter table public.research_claims enable row level security;

revoke all on table public.research_claims from anon, authenticated;
grant select on table public.research_claims to anon, authenticated;

create policy "anyone can read manually active research claims"
  on public.research_claims
  for select
  to anon, authenticated
  using (
    status = 'active'
    and exists (
      select 1
      from public.research_documents rd
      where rd.id = research_claims.document_id
        and rd.retracted = false
        and rd.superseded_by is null
    )
  );

-- Retraction application is one transaction: source state, claim
-- supersession (via trigger), and an unresolved alert. Callable only by the
-- service role used by server-side admin/retraction routes.
create or replace function public.mark_research_document_retracted(
  p_document_id uuid,
  p_checked_at timestamptz,
  p_source_message text
)
returns boolean
language plpgsql
set search_path = ''
as $function$
declare
  v_title text;
begin
  update public.research_documents
  set
    retracted = true,
    retraction_checked_at = p_checked_at
  where id = p_document_id
  returning title into v_title;

  if not found then
    return false;
  end if;

  if not exists (
    select 1
    from public.system_alerts sa
    where sa.check_name = 'research_retraction:' || p_document_id::text
      and sa.resolved_at is null
  ) then
    insert into public.system_alerts (check_name, message)
    values (
      'research_retraction:' || p_document_id::text,
      coalesce(v_title, p_document_id::text) || ': ' || p_source_message
    );
  end if;

  return true;
end
$function$;

revoke all on function public.mark_research_document_retracted(uuid, timestamptz, text) from public;
grant execute on function public.mark_research_document_retracted(uuid, timestamptz, text) to service_role;
