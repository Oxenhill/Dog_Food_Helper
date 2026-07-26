-- Third-party food contributions.
--
-- Context: the catalogue is populated by two paths today — the weekly discovery
-- cron (Tier 1, auto-merged after duplicate/field checks) and owner label
-- photos (direct after the submitter confirms, because the submitter holds the
-- packet and no later reviewer could check it). Neither lets a trusted
-- non-admin add a food the catalogue has never seen.
--
-- This adds a third path: a contributor working in their own AI chat session
-- researches products, transcribes the label, and submits a batch. It is
-- deliberately the LEAST trusted of the three, for one specific reason: many
-- pet-food product pages render ingredients via JS, a plain fetch returns a
-- shell, and a model asked to transcribe a list it could not load will often
-- produce a plausible one from general knowledge. That failure is silent, and
-- it lands in the table the allergy hard filter reads.
--
-- So contributions STAGE here and never touch `foods` until an admin approves.
-- The mitigation that makes review cheap is `source_excerpt`: the verbatim
-- ingredient text as printed, stored beside the parsed list, so a reviewer
-- diffs two things on one screen instead of re-reading the product page.

-- ---------------------------------------------------------------------------
-- 1. The staging table
-- ---------------------------------------------------------------------------
create table if not exists public.contributed_foods (
  id uuid primary key default gen_random_uuid(),

  -- Denormalised out of `payload` so duplicate checks, the review listing and
  -- the unique guard below are plain SQL rather than jsonb digging.
  brand text not null,
  name text not null,
  source_url text not null,

  -- The full validated submission: food_type, the ordered ingredient list with
  -- any nested sub-ingredients, the guaranteed-analysis panel, and
  -- source_excerpt. Kept whole so approval reads exactly what was submitted,
  -- and so adding a field later needs no migration here.
  payload jsonb not null,

  -- Free-text self-identification from the contribute form. NOT an account:
  -- contributors are non-technical friends sharing one token, and issuing them
  -- logins would be ceremony with no security gain, since the token is the
  -- real boundary. This exists so a batch can be traced back to a person and
  -- a bad batch retracted wholesale.
  contributor_label text,

  status text not null default 'pending',
  review_note text,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,

  -- Set on approval. Keeps the audit trail: which catalogue row came from
  -- which submission. ON DELETE SET NULL so retiring a food does not delete
  -- the record of where it came from.
  resulting_food_id uuid references public.foods(id) on delete set null,

  created_at timestamptz not null default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'contributed_foods_status_check'
  ) then
    alter table public.contributed_foods add constraint contributed_foods_status_check
      check (status in ('pending', 'approved', 'rejected'));
  end if;
end $$;

-- Two contributors working from the same "already held" list will sometimes
-- pick the same new product. Rejecting the second at submission time is
-- friendlier than making a reviewer notice the duplicate — but only PENDING
-- rows are constrained: once something is rejected, resubmitting a corrected
-- version of the same product must stay possible.
create unique index if not exists contributed_foods_one_pending_per_product
  on public.contributed_foods (lower(brand), lower(name))
  where status = 'pending';

-- Review listing: oldest pending first.
create index if not exists contributed_foods_status_created_at
  on public.contributed_foods (status, created_at);

comment on table public.contributed_foods is
  'Staging area for third-party food submissions. Never read by the recommendation engine — rows reach `foods` only via admin approval.';
comment on column public.contributed_foods.payload is
  'The whole validated submission, including the verbatim source_excerpt a reviewer diffs the parsed ingredient list against.';
comment on column public.contributed_foods.contributor_label is
  'Self-reported contributor name. Not an identity claim and not an account — the shared token is the access boundary.';

-- ---------------------------------------------------------------------------
-- 2. RLS: fail closed
-- ---------------------------------------------------------------------------
-- No policies are created, so no anon or authenticated role can read or write
-- this table at all. Both the submit path and the review path go through the
-- service-role client in route handlers that check the contributor token or an
-- admin session respectively. A contributor has no Supabase identity, so there
-- is no role for a policy to grant to — and dog-owner accounts must never see
-- an unreviewed submission.
alter table public.contributed_foods enable row level security;

-- ---------------------------------------------------------------------------
-- 3. Provenance vocabulary
-- ---------------------------------------------------------------------------
-- `foods.ingredient_source` already distinguishes a confirmed label photo from
-- a scrape. A contributed row is neither: the data came off a manufacturer
-- page, but transcribed by a third party rather than this platform's own
-- extractor. Recording that distinction is the point of the column — without
-- it, an approved contribution becomes indistinguishable from a scrape, and a
-- later data-quality question about one contributor's batch is unanswerable.
do $$
begin
  if exists (
    select 1 from pg_constraint where conname = 'foods_ingredient_source_check'
  ) then
    alter table public.foods drop constraint foods_ingredient_source_check;
  end if;

  alter table public.foods add constraint foods_ingredient_source_check
    check (ingredient_source in
      ('unknown', 'label_photo', 'manufacturer_page', 'admin', 'seed', 'contributor'));
end $$;

comment on column public.foods.ingredient_source is
  'Where this food''s ingredient/analysis data came from. label_photo = transcribed from a packet photo and confirmed by the submitting owner. contributor = transcribed from a manufacturer page by a third-party contributor and approved by an admin (see public.contributed_foods).';
