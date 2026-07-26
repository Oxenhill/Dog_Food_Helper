-- WS4 #5: persisted recommendation sets, so a returning owner sees their
-- recommendations without regenerating (cost + UX). Purely derived data.
create table if not exists public.dog_recommendation_sets (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  -- Nullable on purpose: mirrors dogs.owner_id, which is set to NULL when an
  -- account is deleted or a dog is removed (anonymise, never hard-erase the
  -- dog record — architecture doc §10). A set whose dog was anonymised is
  -- anonymised with it rather than left pointing at a deleted owner.
  owner_id uuid,
  generated_at timestamptz not null default now(),
  -- The full API response body as returned to the client at generation time.
  payload jsonb not null
);

create index if not exists dog_recommendation_sets_dog_generated_idx
  on public.dog_recommendation_sets (dog_id, generated_at desc);

alter table public.dog_recommendation_sets enable row level security;

-- WS3 #2: research-relevance score cache. Replaces the synchronous
-- one-Sonnet-call-per-candidate-food path in the recommendation request.
--
-- context_hash makes a cache entry exact rather than merely fresh: it is a
-- hash of the dog-profile fields the prompt actually uses plus the exact set
-- of retrieved research chunk ids. Change the approved corpus, or ask for a
-- different profile, and the hash changes, so a stale score can never be
-- served. There is no version column to keep in sync.
create table if not exists public.research_score_cache (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  context_hash text not null,
  profile_signature text not null,
  chunk_ids uuid[] not null default '{}',
  score numeric not null check (score >= 0 and score <= 1),
  summary text not null,
  model text not null,
  computed_at timestamptz not null default now(),
  unique (food_id, context_hash)
);

alter table public.research_score_cache enable row level security;

-- Work queue drained by the offline batch job. A live request never calls the
-- model; on a cache miss it enqueues here and scores 0 honestly for now.
create table if not exists public.research_score_queue (
  id uuid primary key default gen_random_uuid(),
  food_id uuid not null references public.foods(id) on delete cascade,
  context_hash text not null,
  profile_signature text not null,
  chunk_ids uuid[] not null default '{}',
  status text not null default 'pending'
    check (status in ('pending', 'submitted', 'done', 'failed')),
  batch_id text,
  requested_at timestamptz not null default now(),
  submitted_at timestamptz,
  completed_at timestamptz,
  error text,
  unique (food_id, context_hash)
);

create index if not exists research_score_queue_status_idx
  on public.research_score_queue (status, requested_at);

alter table public.research_score_queue enable row level security;

comment on table public.dog_recommendation_sets is
  'Persisted recommendation results per owner+dog. Derived/regenerable; read back on return instead of re-scoring.';
comment on table public.research_score_cache is
  'Precomputed research-relevance scores keyed by (food, context_hash). Read synchronously; written only by the offline batch job.';
comment on table public.research_score_queue is
  'Cache misses awaiting offline Batch API scoring. Never drained inside a user request.';
