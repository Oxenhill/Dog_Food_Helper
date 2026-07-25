-- Applied live to project ysffyuohwvdifvbopfcm on 2026-07-25.
-- 1. Full-label detail on food_ingredients (percentages, qualifiers, compound
--    ingredients). All additive + nullable; existing rows unaffected.
-- 2. A unified read view (food_full) presenting each food as one record with its
--    ingredients nested, so the whole food can be read in one place while the
--    normalised tables keep serving the allergy filter and correlation engine.

alter table public.food_ingredients
  add column if not exists inclusion_pct numeric,
  add column if not exists note text,
  add column if not exists parent_ingredient_id uuid
    references public.food_ingredients(id) on delete cascade;

create index if not exists food_ingredients_parent_idx
  on public.food_ingredients (parent_ingredient_id)
  where parent_ingredient_id is not null;

alter table public.food_ingredients
  drop constraint if exists food_ingredients_inclusion_pct_range;
alter table public.food_ingredients
  add constraint food_ingredients_inclusion_pct_range
  check (inclusion_pct is null or (inclusion_pct >= 0 and inclusion_pct <= 100));

-- See the applied migration `add_food_full_unified_view` for the full view body.
