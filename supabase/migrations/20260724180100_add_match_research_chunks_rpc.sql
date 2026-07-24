-- match_research_chunks — pgvector similarity search wrapper for RAG retrieval
-- (Phase 4). This function was defined in supabase/seed_phase4.sql but had
-- never been applied to the live project, which is why POST /api/recommendations
-- 500'd before retrieveResearchFor() was made fail-soft. Applying it so RAG
-- retrieval works end-to-end once research is seeded. Filters to approved,
-- non-superseded documents in SQL (defense in depth with ragRetrieval.ts).
--
-- Applied to project ysffyuohwvdifvbopfcm on 2026-07-24 via the Supabase MCP
-- (migration name: add_match_research_chunks_rpc).
create or replace function match_research_chunks(
  query_embedding vector(1536),
  match_count int default 5
)
returns table (
  chunk_id uuid,
  document_id uuid,
  content text,
  chunk_index int,
  similarity float,
  topic research_topic,
  source_url text,
  title text,
  review_status review_status
)
language sql
stable
as $$
  select
    rc.id as chunk_id,
    rc.document_id,
    rc.content,
    rc.chunk_index,
    1 - (rc.embedding <=> query_embedding) as similarity,
    rd.topic,
    rd.source_url,
    rd.title,
    rd.review_status
  from research_chunks rc
  join research_documents rd on rd.id = rc.document_id
  where rd.review_status = 'approved'
    and rd.superseded_by is null
  order by rc.embedding <=> query_embedding
  limit match_count;
$$;
