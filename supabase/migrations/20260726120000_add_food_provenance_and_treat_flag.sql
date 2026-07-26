-- Owner-submitted label photos (front + back) become foods directly after the
-- SUBMITTER confirms the extracted text — they are holding the packet, so they
-- are better placed to check an OCR result than a later reviewer who cannot see
-- it. Owner decision, 2026-07-26.
--
-- These columns record where a food's data came from, so an owner-confirmed
-- record is never indistinguishable from a scraped one.
alter table public.foods
  add column if not exists ingredient_source text not null default 'unknown',
  add column if not exists submitted_by uuid,
  -- Treats must never be recommended as a meal. Kept as a flag rather than a
  -- food_type enum value so the existing type vocabulary (raw/kibble/wet/...)
  -- still describes a treat's form, and so the recommendation candidate query
  -- can exclude them with one predicate.
  add column if not exists is_treat boolean not null default false;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'foods_ingredient_source_check'
  ) then
    alter table public.foods add constraint foods_ingredient_source_check
      check (ingredient_source in
        ('unknown', 'label_photo', 'manufacturer_page', 'admin', 'seed'));
  end if;
end $$;

create index if not exists foods_is_treat_idx on public.foods (is_treat);

comment on column public.foods.ingredient_source is
  'Where this food''s ingredient/analysis data came from. label_photo = transcribed from a packet photo and confirmed by the submitting owner.';
comment on column public.foods.submitted_by is
  'auth.users id of the owner who submitted and confirmed a label_photo record. Null for scraped/seeded rows. Nulled on account deletion.';
comment on column public.foods.is_treat is
  'True for treats/chews. Excluded from meal recommendations, but still logged and used by the correlation engine.';
