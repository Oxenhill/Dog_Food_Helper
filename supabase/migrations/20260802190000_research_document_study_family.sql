-- P4 (continued): automatic study-family deduplication.
--
-- Owner decision, 2026-08-02: recognizing that two acquired documents are
-- the same underlying study (a preprint whose journal version already
-- exists, a press release describing a paper already indexed, etc.) is
-- fully automatic -- no confirmation step -- using author overlap,
-- publication date proximity, and title similarity as signals. Text/domain
-- similarity across DIFFERENT claims (the mechanism this project already
-- rejects for corroboration) is a different thing: this is bibliographic
-- identity matching between DOCUMENTS, and it exists to PREVENT the same
-- study from being double-counted or double-drafted, not to infer that two
-- independent studies agree.
--
-- To stay safe without a human checkpoint, two invariants are enforced here:
--   1. a document that already has claims drafted from it can never become
--      a duplicate (enforced in application code in
--      src/lib/researchStudyFamily.ts, which only ever repoints a document
--      with zero claims) -- once claims exist, that document's identity as
--      the evidentiary source is immutable, same as every other approved
--      record in this schema;
--   2. duplicate_of_document_id always points directly to a primary
--      (a document whose own duplicate_of_document_id is null) -- no
--      chains. Enforced below by trigger, since a plain CHECK constraint
--      cannot reference another row.
--
-- "Bias full studies over partial ones" (owner's exact words): when two
-- documents match and neither has claims yet, the one that is not
-- abstract-only, not a preprint, and has the better computed evidence grade
-- becomes primary; the other is marked as its duplicate and is skipped for
-- claim drafting (see the processing route's pending-documents query).

alter table public.research_documents
  add column authors text[] not null default '{}'::text[],
  add column duplicate_of_document_id uuid references public.research_documents(id) on delete set null,
  add column duplicate_match_basis jsonb,
  add column duplicate_detected_at timestamptz;

alter table public.research_documents
  add constraint research_documents_duplicate_not_self
    check (duplicate_of_document_id is distinct from id);

comment on column public.research_documents.authors
is 'Normalized "surname initials" strings (or a collective/group name) parsed from PubMed AuthorList. A matching signal only -- never rendered as a byline.';
comment on column public.research_documents.duplicate_of_document_id
is 'Set automatically (never manually) when this document is detected as a republished form of the referenced primary document. Always points directly to a primary (enforced by trigger); no chains.';
comment on column public.research_documents.duplicate_match_basis
is 'Exactly which signals produced the automatic match (method, title_similarity, matched_authors, publication_year_delta). Required transparency for an edge that has no human reviewer.';
comment on column public.research_documents.duplicate_detected_at
is 'When the automatic study-family match was made.';

create index research_documents_duplicate_of_idx
  on public.research_documents (duplicate_of_document_id)
  where duplicate_of_document_id is not null;

create or replace function public.enforce_research_document_duplicate_target()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  target_is_itself_a_duplicate boolean;
begin
  if new.duplicate_of_document_id is null then
    return new;
  end if;

  select (duplicate_of_document_id is not null) into target_is_itself_a_duplicate
  from public.research_documents
  where id = new.duplicate_of_document_id;

  if target_is_itself_a_duplicate is null then
    raise exception 'duplicate_of_document_id % does not reference an existing document', new.duplicate_of_document_id;
  end if;

  if target_is_itself_a_duplicate then
    raise exception 'duplicate_of_document_id must reference a primary document (one with no duplicate_of_document_id of its own), not another duplicate';
  end if;

  return new;
end;
$$;

comment on function public.enforce_research_document_duplicate_target()
is 'Prevents duplicate_of_document_id chains: a duplicate must always point directly to a primary document.';

create trigger research_documents_duplicate_target_guard
  before insert or update of duplicate_of_document_id on public.research_documents
  for each row
  execute function public.enforce_research_document_duplicate_target();

-- Graph edge: SAME_STUDY_FAMILY. Both endpoints must already be eligible
-- research_graph_documents nodes; a duplicate link into a retracted,
-- superseded, or out-of-scope document produces no edge. This edge carries
-- no human reviewer by construction -- match_basis is its transparency
-- substitute for "review metadata", and there is no literal quote because
-- this is bibliographic identity, not an evidentiary claim.
create or replace view public.research_graph_edges_same_study_family
with (security_invoker = true) as
select
  'SAME_STUDY_FAMILY'::text as edge_type,
  d.document_id as duplicate_document_id,
  p.document_id as primary_document_id,
  raw.duplicate_match_basis as match_basis,
  raw.duplicate_detected_at as detected_at
from public.research_documents raw
join public.research_graph_documents d on d.document_id = raw.id
join public.research_graph_documents p on p.document_id = raw.duplicate_of_document_id
where raw.duplicate_of_document_id is not null;

comment on view public.research_graph_edges_same_study_family
is 'P4 graph edge: duplicate document SAME_STUDY_FAMILY primary document. Automatically matched (see match_basis), never human-reviewed -- the explorer must label it as such, not present it as a reviewed edge.';

revoke all on public.research_graph_edges_same_study_family from public, anon, authenticated;
grant select on public.research_graph_edges_same_study_family to service_role;
