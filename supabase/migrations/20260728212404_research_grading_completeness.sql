-- Distinguish an evidence grade from the completeness of the metadata used to
-- compute it. A grade may still be computed fail-closed, but missing inputs are
-- never represented as if they had been measured.

create or replace function public.compute_research_missing_grading_inputs(
  p_study_design text,
  p_species text,
  p_sample_size integer,
  p_funding_independent boolean,
  p_is_preprint boolean
)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select array_remove(array[
    case when p_study_design is null then 'study_design' end,
    case when p_species is null then 'species' end,
    case when p_sample_size is null then 'sample_size' end,
    case when p_funding_independent is null then 'funding_independent' end,
    case when p_is_preprint is null then 'is_preprint' end
  ], null::text)
$function$;

comment on function public.compute_research_missing_grading_inputs(text, text, integer, boolean, boolean)
is 'Returns every absent input to the deterministic evidence-grade function. Empty means complete; it does not imply strong evidence.';

alter table public.research_documents
  add column if not exists competing_interests_declaration text,
  add column if not exists grading_input_sources jsonb not null default '{}'::jsonb,
  add column if not exists missing_grading_inputs text[] generated always as (
    public.compute_research_missing_grading_inputs(
      study_design,
      species,
      sample_size,
      funding_independent,
      is_preprint
    )
  ) stored,
  add column if not exists grading_inputs_complete boolean generated always as (
    cardinality(public.compute_research_missing_grading_inputs(
      study_design,
      species,
      sample_size,
      funding_independent,
      is_preprint
    )) = 0
  ) stored;

comment on column public.research_documents.funding_declaration
is 'Verbatim plain-text content of the source JATS funding-group. Whitespace is normalized; wording is never model-authored or paraphrased.';
comment on column public.research_documents.competing_interests_declaration
is 'Verbatim plain-text content of the source JATS competing-interests statement. Whitespace is normalized; wording is never model-authored or paraphrased.';
comment on column public.research_documents.grading_input_sources
is 'Machine-readable provenance for each grading input, for example PubMed PublicationTypeList or Europe PMC JATS funding-group.';
comment on column public.research_documents.missing_grading_inputs
is 'Inputs absent from the grade computation. A non-empty array makes metadata incompleteness explicit even though evidence_grade still fails closed.';
comment on column public.research_documents.grading_inputs_complete
is 'True only when every input to evidence grading was populated. Future auto-activation must require this to be true.';

alter table public.research_documents
  drop constraint if exists research_documents_study_design_check;

alter table public.research_documents
  add constraint research_documents_study_design_check
    check (
      study_design is null or study_design in (
        'systematic_review',
        'meta_analysis',
        'rct',
        'controlled_trial',
        'comparative_study',
        'clinical_trial',
        'cohort',
        'case_control',
        'case_series',
        'cross_sectional',
        'in_vitro',
        'narrative_review',
        'guideline',
        'other'
      )
    );

alter table public.research_claims
  add column if not exists missing_grading_inputs text[] generated always as (
    public.compute_research_missing_grading_inputs(
      study_design,
      species,
      sample_size,
      funding_independent,
      is_preprint
    )
  ) stored,
  add column if not exists grading_inputs_complete boolean generated always as (
    cardinality(public.compute_research_missing_grading_inputs(
      study_design,
      species,
      sample_size,
      funding_independent,
      is_preprint
    )) = 0
  ) stored;

alter table public.research_claims
  drop constraint if exists research_claims_study_design_check;

alter table public.research_claims
  add constraint research_claims_study_design_check
    check (
      study_design is null or study_design in (
        'systematic_review',
        'meta_analysis',
        'rct',
        'controlled_trial',
        'comparative_study',
        'clinical_trial',
        'cohort',
        'case_control',
        'case_series',
        'cross_sectional',
        'in_vitro',
        'narrative_review',
        'guideline',
        'other'
      )
    );

comment on column public.research_claims.missing_grading_inputs
is 'Source-controlled missing grade inputs copied through the claim metadata sync.';
comment on column public.research_claims.grading_inputs_complete
is 'Future unattended activation must require true. Manual review is still allowed for incomplete evidence.';
