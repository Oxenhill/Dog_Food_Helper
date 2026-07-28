-- Every parsed value records its evidence route, and conflicts remain visible
-- at the finding level instead of being silently resolved.
alter table public.dog_document_findings
  add column source_kind text not null default 'text_label',
  add column review_status text not null default 'accepted';

alter table public.dog_document_findings
  add constraint dog_document_findings_source_kind_check
  check (source_kind in ('text_label', 'prose', 'chart')),
  add constraint dog_document_findings_review_status_check
  check (review_status in ('accepted', 'needs_review'));
