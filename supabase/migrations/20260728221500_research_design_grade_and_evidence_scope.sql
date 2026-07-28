-- Separate study-design strength from future activation eligibility.
--
-- Unknown metadata is not treated as a negative finding: it remains visible in
-- missing_grading_inputs and keeps grading_inputs_complete false. Known small
-- samples and known industry funding apply explicit downgrades.

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

comment on function public.compute_research_evidence_grade(text, text, integer, boolean, boolean)
is 'Design-strength A-E grade with known penalties. Unknown sample size or funding does not imply weak evidence; incompleteness is represented separately and blocks future unattended activation.';

alter table public.research_documents
  add column if not exists evidence_scope text not null default 'canine_direct';

alter table public.research_claims
  add column if not exists evidence_scope text not null default 'canine_direct';

do $migration$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'research_documents_evidence_scope_check'
      and conrelid = 'public.research_documents'::regclass
  ) then
    alter table public.research_documents
      add constraint research_documents_evidence_scope_check
      check (
        evidence_scope = 'canine_direct'
        or (
          evidence_scope = 'cross_species_mechanism'
          and species is not null
          and species <> 'dog'
        )
      );
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'research_claims_evidence_scope_check'
      and conrelid = 'public.research_claims'::regclass
  ) then
    alter table public.research_claims
      add constraint research_claims_evidence_scope_check
      check (
        evidence_scope = 'canine_direct'
        or (
          evidence_scope = 'cross_species_mechanism'
          and species is not null
          and species <> 'dog'
        )
      );
  end if;
end
$migration$;

comment on column public.research_documents.evidence_scope
is 'canine_direct or quarantined cross_species_mechanism. Mechanism records are grade E and must never corroborate, score, recommend, or auto-activate.';

comment on column public.research_claims.evidence_scope
is 'Copied from the source document. cross_species_mechanism claims are contextual only and excluded from corroboration, scoring, recommendations, and unattended activation.';

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
  select
    rd.study_design,
    rd.species,
    rd.sample_size,
    rd.funding_independent,
    rd.is_preprint,
    rd.evidence_scope,
    rd.retracted
  into
    v_study_design,
    v_species,
    v_sample_size,
    v_funding_independent,
    v_is_preprint,
    v_evidence_scope,
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

drop trigger if exists research_document_sync_claim_metadata
  on public.research_documents;

create trigger research_document_sync_claim_metadata
after update of study_design, species, sample_size, funding_independent, is_preprint, evidence_scope, retracted
on public.research_documents
for each row execute function public.sync_research_claims_after_document_change();
