-- Curated open-data boundary for the ODbL-publishable food catalogue.
--
-- Two independent boundaries in one migration:
--   1. `catalogue` schema of read-only views over the six publishable tables
--      (foods, food_ingredients, and four reference tables), granted to a
--      new `catalogue_export` role that has nothing else.
--   2. `public.assert_catalogue_export_boundary()`, a pg_cron-scheduled
--      assertion (matching `assert_complete_foods_have_ingredients`'s
--      pattern) that fails the build/alerts if a future change ever widens
--      `catalogue_export`'s reach or points a `catalogue` view at a table
--      outside the six.
--
-- `dogs`, `dog_*`, `user_profiles`, `contributed_foods` and
-- `ingredient_review_queue` are never exposed here and must never be added
-- to `catalogue` — see docs/DATA_BOUNDARY.md.

-- 1. Schema and views ---------------------------------------------------

create schema if not exists catalogue;

create view catalogue.foods
with (security_invoker = true) as
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
  -- submitted_by is deliberately excluded: it is an auth.users id and must
  -- never leave the private boundary.
from public.foods;

create view catalogue.food_ingredients
with (security_invoker = true) as
select
  id,
  food_id,
  ingredient_name,
  ingredient_category,
  position_in_list,
  inclusion_pct,
  note,
  parent_ingredient_id
from public.food_ingredients;

create view catalogue.breed_life_stage_thresholds
with (security_invoker = true) as
select
  size_category,
  senior_from_years,
  adult_from_months
from public.breed_life_stage_thresholds;

create view catalogue.metric_minimum_lag_days
with (security_invoker = true) as
select
  outcome_metric,
  minimum_lag_days
from public.metric_minimum_lag_days;

create view catalogue.wellness_indicator_reference
with (security_invoker = true) as
select
  id,
  indicator_type,
  level,
  description,
  research_document_id
from public.wellness_indicator_reference;

create view catalogue.condition_contraindications
with (security_invoker = true) as
select
  id,
  condition,
  contraindicated_ingredient,
  nutrient,
  comparator,
  threshold,
  rationale,
  source,
  approved,
  created_by,
  created_at
from public.condition_contraindications;

-- 2. Role and grants ------------------------------------------------------

do $do$
begin
  if not exists (select 1 from pg_catalog.pg_roles where rolname = 'catalogue_export') then
    create role catalogue_export nologin;
  end if;
end;
$do$;

grant usage on schema catalogue to catalogue_export;
grant select on
  catalogue.foods,
  catalogue.food_ingredients,
  catalogue.breed_life_stage_thresholds,
  catalogue.metric_minimum_lag_days,
  catalogue.wellness_indicator_reference,
  catalogue.condition_contraindications
to catalogue_export;

-- Defensive/self-documenting: catalogue_export is new and never had public
-- grants, but this makes the intent explicit and survives a future default-
-- privilege change.
revoke all on schema public from catalogue_export;

-- 3. Boundary assertion, scheduled daily alongside the existing integrity check ---

create or replace function public.assert_catalogue_export_boundary()
returns void
language plpgsql
set search_path to ''
as $function$
declare
  offending_schema_count integer;
  offending_relation_count integer;
  offending_view_dependency_count integer;
begin
  -- 1. catalogue_export must hold no CREATE privilege on any schema other
  -- than `catalogue`. USAGE is deliberately not checked: Postgres grants
  -- schema USAGE on `public` to PUBLIC by default, so every role -
  -- including catalogue_export - has it regardless of any REVOKE run
  -- against the role by name. That makes USAGE baseline noise, not a
  -- signal. CREATE is not granted to PUBLIC by default and would
  -- represent a real escalation. Actual data exposure is caught by the
  -- relation-level check below, not this one.
  select count(*) into offending_schema_count
  from pg_catalog.pg_namespace n
  where n.nspname <> 'catalogue'
    and pg_catalog.has_schema_privilege('catalogue_export', n.nspname, 'CREATE');

  if offending_schema_count > 0 then
    raise exception 'catalogue_export boundary: role holds CREATE on % schema(s) outside the catalogue schema', offending_schema_count;
  end if;

  -- 2. catalogue_export must hold no privilege on any relation outside
  -- `catalogue`. Uses has_table_privilege (effective privilege, including
  -- anything acquired via PUBLIC or role membership) rather than exploding
  -- relacl, which only sees grants recorded directly against the named
  -- role and would miss a PUBLIC-wide grant.
  select count(*) into offending_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname <> 'catalogue'
    and c.relkind in ('r', 'v', 'm', 'p', 'f')
    and pg_catalog.has_table_privilege(
      'catalogue_export', c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    );

  if offending_relation_count > 0 then
    raise exception 'catalogue_export boundary: role holds a privilege on % relation(s) outside the catalogue schema', offending_relation_count;
  end if;

  -- 3. No view in `catalogue` may depend on a table outside the six
  -- publishable tables. Walks pg_rewrite -> pg_depend -> pg_class
  -- directly, not information_schema.view_table_usage, which is filtered
  -- by the calling role's own privileges and can silently return nothing.
  select count(distinct dep_class.oid) into offending_view_dependency_count
  from pg_catalog.pg_rewrite rw
  join pg_catalog.pg_class view_class on view_class.oid = rw.ev_class
  join pg_catalog.pg_namespace view_ns on view_ns.oid = view_class.relnamespace
  join pg_catalog.pg_depend d
    on d.objid = rw.oid
   and d.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
   and d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
  join pg_catalog.pg_class dep_class on dep_class.oid = d.refobjid
  join pg_catalog.pg_namespace dep_ns on dep_ns.oid = dep_class.relnamespace
  where view_ns.nspname = 'catalogue'
    and dep_class.oid <> view_class.oid
    and not (
      dep_ns.nspname = 'public'
      and dep_class.relname = any (array[
        'foods', 'food_ingredients', 'breed_life_stage_thresholds',
        'metric_minimum_lag_days', 'wellness_indicator_reference',
        'condition_contraindications'
      ])
    );

  if offending_view_dependency_count > 0 then
    raise exception 'catalogue_export boundary: % view dependency edge(s) in the catalogue schema point at a table outside the six publishable tables', offending_view_dependency_count;
  end if;
end;
$function$;

select cron.schedule(
  'assert-catalogue-export-boundary',
  '0 6 * * *',
  'select public.assert_catalogue_export_boundary();'
);
