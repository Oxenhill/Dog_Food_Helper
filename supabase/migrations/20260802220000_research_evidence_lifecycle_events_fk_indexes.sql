-- Covering indexes for the three foreign keys on research_evidence_lifecycle_events
-- flagged by the performance advisor after the P5 migration (INFO level,
-- non-blocking, low-volume append-only table). Matches this project's
-- established pattern of dedicated fk-index cleanup migrations
-- (e.g. research_fk_indexes.sql). Applied to production
-- ysffyuohwvdifvbopfcm immediately after P5 (2026-08-02).

create index if not exists research_evidence_lifecycle_events_promoted_primary_idx
  on public.research_evidence_lifecycle_events (promoted_primary_document_id)
  where promoted_primary_document_id is not null;

create index if not exists research_evidence_lifecycle_events_actor_idx
  on public.research_evidence_lifecycle_events (actor_id)
  where actor_id is not null;

create index if not exists research_evidence_lifecycle_events_replacement_document_idx
  on public.research_evidence_lifecycle_events (replacement_document_id)
  where replacement_document_id is not null;
