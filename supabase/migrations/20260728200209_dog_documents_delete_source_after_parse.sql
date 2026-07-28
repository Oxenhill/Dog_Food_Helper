-- Uploaded PDFs are temporary transport objects. Once text and findings have
-- been persisted, the source object is removed from Storage and this timestamp
-- records that the deletion was intentional.
alter table public.dog_documents
  alter column storage_path drop not null,
  add column source_file_deleted_at timestamptz;

comment on column public.dog_documents.source_file_deleted_at is
  'When the temporary source PDF was deleted from private Storage after successful extraction.';
