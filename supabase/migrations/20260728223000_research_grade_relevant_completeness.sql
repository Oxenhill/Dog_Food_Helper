-- Completeness is branch-specific: only metadata capable of changing the
-- selected grade is required. Sample size is not meaningful for a narrative
-- review or a systematic review, for example.

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
    case when p_is_preprint is null then 'is_preprint' end,
    case
      when p_study_design in ('rct', 'controlled_trial')
        and p_sample_size is null then 'sample_size'
      when p_study_design in ('cohort', 'case_control')
        and p_sample_size is null then 'sample_size'
    end,
    case
      when p_study_design in ('rct', 'controlled_trial')
        and p_funding_independent is null then 'funding_independent'
    end
  ], null::text)
$function$;

comment on function public.compute_research_missing_grading_inputs(text, text, integer, boolean, boolean)
is 'Returns absent metadata relevant to the selected evidence-grade branch. Inapplicable fields are not called missing; unknown RCT sample size/funding and unknown observational sample size remain incomplete.';
