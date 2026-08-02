-- Minimal production-shape prerequisite for isolated P3 graph-projection
-- testing. This is a disposable validation fixture, not a production
-- migration. It reconstructs the final state of the research
-- claims/clusters/documents schema (built across many prior migrations)
-- without replaying the full historical chain, which depends on a
-- pre-migrations-folder baseline (foods/dogs/etc.) that is not present in
-- this repository. Same approach as supabase/tests/p2_minimal_research_fixture.sql.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

-- The disposable container's auth schema is owned by a role this session
-- cannot write to, and reviewed_by/last_edited_by identity is not what P3's
-- eligibility logic depends on -- so the fixture uses a plain uuid column
-- instead of a real FK to auth.users. Production keeps the real FK.

create table public.research_ingestion_jobs (
  id uuid primary key default gen_random_uuid()
);

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
    when p_species is not null and p_species <> 'dog' then 'E'
    when coalesce(p_is_preprint, false) then 'D'
    when p_species = 'dog'
      and p_study_design in ('systematic_review', 'meta_analysis') then 'A'
    when p_species = 'dog'
      and p_study_design in ('rct', 'controlled_trial')
      and (
        p_funding_independent is false
        or (p_sample_size is not null and p_sample_size < 20)
      ) then 'C'
    when p_species = 'dog'
      and p_study_design in ('rct', 'controlled_trial') then 'B'
    when p_species = 'dog'
      and p_study_design in ('cohort', 'case_control')
      and p_sample_size is not null
      and p_sample_size < 20 then 'D'
    when p_species = 'dog'
      and p_study_design in ('cohort', 'case_control') then 'C'
    else 'D'
  end
$function$;

create table public.research_documents (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  retracted boolean not null default false,
  superseded_by uuid references public.research_documents(id) on delete set null,
  access_type text not null default 'metadata_pending'
    check (access_type in (
      'open_access_full_text', 'abstract_only', 'uploaded_full_text_private', 'metadata_pending'
    )),
  doi text,
  pmid text,
  pmcid text,
  journal text,
  publication_year integer,
  study_design text,
  species text
    check (species is null or species in ('dog', 'cat', 'human', 'rodent', 'other')),
  sample_size integer,
  funding_independent boolean,
  is_preprint boolean not null default false,
  evidence_scope text not null default 'canine_direct'
    check (
      (evidence_scope = 'canine_direct' and species = 'dog')
      or evidence_scope = 'veterinary_methodology'
    ),
  evidence_grade text generated always as (
    public.compute_research_evidence_grade(
      study_design, species, sample_size, funding_independent, is_preprint
    )
  ) stored
);

create table public.research_chunks (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.research_documents(id) on delete cascade,
  content text not null
);

