-- Gate 2 relevance scores must remain attributable to the exact centroid and
-- embedding model that produced them. updated_at/evaluated_at are timestamps,
-- not reproducible versions.

alter table public.research_topic_centroids
  add column if not exists centroid_version text;

alter table public.research_document_relevance
  add column if not exists centroid_version text,
  add column if not exists embedding_model text;

-- Gate 2 applies only while both tables are empty. If rows appeared after the
-- pre-write gate, fail rather than backfilling a guessed version.
alter table public.research_topic_centroids
  alter column centroid_version set not null;

alter table public.research_document_relevance
  alter column centroid_version set not null,
  alter column embedding_model set not null;

alter table public.research_document_relevance
  add constraint research_document_relevance_topic_key_fkey
  foreign key (topic_key)
  references public.research_topic_centroids(topic_key)
  on delete cascade;

comment on column public.research_topic_centroids.centroid_version
is 'sha256 over topic_key, exact centroid_text, embedding_model, and 1536 dimensions.';

comment on column public.research_document_relevance.centroid_version
is 'Exact research_topic_centroids.centroid_version used to compute this similarity.';

comment on column public.research_document_relevance.embedding_model
is 'Exact 1536-dimension embedding model used for both document chunks and centroid.';
