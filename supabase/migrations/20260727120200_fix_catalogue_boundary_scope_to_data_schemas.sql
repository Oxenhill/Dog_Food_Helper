-- The first live run of assert_catalogue_export_boundary() raised on its
-- own clean baseline: 194 relations in pg_catalog/information_schema
-- (Postgres's own metadata views, SELECT-to-PUBLIC by design),
-- extensions.pg_stat_statements*, and cron.job/cron.job_run_details
-- (pg_cron's own PUBLIC-readable tables) -- all Postgres/extension
-- infrastructure that is globally readable in every Postgres database by
-- design, unrelated to anything this migration touches, and present
-- before this migration ever ran.
--
-- Scanning "every schema except catalogue" was the wrong shape: it grows
-- false positives with every extension Supabase installs. Rescoped to an
-- explicit allowlist of the schemas that could plausibly hold real
-- application/personal data -- public, auth, storage, realtime -- matching
-- the same "enumerate explicitly, don't rely on an exclusion list"
-- principle already used for the view column lists. A schema added to the
-- app's data model later must be added here by hand, same as a table
-- added to catalogue.
create or replace function public.assert_catalogue_export_boundary()
returns void
language plpgsql
set search_path to ''
as $function$
declare
  offending_schema_count integer;
  offending_relation_count integer;
  offending_view_dependency_count integer;
  data_schemas constant text[] := array['public', 'auth', 'storage', 'realtime'];
begin
  -- 1. catalogue_export must hold no CREATE privilege on any data schema
  -- other than `catalogue`. USAGE is deliberately not checked: Postgres
  -- grants schema USAGE on `public` to PUBLIC by default, so every role -
  -- including catalogue_export - has it regardless of any REVOKE run
  -- against the role by name. That makes USAGE baseline noise, not a
  -- signal. CREATE is not granted to PUBLIC by default and would
  -- represent a real escalation. Actual data exposure is caught by the
  -- relation-level check below, not this one.
  select count(*) into offending_schema_count
  from pg_catalog.pg_namespace n
  where n.nspname = any(data_schemas)
    and n.nspname <> 'catalogue'
    and pg_catalog.has_schema_privilege('catalogue_export', n.nspname, 'CREATE');

  if offending_schema_count > 0 then
    raise exception 'catalogue_export boundary: role holds CREATE on % schema(s) outside the catalogue schema', offending_schema_count;
  end if;

  -- 2. catalogue_export must hold no privilege on any relation in a data
  -- schema other than `catalogue`. Uses has_table_privilege (effective
  -- privilege, including anything acquired via PUBLIC or role membership)
  -- rather than exploding relacl, which only sees grants recorded
  -- directly against the named role and would miss a PUBLIC-wide grant.
  -- Scoped to data_schemas, not "every schema": pg_catalog,
  -- information_schema, and several extensions (pg_stat_statements,
  -- pg_cron) ship PUBLIC-readable tables/views by design, and are not
  -- part of this application's data model.
  select count(*) into offending_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = any(data_schemas)
    and n.nspname <> 'catalogue'
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