create table public.research_claims (
  id uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.research_documents(id) on delete cascade,
  chunk_id uuid not null references public.research_chunks(id) on delete cascade,
  supporting_quote text not null check (length(btrim(supporting_quote)) > 0),
  subject_type text not null
    check (subject_type in ('ingredient', 'nutrient', 'ingredient_class', 'processing_method', 'biome_marker')),
  subject_value text not null check (length(btrim(subject_value)) > 0),
  applies_to_condition text,
  applies_to_life_stage text
    check (applies_to_life_stage is null or applies_to_life_stage in ('growth', 'adult', 'senior', 'all_life_stages')),
  direction text not null
    check (direction in ('supports', 'cautions_against', 'neutral', 'insufficient_evidence')),
  effect_summary text not null check (length(btrim(effect_summary)) > 0),
  study_design text,
  species text,
  sample_size integer,
  funding_independent boolean,
  is_preprint boolean not null default false,
  evidence_scope text not null default 'canine_direct'
    check (
      (evidence_scope = 'canine_direct' and species = 'dog')
      or evidence_scope = 'veterinary_methodology'
    ),
  evidence_grade text generated always as (
    public.compute_research_evidence_grade(
      study_design, species, sample_size, funding_independent, is_preprint
    )
  ) stored,
  corroborating_claim_ids uuid[] not null default '{}'::uuid[],
  claim_identity text not null unique check (claim_identity ~ '^[0-9a-f]{64}$'),
  status text not null default 'draft'
    check (status in ('draft', 'active', 'queued_for_review', 'rejected', 'superseded')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_claims_rejection_note_check
    check (status <> 'rejected' or length(btrim(coalesce(review_note, ''))) > 0),
  constraint research_claims_active_review_check
    check (status <> 'active' or (reviewed_by is not null and reviewed_at is not null))
);

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
  v_evidence_scope text;
  v_retracted boolean;
begin
  select rd.study_design, rd.species, rd.sample_size, rd.funding_independent, rd.is_preprint, rd.evidence_scope, rd.retracted
  into v_study_design, v_species, v_sample_size, v_funding_independent, v_is_preprint, v_evidence_scope, v_retracted
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

  new.study_design := v_study_design;
  new.species := v_species;
  new.sample_size := v_sample_size;
  new.funding_independent := v_funding_independent;
  new.is_preprint := v_is_preprint;
  new.evidence_scope := v_evidence_scope;
  new.updated_at := now();

  return new;
end
$function$;

create trigger research_claim_validate_and_sync
before insert or update on public.research_claims
for each row execute function public.validate_and_sync_research_claim();

create table public.research_evidence_clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_identity text not null unique check (cluster_identity ~ '^[0-9a-f]{64}$'),
  label text not null check (length(btrim(label)) > 0),
  subject_type text not null
    check (subject_type in ('ingredient', 'nutrient', 'ingredient_class', 'processing_method', 'biome_marker')),
  subject_value text not null check (length(btrim(subject_value)) > 0),
  outcome_type text not null
    check (outcome_type in ('condition', 'biome_marker', 'clinical_marker', 'outcome_metric', 'general_health')),
  outcome_value text not null check (length(btrim(outcome_value)) > 0),
  direction text not null
    check (direction in ('supports', 'cautions_against', 'neutral', 'insufficient_evidence')),
  cautious_summary text not null check (length(btrim(cautious_summary)) > 0),
  status text not null default 'draft'
    check (status in ('draft', 'queued_for_review', 'active', 'rejected', 'superseded')),
  reviewed_by uuid,
  reviewed_at timestamptz,
  review_note text,
  created_by_job_id uuid references public.research_ingestion_jobs(id) on delete set null,
  last_edited_by uuid,
  last_edited_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_evidence_clusters_active_review_check
    check (status <> 'active' or (reviewed_by is not null and reviewed_at is not null)),
  constraint research_evidence_clusters_rejection_note_check
    check (status <> 'rejected' or length(btrim(coalesce(review_note, ''))) > 0),
  constraint research_evidence_clusters_dog_response_scope_check
    check (
      status = 'rejected'
      or lower(outcome_value) !~
        '(contaminat|antimicrobial resistance|antibiotic resistance|drug resistance|pathogen (detection|prevalence|rate|load)|label accuracy|labeling accuracy|labelling accuracy|mislabel|undeclared (animal species|ingredient|protein)|composition variability|manufactur(e|ed|er|ing) (defect|quality|control)|product recall)'
    )
);

create table public.research_evidence_cluster_members (
  cluster_id uuid not null references public.research_evidence_clusters(id) on delete cascade,
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  semantic_similarity double precision
    check (semantic_similarity is null or semantic_similarity between -1 and 1),
  relationship text not null default 'same_proposition'
    check (relationship in ('same_proposition', 'supports_context', 'contradicts', 'related_outcome')),
  independently_reviewed boolean not null default false,
  added_by_job_id uuid references public.research_ingestion_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (cluster_id, claim_id)
);

create table public.research_cluster_applicability (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.research_evidence_clusters(id) on delete cascade,
  context_type text not null
    check (context_type in ('health_condition', 'document_finding', 'life_stage', 'restriction', 'outcome_metric')),
  context_key text not null check (length(btrim(context_key)) > 0),
  context_value text,
  match_operator text not null default 'exact'
    check (match_operator in ('exact', 'enum')),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cluster_id, context_type, context_key, context_value)
);
