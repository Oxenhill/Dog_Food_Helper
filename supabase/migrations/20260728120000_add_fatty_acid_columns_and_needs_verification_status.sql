-- Owner finding, 2026-07-28 (Royal Canin Hypoallergenic label-photo submission):
-- three declared ingredient percentages were dropped because they were printed
-- in a separate "Protein sources:" declaration sentence rather than inline
-- (a labelling pattern Royal Canin and Hill's both use, so this recurs), the
-- model appears to have fabricated a calories_per_kg figure not printed on
-- either photo, and ingredient_category was null on every row including two
-- (animal fats, minerals) that are legal *category* declarations rather than
-- specific ingredients — a food whose actual protein/fat source is legally
-- unidentified must not read as allergen-cleared.
--
-- Fatty acids the practice actually advises on for skin/coat/gut (linoleic
-- acid, EPA+DHA, total omega-3) were never captured at all.

alter table public.foods add column if not exists linoleic_acid_pct numeric;
alter table public.foods add column if not exists epa_dha_pct numeric;
alter table public.foods add column if not exists omega3_pct numeric;

comment on column public.foods.linoleic_acid_pct is
  'Linoleic acid (omega-6), % as printed in the analytical constituents / nutritional additives panel.';
comment on column public.foods.epa_dha_pct is
  'EPA+DHA combined, % as printed — labels virtually always declare these together, not separately.';
comment on column public.foods.omega3_pct is
  'Total omega-3, % as printed, when the label gives a combined figure distinct from EPA+DHA.';

-- 'needs_verification' mirrors the pattern already used for crawl_targets
-- (see 20260728100000_quarantine_acana_multiregion_rows.sql): a real,
-- queryable state for "we have data but should not treat it as trustworthy
-- yet", rather than a note bolted onto a misleadingly-plain 'complete'.
-- filterCandidateFoods() (src/lib/hardFilter.ts) already excludes any food
-- whose status is not 'complete' from the ingredient-gated candidate pool
-- when a dog needs that gate, so this alone is sufficient to stop an
-- unverified row from clearing an allergy check — no filter logic changes
-- needed.
alter table public.foods drop constraint foods_ingredient_data_status_check;
alter table public.foods add constraint foods_ingredient_data_status_check
  check (ingredient_data_status = any (array[
    'pending', 'in_progress', 'complete', 'source_unavailable',
    'identity_ambiguous', 'ambiguous_formula', 'needs_verification'
  ]));
