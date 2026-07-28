-- Cover the two foreign-key access paths identified by the post-DDL
-- Supabase performance advisor.

create index dog_documents_dog_id_idx
  on public.dog_documents (dog_id);

drop index public.dog_document_findings_document_idx;

create index dog_document_findings_document_dog_owner_idx
  on public.dog_document_findings (document_id, dog_id, owner_id);
