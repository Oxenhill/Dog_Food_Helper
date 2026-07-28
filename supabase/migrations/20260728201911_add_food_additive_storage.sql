-- Option A: additives remain in food_ingredients so the deterministic allergy
-- and contraindication queries see them without a second safety-path query.
-- They are not composition/prevalence ingredients: position_in_list is null
-- and additive_sequence preserves only order within the printed additives panel.
-- additive_category_printed preserves the label's exact heading; the normalized
-- ingredient_category never replaces that source wording.

alter table public.food_ingredients
  alter column position_in_list drop not null,
  add column if not exists additive_sequence integer,
  add column if not exists additive_category_printed text;

alter table public.food_ingredients
  drop constraint if exists food_ingredients_additive_sequence_positive;
alter table public.food_ingredients
  add constraint food_ingredients_additive_sequence_positive
  check (additive_sequence is null or additive_sequence > 0);

alter table public.food_ingredients
  drop constraint if exists food_ingredients_additive_shape;
alter table public.food_ingredients
  add constraint food_ingredients_additive_shape
  check (
    (
      additive_sequence is not null
      and position_in_list is null
      and parent_ingredient_id is null
      and ingredient_category in (
        'additive',
        'additive_nutritional',
        'additive_sensory',
        'additive_technological',
        'additive_antioxidant'
      )
      and additive_category_printed is not null
      and btrim(additive_category_printed) <> ''
    )
    or
    (
      additive_sequence is null
      and (
        ingredient_category not in (
          'additive_nutritional',
          'additive_sensory',
          'additive_technological',
          'additive_antioxidant'
        )
        or ingredient_category is null
      )
    )
  );

create unique index if not exists food_ingredients_additive_sequence_unique
  on public.food_ingredients (food_id, additive_sequence)
  where additive_sequence is not null;

comment on column public.food_ingredients.position_in_list is
  'Parent-scoped prevalence order for composition ingredients. Null for separately declared additive-panel rows.';
comment on column public.food_ingredients.additive_sequence is
  '1-based printed order within the additives panel. Null for composition ingredients; never a prevalence rank.';
comment on column public.food_ingredients.additive_category_printed is
  'Exact additive category/function heading printed on the source label. Never inferred.';

-- The opacity trigger is a prevalence-list consumer. Exclude unranked additive
-- rows explicitly rather than relying on their names not matching its regex.
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
    and fi.position_in_list is not null
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

-- Keep the owner-facing unified read shape honest: prevalence-ranked
-- composition ingredients and additive-panel declarations are separate arrays.
create or replace view public.food_full as
select
  f.id,
  f.brand,
  f.name,
  f.food_type,
  f.suitable_age_min_months,
  f.suitable_age_max_months,
  f.suitable_size_min,
  f.suitable_size_max,
  f.price_per_kg,
  f.calories_per_kg,
  f.protein_pct,
  f.fat_pct,
  f.fibre_pct,
  f.moisture_pct,
  f.ash_pct,
  f.phosphorus_pct,
  f.sodium_pct,
  f.calcium_pct,
  case
    when f.protein_pct is not null
      and f.fat_pct is not null
      and f.fibre_pct is not null
      and f.moisture_pct is not null
      and f.ash_pct is not null
    then greatest(
      0::numeric,
      round(100::numeric - (
        f.protein_pct + f.fat_pct + f.fibre_pct + f.moisture_pct + f.ash_pct
      ), 1)
    )
    else null::numeric
  end as est_digestible_carbohydrate_pct,
  f.source_url,
  f.source_domain,
  f.last_verified_at,
  f.created_at,
  f.updated_at,
  coalesce(counts.total_ingredients, 0::bigint) as ingredient_count,
  coalesce(ing.ingredients, '[]'::jsonb) as ingredients,
  f.ingredient_data_status,
  f.product_availability_status,
  f.ingredient_status_reason,
  f.ingredient_status_checked_at,
  f.recipe_version_status,
  f.supersedes_food_id,
  coalesce(adds.additives, '[]'::jsonb) as additives
from public.foods f
left join lateral (
  select count(*) as total_ingredients
  from public.food_ingredients a
  where a.food_id = f.id
    and a.parent_ingredient_id is null
    and a.position_in_list is not null
) counts on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'position', t.position_in_list,
      'name', t.ingredient_name,
      'category', t.ingredient_category,
      'inclusion_pct', t.inclusion_pct,
      'note', t.note,
      'sub_ingredients', coalesce(sub.subs, '[]'::jsonb)
    )
    order by t.position_in_list
  ) as ingredients
  from public.food_ingredients t
  left join lateral (
    select jsonb_agg(
      jsonb_build_object(
        'position', s.position_in_list,
        'name', s.ingredient_name,
        'category', s.ingredient_category,
        'inclusion_pct', s.inclusion_pct,
        'note', s.note
      )
      order by s.position_in_list
    ) as subs
    from public.food_ingredients s
    where s.parent_ingredient_id = t.id
  ) sub on true
  where t.food_id = f.id
    and t.parent_ingredient_id is null
    and t.position_in_list is not null
) ing on true
left join lateral (
  select jsonb_agg(
    jsonb_build_object(
      'sequence', a.additive_sequence,
      'name', a.ingredient_name,
      'category', a.ingredient_category,
      'printed_category', a.additive_category_printed,
      'note', a.note
    )
    order by a.additive_sequence
  ) as additives
  from public.food_ingredients a
  where a.food_id = f.id
    and a.additive_sequence is not null
) adds on true;

create or replace view catalogue.food_ingredients as
select
  id,
  food_id,
  ingredient_name,
  ingredient_category,
  position_in_list,
  inclusion_pct,
  note,
  parent_ingredient_id,
  additive_sequence,
  additive_category_printed
from public.food_ingredients
where food_id in (
  select id from public.foods where source_is_publishable
);
