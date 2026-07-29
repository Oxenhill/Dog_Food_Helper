-- Covers the Gate 2 topic-key foreign key and topic-ranked relevance reads.
create index if not exists research_document_relevance_topic_key_idx
  on public.research_document_relevance (topic_key);
