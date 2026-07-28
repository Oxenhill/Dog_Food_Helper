-- DECISION 4 (owner, 2026-07-28): public catalogue browse page, no login.
-- PostgREST does not expose the `catalogue` schema directly (only
-- public/graphql_public), so the app's server-side route (service role,
-- never the browser) reads through this thin public-schema wrapper
-- function, which itself selects ONLY from catalogue.foods and
-- catalogue.food_ingredients — never public.* — preserving the same
-- source_domain_allowlist exclusion and column set catalogue.foods already
-- enforces (eefe5a6, 20260728160000).
--
-- security invoker failed at runtime: service_role (the only caller — the
-- app's server-side route, never the browser) has no grant on schema
-- catalogue at all — only catalogue_export does, by design of the boundary
-- migration (20260727120000). Widening that grant would widen the boundary
-- assert_catalogue_export_boundary() exists to guard. security definer is
-- the documented exception (CLAUDE.md §9: "avoid security definer; if
-- unavoidable, document why, lock search_path, minimise grants") — owner is
-- postgres (already owns catalogue.foods), search_path is locked to
-- pg_catalog/catalogue only, and the function body is a fixed read-only
-- SELECT with no caller-supplied identifiers, so there is no injection
-- surface to lock down further. Execute is granted only to service_role.
create or replace function public.catalogue_browse_rows()
returns table (
  id uuid,
  brand text,
  name text,
  food_type text,
  is_treat boolean,
  source_url text,
  price_per_kg numeric,
  calories_per_kg numeric,
  composition_is_opaque boolean,
  composition_opaque_terms text[],
  has_ingredients boolean
)
language sql
stable
security definer
set search_path = pg_catalog, catalogue
as $$
  select
    f.id,
    f.brand,
    f.name,
    f.food_type,
    f.is_treat,
    f.source_url,
    f.price_per_kg,
    f.calories_per_kg,
    f.composition_is_opaque,
    f.composition_opaque_terms,
    exists (select 1 from catalogue.food_ingredients fi where fi.food_id = f.id) as has_ingredients
  from catalogue.foods f;
$$;

comment on function public.catalogue_browse_rows is
  'Thin public-schema wrapper the app''s server-side catalogue browse route calls, reading only from catalogue.foods/catalogue.food_ingredients. security definer (owner postgres) because service_role has no grant on schema catalogue by design — see DECISION 4, 2026-07-28.';

revoke all on function public.catalogue_browse_rows() from public;
grant execute on function public.catalogue_browse_rows() to service_role;
