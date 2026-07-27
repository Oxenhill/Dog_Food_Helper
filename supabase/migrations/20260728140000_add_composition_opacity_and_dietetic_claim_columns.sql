-- Opacity WARNS, never blocks — a boolean can't tell "one opaque term
-- covering ~96% of the food" (Bakers) from "one opaque term on the fat line
-- only, with both proteins named and hydrolysed" (Royal Canin
-- Hypoallergenic). composition_opaque_terms carries the actual matched
-- ingredient_name strings so the UI can say what's unnamed without the app
-- deciding for the owner whether that matters for their dog.
--
-- Matches only the concealsSource subset of compositionParser's
-- LEGAL_CATEGORY_TERMS (mirrors src/lib/compositionParser.ts
-- concealsAnimalSource() exactly) against top-level food_ingredients rows
-- (parent_ingredient_id is null) — a named child under a category row
-- doesn't make the category itself less opaque about the REST of that
-- category's undeclared share.
alter table public.foods add column composition_is_opaque boolean not null default false;
alter table public.foods add column composition_opaque_terms text[] not null default '{}';

comment on column public.foods.composition_is_opaque is
  'True when at least one top-level ingredient is a legal category that can conceal a specific protein/animal-derived source (see compositionParser.concealsAnimalSource). Informational only — must never gate or rank down a food; see hardFilter.ts and the recommendation card for why.';
comment on column public.foods.composition_opaque_terms is
  'Verbatim ingredient_name strings of the matched opaque top-level rows, in label order. Empty when composition_is_opaque is false.';

update public.foods f
set composition_is_opaque = true,
    composition_opaque_terms = sub.terms
from (
  select fi.food_id, array_agg(fi.ingredient_name order by fi.position_in_list) as terms
  from public.food_ingredients fi
  where fi.parent_ingredient_id is null
    and lower(regexp_replace(trim(regexp_replace(fi.ingredient_name, '\(.*?\)', '', 'g')), '[.,;]+$', ''))
        ~ '^(meat and animal derivatives|animal derivatives|fish and fish derivatives|milk and milk derivatives|molluscs and crustaceans|animal fats|cereals|derivatives of vegetable origin|vegetable protein extracts|vegetables|various sugars)s?$'
  group by fi.food_id
) sub
where sub.food_id = f.id;

-- Schema for item 8 (dietetic/veterinary feed claims) — columns only, no
-- logic attached yet. "Prescription diet" is a marketing term used
-- inconsistently across brands, not a legal category with a fixed meaning;
-- storing the label's own wording verbatim avoids the app asserting a
-- clinical claim it can't verify.
alter table public.foods add column dietetic_feed_claim text;
alter table public.foods add column dietetic_feeding_duration text;

comment on column public.foods.dietetic_feed_claim is
  'The dietetic/veterinary feed claim exactly as printed on the label (e.g. "Complementary dietetic feed for dogs..."), or null if the label makes none. Informational only — never a filter, never a gate. "Prescription diet" is a marketing term, not a legal category.';
comment on column public.foods.dietetic_feeding_duration is
  'The label''s own stated feeding duration/period for a dietetic claim (e.g. "up to 6 months, or as advised by your vet"), verbatim, or null. Informational only — never a filter, never a gate.';
