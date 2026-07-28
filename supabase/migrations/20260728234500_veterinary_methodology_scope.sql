-- Group G appraises veterinary evidence methods rather than making a biological
-- claim about a species. Keep it separate from canine evidence and never call an
-- inapplicable species field "missing".

create or replace function public.compute_research_missing_grading_inputs(
  p_study_design text,
  p_species text,
  p_sample_size integer,
  p_funding_independent boolean,
  p_is_preprint boolean,
  p_evidence_scope text
)
returns text[]
language sql
immutable
parallel safe
set search_path = ''
as $function$
  select array_remove(array[
    case when p_study_design is null then 'study_design' end,
    case
      when p_evidence_scope = 'canine_direct'
        and p_species is null then 'species'
    end,
    case when p_is_preprint is null then 'is_preprint' end,
    case
      when p_evidence_scope = 'canine_direct'
        and p_study_design in ('rct', 'controlled_trial', 'cohort', 'case_control')
        and p_sample_size is null then 'sample_size'
    end,
    case
      when p_evidence_scope = 'canine_direct'
        and p_study_design in ('rct', 'controlled_trial')
        and p_funding_independent is null then 'funding_independent'
    end
  ], null::text)
$function$;

alter table public.research_documents
  drop column grading_inputs_complete,
  drop column missing_grading_inputs;

alter table public.research_documents
  add column missing_grading_inputs text[] generated always as (
    public.compute_research_missing_grading_inputs(
      study_design, species, sample_size, funding_independent, is_preprint, evidence_scope
    )
  ) stored,
  add column grading_inputs_complete boolean generated always as (
    cardinality(public.compute_research_missing_grading_inputs(
      study_design, species, sample_size, funding_independent, is_preprint, evidence_scope
    )) = 0
  ) stored;

alter table public.research_claims
  drop column grading_inputs_complete,
  drop column missing_grading_inputs;

alter table public.research_claims
  add column missing_grading_inputs text[] generated always as (
    public.compute_research_missing_grading_inputs(
      study_design, species, sample_size, funding_independent, is_preprint, evidence_scope
    )
  ) stored,
  add column grading_inputs_complete boolean generated always as (
    cardinality(public.compute_research_missing_grading_inputs(
      study_design, species, sample_size, funding_independent, is_preprint, evidence_scope
    )) = 0
  ) stored;

alter table public.research_documents
  drop constraint research_documents_evidence_scope_check,
  add constraint research_documents_evidence_scope_check
    check (
      (evidence_scope = 'canine_direct' and species = 'dog')
      or evidence_scope = 'veterinary_methodology'
    );

alter table public.research_claims
  drop constraint research_claims_evidence_scope_check,
  add constraint research_claims_evidence_scope_check
    check (
      (evidence_scope = 'canine_direct' and species = 'dog')
      or evidence_scope = 'veterinary_methodology'
    );

comment on column public.research_documents.evidence_scope
is 'canine_direct biological evidence or veterinary_methodology evidence-appraisal context. Methodology never corroborates, scores, recommends, or auto-activates.';
