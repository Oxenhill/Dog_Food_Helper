-- The research-scoring prompt now includes each food's ingredient list and
-- guaranteed-analysis panel, so a cached score is only valid for the food data
-- it was computed from. An admin editing a food's ingredients must invalidate
-- its score rather than leave a silently stale one.
--
-- The fingerprint is a SEPARATE COLUMN rather than being folded into
-- context_hash on purpose: with it folded in, every food in a request had a
-- distinct context_hash, which forced a lookup with two large IN() lists and
-- overran the PostgREST URL limit (observed live as a 400 Bad Request, which
-- the fail-soft path then reported as "not yet scored" for every food — i.e.
-- the cache would never have hit in production).
--
-- Keeping context_hash as the per-request base (one value) restores the cheap
-- `context_hash = $1 AND food_id IN (...)` lookup, and the fingerprint is
-- compared per row. Because uniqueness stays (food_id, context_hash), a
-- rescore after a food edit REPLACES the superseded row instead of
-- accumulating duplicates.
alter table public.research_score_cache
  add column if not exists food_fingerprint text not null default '';

alter table public.research_score_queue
  add column if not exists food_fingerprint text not null default '';

comment on column public.research_score_cache.food_fingerprint is
  'Hash of the food ingredients + nutrients the score was computed from. A mismatch means the food changed and the score must be recomputed.';
comment on column public.research_score_queue.food_fingerprint is
  'Food data fingerprint captured when the miss was queued, so the worker scores and files under the same data the reader expected.';
