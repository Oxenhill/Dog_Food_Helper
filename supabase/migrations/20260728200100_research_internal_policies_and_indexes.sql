-- Follow-up from Supabase advisors: make internal-table intent explicit and
-- cover claim foreign keys used by deletes/reviewer lookups.

create policy "service role manages research topic centroids"
  on public.research_topic_centroids
  for all
  to service_role
  using (true)
  with check (true);

create policy "service role manages research document relevance"
  on public.research_document_relevance
  for all
  to service_role
  using (true)
  with check (true);

create index if not exists research_claims_chunk_idx
  on public.research_claims (chunk_id);

create index if not exists research_claims_reviewed_by_idx
  on public.research_claims (reviewed_by)
  where reviewed_by is not null;
