
-- Queue for verifying an owner-scanned/OCR'd GTIN against GS1's own
-- registry (Verified by GS1 / GTIN Check API), separate from the mod-10
-- checksum already enforced on foods.gtin_norm. The checksum is a cheap,
-- immediate, local sanity check ("is this a well-formed number"); this
-- queue is the slower, authoritative check ("does this number actually
-- belong to a real licensed product"), which needs a live registry call
-- and — on the free tier — is rate-limited to 30 lookups/day. Deliberately
-- asynchronous: the label-photo flow's whole design point is a same-visit
-- confirmation with no bottleneck, and a 30/day cap cannot gate that
-- synchronously. A checksum-valid GTIN is written to foods.gtin
-- immediately; this table is the backstop that raises a system_alerts row
-- if the registry later disagrees, rather than silently trusting a number
-- that merely happens to pass its own checksum.
create table public.gtin_verifications (
  id uuid primary key default gen_random_uuid(),
  gtin text not null,
  context text not null default 'label_photo',
  food_id uuid references public.foods(id),
  submitted_by uuid references auth.users(id),
  status text not null default 'pending'
    check (status = any(array['pending','verified','not_found','mismatch','failed','skipped_no_api_key'])),
  gs1_response jsonb,
  requested_at timestamptz not null default now(),
  checked_at timestamptz
);
alter table public.gtin_verifications enable row level security;

create index idx_gtin_verifications_pending
  on public.gtin_verifications (requested_at)
  where status = 'pending';

comment on table public.gtin_verifications is
  'Async queue for checking an OCR-read GTIN against GS1''s registry (Verified by GS1 / GTIN Check API), rate-limited on the free tier to 30 lookups/day. A row staying pending is normal, not a failure — overflow past the daily budget is queued, never dropped.';
comment on column public.gtin_verifications.status is
  'pending: awaiting a GS1 call. verified: GS1 confirms a real product. not_found: GS1 has no record. mismatch: GS1 record exists but disagrees with what was submitted (e.g. different brand) — see gs1_response. failed: the API call itself errored. skipped_no_api_key: no GS1 credentials configured, so this can never be checked yet.';
