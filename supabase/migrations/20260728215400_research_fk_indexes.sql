-- Cover existing research foreign keys used by document supersession and
-- document-to-chunk joins. These tables are empty at Gate 1, so create the
-- indexes before ingestion rather than paying for a later backfill.

create index if not exists research_documents_superseded_by_idx
  on public.research_documents (superseded_by)
  where superseded_by is not null;

create index if not exists research_chunks_document_id_idx
  on public.research_chunks (document_id);
