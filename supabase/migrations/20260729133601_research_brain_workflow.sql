-- In-app research-brain workflow.
--
-- Literature is discovered/imported and model-processed asynchronously, then
-- reviewed once at the global knowledge layer. Private dog report facts do not
-- enter this queue. Live recommendation requests read only active reviewed
-- knowledge and never invoke a model or embedding provider.

create table public.research_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null
    check (job_type in ('discovery', 'url_import', 'pdf_import', 'embed', 'draft_claims', 'cluster_claims')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'awaiting_selection', 'succeeded', 'failed')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  input jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  gateway_model text,
  gateway_input_tokens bigint,
  gateway_output_tokens bigint,
  gateway_cost_usd numeric(12, 6),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_ingestion_jobs_error_check
    check (status <> 'failed' or length(btrim(coalesce(error_message, ''))) > 0),
  constraint research_ingestion_jobs_cost_check
    check (gateway_cost_usd is null or gateway_cost_usd >= 0)
);

create index research_ingestion_jobs_status_idx
  on public.research_ingestion_jobs (status, created_at desc);
create index research_ingestion_jobs_requester_idx
  on public.research_ingestion_jobs (requested_by, created_at desc);

create table public.research_discovery_candidates (
  id uuid primary key default gen_random_uuid(),
  job_id uuid not null references public.research_ingestion_jobs(id) on delete cascade,
  source_name text not null,
  source_id text not null,
  pmid text,
  doi text,
  title text not null,
  candidate jsonb not null,
  selected boolean not null default false,
  imported_document_id uuid references public.research_documents(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (job_id, source_name, source_id)
);

create index research_discovery_candidates_selection_idx
  on public.research_discovery_candidates (job_id, selected, created_at);
create index research_discovery_candidates_pmid_idx
  on public.research_discovery_candidates (pmid)
  where pmid is not null;
create index research_discovery_candidates_doi_idx
  on public.research_discovery_candidates (lower(doi))
  where doi is not null;

-- Voyage 4 returns 1024 dimensions by default. Keep these vectors versioned
-- and separate from the historical OpenAI 1536-dimension chunk column so
-- vectors from different spaces can never be silently compared.
create table public.research_semantic_embeddings (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null
    check (entity_type in ('research_chunk', 'research_claim', 'research_cluster')),
  entity_id uuid not null,
  content_sha256 text not null
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  embedding_model text not null,
  embedding_dimensions smallint not null check (embedding_dimensions = 1024),
  embedding extensions.vector(1024) not null,
  created_at timestamptz not null default now(),
  unique (entity_type, entity_id, content_sha256, embedding_model)
);

create index research_semantic_embeddings_entity_idx
  on public.research_semantic_embeddings (entity_type, entity_id);
create index research_semantic_embeddings_cosine_idx
  on public.research_semantic_embeddings
  using hnsw (embedding extensions.vector_cosine_ops);

create table public.research_evidence_clusters (
  id uuid primary key default gen_random_uuid(),
  cluster_identity text not null unique
    check (cluster_identity ~ '^[0-9a-f]{64}$'),
  label text not null check (length(btrim(label)) > 0),
  subject_type text not null
    check (subject_type in ('ingredient', 'nutrient', 'ingredient_class', 'processing_method', 'biome_marker')),
  subject_value text not null check (length(btrim(subject_value)) > 0),
  outcome_type text not null
    check (outcome_type in ('condition', 'biome_marker', 'clinical_marker', 'outcome_metric', 'general_health')),
  outcome_value text not null check (length(btrim(outcome_value)) > 0),
  direction text not null
    check (direction in ('supports', 'cautions_against', 'neutral', 'insufficient_evidence')),
  cautious_summary text not null check (length(btrim(cautious_summary)) > 0),
  status text not null default 'draft'
    check (status in ('draft', 'queued_for_review', 'active', 'rejected', 'superseded')),
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  review_note text,
  created_by_job_id uuid references public.research_ingestion_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_evidence_clusters_active_review_check
    check (status <> 'active' or (reviewed_by is not null and reviewed_at is not null)),
  constraint research_evidence_clusters_rejection_note_check
    check (status <> 'rejected' or length(btrim(coalesce(review_note, ''))) > 0)
);

create index research_evidence_clusters_review_idx
  on public.research_evidence_clusters (status, created_at)
  where status in ('draft', 'queued_for_review');
create index research_evidence_clusters_subject_idx
  on public.research_evidence_clusters (subject_type, lower(subject_value));
create index research_evidence_clusters_outcome_idx
  on public.research_evidence_clusters (outcome_type, lower(outcome_value));

create table public.research_evidence_cluster_members (
  cluster_id uuid not null references public.research_evidence_clusters(id) on delete cascade,
  claim_id uuid not null references public.research_claims(id) on delete cascade,
  semantic_similarity double precision
    check (semantic_similarity is null or semantic_similarity between -1 and 1),
  relationship text not null default 'same_proposition'
    check (relationship in ('same_proposition', 'supports_context', 'contradicts', 'related_outcome')),
  independently_reviewed boolean not null default false,
  added_by_job_id uuid references public.research_ingestion_jobs(id) on delete set null,
  created_at timestamptz not null default now(),
  primary key (cluster_id, claim_id)
);

create index research_evidence_cluster_members_claim_idx
  on public.research_evidence_cluster_members (claim_id);

create table public.research_cluster_applicability (
  id uuid primary key default gen_random_uuid(),
  cluster_id uuid not null references public.research_evidence_clusters(id) on delete cascade,
  context_type text not null
    check (context_type in ('health_condition', 'document_finding', 'life_stage', 'restriction', 'outcome_metric')),
  context_key text not null check (length(btrim(context_key)) > 0),
  context_value text,
  match_operator text not null default 'exact'
    check (match_operator in ('exact', 'enum')),
  required boolean not null default true,
  created_at timestamptz not null default now(),
  unique (cluster_id, context_type, context_key, context_value)
);

create index research_cluster_applicability_runtime_idx
  on public.research_cluster_applicability (context_type, lower(context_key), lower(context_value));

alter table public.research_documents
  add column ingestion_job_id uuid references public.research_ingestion_jobs(id) on delete set null;

create index research_documents_ingestion_job_idx
  on public.research_documents (ingestion_job_id)
  where ingestion_job_id is not null;

alter table public.research_ingestion_jobs enable row level security;
alter table public.research_discovery_candidates enable row level security;
alter table public.research_semantic_embeddings enable row level security;
alter table public.research_evidence_clusters enable row level security;
alter table public.research_evidence_cluster_members enable row level security;
alter table public.research_cluster_applicability enable row level security;

revoke all on table public.research_ingestion_jobs from anon, authenticated;
revoke all on table public.research_discovery_candidates from anon, authenticated;
revoke all on table public.research_semantic_embeddings from anon, authenticated;
revoke all on table public.research_evidence_clusters from anon, authenticated;
revoke all on table public.research_evidence_cluster_members from anon, authenticated;
revoke all on table public.research_cluster_applicability from anon, authenticated;

create policy "service role manages research ingestion jobs"
  on public.research_ingestion_jobs for all to service_role
  using (true) with check (true);
create policy "service role manages research discovery candidates"
  on public.research_discovery_candidates for all to service_role
  using (true) with check (true);
create policy "service role manages research semantic embeddings"
  on public.research_semantic_embeddings for all to service_role
  using (true) with check (true);
create policy "service role manages research evidence clusters"
  on public.research_evidence_clusters for all to service_role
  using (true) with check (true);
create policy "service role manages research evidence cluster members"
  on public.research_evidence_cluster_members for all to service_role
  using (true) with check (true);
create policy "service role manages research cluster applicability"
  on public.research_cluster_applicability for all to service_role
  using (true) with check (true);

comment on table public.research_ingestion_jobs
is 'Audited in-app literature discovery/import/processing jobs. These jobs may use Gateway models, but never run inside a recommendation request.';
comment on table public.research_discovery_candidates
is 'Structured PubMed/Europe PMC candidates awaiting an explicit in-app import decision.';
comment on table public.research_semantic_embeddings
is 'Versioned Voyage semantic vectors. Historical 1536-dimensional vectors are not mixed with this 1024-dimensional space.';
comment on table public.research_evidence_clusters
is 'Human-reviewed proposition clusters: subject + outcome + direction. A cluster cannot become active without reviewer metadata.';
comment on table public.research_evidence_cluster_members
is 'Links literal, source-backed claims to proposition clusters. Membership does not imply independent corroboration.';
comment on table public.research_cluster_applicability
is 'Deterministic profile requirements for active evidence. Private report findings are matched here at runtime and are never globally reviewed.';

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'research-ingestion',
  'research-ingestion',
  false,
  20971520,
  array['application/pdf']
)
on conflict (id) do update
set
  public = excluded.public,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;
