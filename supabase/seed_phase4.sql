-- Phase 4 — RAG search function + reference
--
-- research_documents / research_chunks tables already exist (Phase 1 schema).
-- This file adds the one piece of SQL Phase 4 actually needs that can't live
-- in application code: a Postgres function wrapping the pgvector similarity
-- search, callable via supabase-js's `.rpc()`.
--
-- IMPORTANT — sample research document content is NOT seeded from this file.
-- Embeddings require calling an embedding API per chunk (see
-- src/lib/embeddingPipeline.ts's deviation note — Claude Haiku has no
-- embeddings endpoint; OpenAI/Voyage/local-fallback are used instead), and
-- pure SQL can't make that API call. The ~8 sample research_documents +
-- research_chunks rows are seeded by running:
--
--   npm run seed:phase4
--
-- (scripts/seedPhase4Research.ts — imports src/lib/embeddingPipeline.ts's
-- ingestResearchDocument() directly, so the seeded chunks get real
-- embeddings via whichever provider is configured, and are inserted with
-- review_status='approved' so they're immediately usable for RAG retrieval.)
--
-- Run this file against the Supabase project first, then run the seed script.

-- ============================================
-- match_research_chunks — vector similarity search
--
-- Filters to review_status='approved' and superseded_by is null directly in
-- SQL (defense in depth alongside the same filter in src/lib/ragRetrieval.ts)
-- so that pending/rejected documents and documents that have since been
-- superseded by a newer document can never leak into a recommendation's
-- research context, even if the application-layer filter is ever changed.
-- ============================================
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
