-- Gap found 2026-07-28: foods had zero triggers. composition_is_opaque and
-- composition_opaque_terms (20260728140000) were set once by a manual
-- backfill UPDATE. The contributed_foods approval endpoint
-- (api/admin/contributions/route.ts) predates those columns and never
-- writes them, so every future approval lands composition_is_opaque=false
-- regardless of what the ingredients actually say — a silent gap in the
-- allergen caution field. Fixed at the DB layer, not the endpoint: a second
-- application-side write path would only drift again the next time a write
-- path is added (contribute/known, admin/foods, food-ingredients/import all
-- write food_ingredients directly).
--
-- Regex pattern below is GENERATED from compositionParser.LEGAL_CATEGORY_TERMS
-- (concealsSource=true subset) via scripts/generateOpaqueTermsSql.ts — do not
-- hand-edit; rerun the generator and paste a new migration if the vocabulary
-- changes. Normalisation (paren-strip, [*†‡]-strip, trailing punctuation
-- strip) mirrors compositionParser.normalizeForMatch exactly, including the
-- asterisk/dagger strip added in the same change that produced this
-- migration (real bug: "Vegetables* **" on 3 Bakers foods failed to match
-- without it).

create or replace function public.recompute_food_composition_opacity(p_food_id uuid)
returns void
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
declare
  v_terms text[];
begin
  select array_agg(fi.ingredient_name order by fi.position_in_list)
  into v_terms
  from public.food_ingredients fi
  where fi.food_id = p_food_id
    and fi.parent_ingredient_id is null
    and lower(
          trim(
            regexp_replace(
              regexp_replace(
                regexp_replace(fi.ingredient_name, '\(.*?\)', '', 'g'),
                '[*†‡]', '', 'g'
              ),
              '[.,;]+$', ''
            )
          )
        )
        ~ '^(meat and animal derivatives|animal derivatives|fish and fish derivatives|milk and milk derivatives|molluscs and crustaceans|animal fats|cereals|derivatives of vegetable origin|vegetable protein extracts|vegetables|various sugars)s?$';

  update public.foods
  set composition_is_opaque = coalesce(array_length(v_terms, 1), 0) > 0,
      composition_opaque_terms = coalesce(v_terms, '{}')
  where id = p_food_id;
end;
$$;

comment on function public.recompute_food_composition_opacity is
  'Recomputes foods.composition_is_opaque/composition_opaque_terms for one food from its current top-level food_ingredients rows. Called by trg_food_ingredients_opacity; the regex mirrors compositionParser.concealsAnimalSource — see scripts/generateOpaqueTermsSql.ts.';

create or replace function public.trg_food_ingredients_opacity()
returns trigger
language plpgsql
security invoker
set search_path = pg_catalog, public
as $$
begin
  if tg_op = 'DELETE' then
    perform public.recompute_food_composition_opacity(old.food_id);
    return old;
  end if;

  perform public.recompute_food_composition_opacity(new.food_id);

  -- A row moved to a different food_id (or food_id changed on UPDATE) —
  -- the old parent's opacity may also have changed.
  if tg_op = 'UPDATE' and old.food_id is distinct from new.food_id then
    perform public.recompute_food_composition_opacity(old.food_id);
  end if;

  return new;
end;
$$;

drop trigger if exists trg_food_ingredients_opacity on public.food_ingredients;

create trigger trg_food_ingredients_opacity
after insert or update or delete on public.food_ingredients
for each row
execute function public.trg_food_ingredients_opacity();
