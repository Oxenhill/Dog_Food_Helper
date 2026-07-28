-- Resolves assert_catalogue_export_boundary: catalogue.foods depended on
-- public.source_domain_allowlist (not one of the six publishable tables),
-- and catalogue.food_ingredients depended on catalogue.foods (a
-- catalogue-on-catalogue edge, also flagged). Both removed by giving
-- public.foods its own boolean, trigger-maintained from
-- source_domain_allowlist, so catalogue.foods filters on its own column
-- with no cross-schema/cross-view dependency.

alter table public.foods add column source_is_publishable boolean not null default true;

update public.foods
set source_is_publishable = (
  source_domain is null
  or not exists (
    select 1 from public.source_domain_allowlist a
    where a.domain = foods.source_domain and a.approved = false
  )
);

create or replace function public.foods_recompute_source_is_publishable()
returns trigger
language plpgsql
set search_path to ''
as $$
begin
  new.source_is_publishable := (
    new.source_domain is null
    or not exists (
      select 1 from public.source_domain_allowlist a
      where a.domain = new.source_domain and a.approved = false
    )
  );
  return new;
end;
$$;

drop trigger if exists trg_foods_recompute_source_is_publishable on public.foods;
create trigger trg_foods_recompute_source_is_publishable
before insert or update of source_domain on public.foods
for each row execute function public.foods_recompute_source_is_publishable();

create or replace function public.propagate_source_domain_allowlist_change()
returns trigger
language plpgsql
set search_path to ''
as $$
declare
  affected_domain text;
begin
  affected_domain := coalesce(new.domain, old.domain);
  update public.foods
  set source_is_publishable = (
    source_domain is null
    or not exists (
      select 1 from public.source_domain_allowlist a
      where a.domain = foods.source_domain and a.approved = false
    )
  )
  where source_domain = affected_domain;
  return coalesce(new, old);
end;
$$;

drop trigger if exists trg_propagate_source_domain_allowlist_change on public.source_domain_allowlist;
create trigger trg_propagate_source_domain_allowlist_change
after insert or update of approved or delete on public.source_domain_allowlist
for each row execute function public.propagate_source_domain_allowlist_change();

create or replace view catalogue.foods as
 select id, brand, name, food_type, suitable_age_min_months, suitable_age_max_months,
    suitable_size_min, suitable_size_max, price_per_kg, calories_per_kg, source_url,
    source_domain, last_verified_at, created_at, updated_at, protein_pct, fat_pct,
    fibre_pct, moisture_pct, ash_pct, phosphorus_pct, sodium_pct, calcium_pct,
    ingredient_data_status, product_availability_status, ingredient_status_reason,
    ingredient_status_checked_at, recipe_version_status, supersedes_food_id,
    ingredient_source, is_treat, gtin, gtin_norm, composition_is_opaque,
    composition_opaque_terms, dietetic_feed_claim, dietetic_feeding_duration
   from public.foods
  where source_is_publishable;

create or replace view catalogue.food_ingredients as
 select id, food_id, ingredient_name, ingredient_category, position_in_list,
    inclusion_pct, note, parent_ingredient_id
   from public.food_ingredients
  where food_id in (select id from public.foods where source_is_publishable);
