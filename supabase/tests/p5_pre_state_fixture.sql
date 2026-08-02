-- Reconstructs the two pre-P5 production objects that
-- 20260802210000_research_retraction_supersession_propagation.sql retires
-- (research_document_sync_claim_metadata trigger/function and
-- mark_research_document_retracted), sourced verbatim from
-- 20260728200000_research_claims_and_grading.sql, which the shared p3
-- minimal fixture does not replay.
--
-- Applied after the P3/P4 migrations and BEFORE the P5 migration so P5's
-- DROP statements are exercised against real pre-existing state, not a
-- vacuum -- without this, a test container that never had these objects in
-- the first place cannot prove the P5 migration actually retires them, and
-- cannot catch the trigger-ordering bug this retirement exists to fix (the
-- old trigger fires synchronously inside the same statement as the document
-- UPDATE and would silently empty out affected_claim_ids before P5's own
-- explicit claim-transition step runs).

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

create or replace function public.mark_research_document_retracted(
  p_document_id uuid,
  p_checked_at timestamptz,
  p_source_message text
)
returns boolean
language plpgsql
set search_path = ''
as $function$
begin
  update public.research_documents
  set
    retracted = true,
    retraction_checked_at = p_checked_at
  where id = p_document_id;

  return found;
end
$function$;
