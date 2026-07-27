-- security_invoker = true was wrong for this use case: it makes the view
-- execute with the *querying* role's privileges on the underlying table,
-- so catalogue_export would need direct SELECT on public.foods etc to use
-- the view at all -- exactly the grant the boundary exists to avoid.
-- Proven live: `set role catalogue_export; select * from catalogue.foods`
-- failed with `permission denied for table foods`, not a row.
--
-- Switching to definer semantics (the Postgres view default): the view
-- runs with its owner's (postgres's) privileges on public.foods, and
-- catalogue_export only needs -- and only has -- SELECT on the view
-- itself. This is not the same risk profile as a SECURITY DEFINER
-- function: a view's query is bound to fixed table OIDs at CREATE VIEW
-- time (visible in pg_rewrite/pg_depend), not re-resolved against the
-- caller's search_path at query time, so there is no mutable-search-path
-- injection surface here to lock down.
alter view catalogue.foods set (security_invoker = false);
alter view catalogue.food_ingredients set (security_invoker = false);
alter view catalogue.breed_life_stage_thresholds set (security_invoker = false);
alter view catalogue.metric_minimum_lag_days set (security_invoker = false);
alter view catalogue.wellness_indicator_reference set (security_invoker = false);
alter view catalogue.condition_contraindications set (security_invoker = false);
