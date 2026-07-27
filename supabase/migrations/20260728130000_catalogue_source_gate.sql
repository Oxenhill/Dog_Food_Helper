-- catalogue_source_gate. catalogue.foods/catalogue.food_ingredients were an
-- unfiltered passthrough over public.foods/public.food_ingredients, so every
-- row republished under ODbL regardless of source_domain_allowlist.approved.
-- 12+ rows sourced from approved=false domains (petsathome.com, canagan.com,
-- zooplus.co.uk, burnspet.co.uk, allaboutdogfood.co.uk) were exposed this way.
-- Column lists, view owner (postgres) and security_invoker=false are
-- unchanged from 20260727120000_add_catalogue_export_boundary.sql — only a
-- WHERE clause is added.

create or replace view catalogue.foods
with (security_invoker = false) as
select
  id,
  brand,
  name,
  food_type,
  suitable_age_min_months,
  suitable_age_max_months,
  suitable_size_min,
  suitable_size_max,
  price_per_kg,
  calories_per_kg,
  source_url,
  source_domain,
  last_verified_at,
  created_at,
  updated_at,
  protein_pct,
  fat_pct,
  fibre_pct,
  moisture_pct,
  ash_pct,
  phosphorus_pct,
  sodium_pct,
  calcium_pct,
  ingredient_data_status,
  product_availability_status,
  ingredient_status_reason,
  ingredient_status_checked_at,
  recipe_version_status,
  supersedes_food_id,
  ingredient_source,
  is_treat,
  gtin,
  gtin_norm
from public.foods
where source_domain is null
   or source_domain not in (
     select domain from public.source_domain_allowlist where approved = false
   );

create or replace view catalogue.food_ingredients
with (security_invoker = false) as
select
  id,
  food_id,
  ingredient_name,
  ingredient_category,
  position_in_list,
  inclusion_pct,
  note,
  parent_ingredient_id
from public.food_ingredients
where food_id in (select id from catalogue.foods);

grant select on catalogue.foods to catalogue_export;
grant select on catalogue.food_ingredients to catalogue_export;

-- New scheduled assertion: catalogue.foods must never contain a row whose
-- source_domain is approved=false. Wired into run_scheduled_assertions()
-- alongside assert_catalogue_export_boundary(), same alert-on-failure
-- pattern (system_alerts, dedup on unresolved check_name).
create or replace function public.assert_catalogue_excludes_unapproved_domains()
returns void
language plpgsql
set search_path to ''
as $function$
declare
  offending_count integer;
begin
  select count(*) into offending_count
  from catalogue.foods f
  where f.source_domain in (
    select domain from public.source_domain_allowlist where approved = false
  );

  if offending_count > 0 then
    raise exception 'catalogue_source_gate: catalogue.foods contains % row(s) sourced from an approved=false domain', offending_count;
  end if;
end;
$function$;

create or replace function public.run_scheduled_assertions()
returns void
language plpgsql
set search_path to ''
as $function$
begin
  begin
    perform public.assert_complete_foods_have_ingredients();
  exception when others then
    if not exists (
      select 1 from public.system_alerts
      where check_name = 'assert_complete_foods_have_ingredients'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values ('assert_complete_foods_have_ingredients', sqlerrm);
    end if;
  end;

  begin
    perform public.assert_catalogue_export_boundary();
  exception when others then
    if not exists (
      select 1 from public.system_alerts
      where check_name = 'assert_catalogue_export_boundary'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values ('assert_catalogue_export_boundary', sqlerrm);
    end if;
  end;

  begin
    perform public.assert_catalogue_excludes_unapproved_domains();
  exception when others then
    if not exists (
      select 1 from public.system_alerts
      where check_name = 'assert_catalogue_excludes_unapproved_domains'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values ('assert_catalogue_excludes_unapproved_domains', sqlerrm);
    end if;
  end;
end;
$function$;
