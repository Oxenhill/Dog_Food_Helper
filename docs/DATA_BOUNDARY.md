# Data boundary: what can be published, what never can

This document exists so a future contributor — human or AI — knows which
tables are safe to export as open data and which must never leave this
database, before writing a single line of export/publication code.

## The rule

**An export reads only from the `catalogue` schema. Never from `public`
directly.**

`catalogue` is a small, curated set of read-only SQL views over `public`,
granted to a dedicated Postgres role, `catalogue_export`, which holds
`SELECT` on those six views and nothing else — no other schema, no other
table, no write access anywhere. This is enforced by a database function,
`public.assert_catalogue_export_boundary()`, run daily by `pg_cron`
alongside the existing data-integrity check
(`assert_complete_foods_have_ingredients`). If a future migration widens
`catalogue_export`'s reach, or a convenience view gets added to `catalogue`
that joins a table outside the six below, the assertion raises and the
daily cron job fails visibly (`cron.job_run_details.status = 'failed'`,
with the exact violation in `return_message`).

## Publishable: the food catalogue (intended for ODbL release)

These six tables/views hold no personal data and no data traceable to an
individual dog or owner. They describe dog food products and general
reference facts used to score them.

| `public` table | Exposed as | Notes |
|---|---|---|
| `foods` | `catalogue.foods` | All columns **except `submitted_by`** — that column is an `auth.users` id and is dropped from the view. |
| `food_ingredients` | `catalogue.food_ingredients` | All columns. No personal data present. |
| `breed_life_stage_thresholds` | `catalogue.breed_life_stage_thresholds` | Reference table. |
| `metric_minimum_lag_days` | `catalogue.metric_minimum_lag_days` | Reference table. |
| `wellness_indicator_reference` | `catalogue.wellness_indicator_reference` | Reference table. |
| `condition_contraindications` | `catalogue.condition_contraindications` | Reference table. Vet-approved clinical mappings; `created_by` is an admin's `auth.users` id but is retained because it identifies the *approver of a clinical rule*, not a dog owner or client — reconsider if this is ever a concern. |

## Never publishable: correlation, monitoring, and account data

Everything else in `public` is permanently private, by design, because it
is either directly identified to an `auth.users` account or derived from
logs tied to one:

- `dogs` — `owner_id` is a foreign key to `auth.users`.
- `dog_restrictions`, `dog_health_conditions`, `dog_baselines`,
  `dog_weight_logs`, `dog_log_entries`, `dog_food_events`,
  `dog_red_flag_events`, `dog_food_switch_analyses`,
  `dog_ingredient_suspects`, `ingredient_outcome_signals`,
  `dog_recommendation_sets` — all keyed to `dogs.id`, and through it to an
  owner.
- `user_profiles` — directly keyed to `auth.users`.
- `contributed_foods` — staged third-party submissions, not yet reviewed;
  may contain a contributor's self-reported label and is not vetted for
  publication.
- `ingredient_review_queue` — staged OCR submissions, tied to `dog_id` and
  `submitted_by`.

None of these tables — or any view over them — may ever be added to the
`catalogue` schema. `assert_catalogue_export_boundary()`'s dependency check
exists specifically to catch a future `catalogue` view that joins one of
these in, even accidentally (e.g. a "food with recent owner feedback"
convenience view).

## Why this matters more than a licensing detail

Under UK GDPR, `dog_log_entries` (or any table reachable through `dogs`)
joined back to an identified account holder is personal data. An export
written as a query against `public` that later gets extended to "just
join in a bit more context" is a realistic way to leak that. The
`catalogue` schema and `catalogue_export` role exist so that mistake is
structurally unavailable to whatever writes the export — not something an
export author has to remember every time.

## Reversing this boundary

If this decision is ever undone, the down migration is:

```sql
select cron.unschedule('assert-catalogue-export-boundary');
drop function if exists public.assert_catalogue_export_boundary();
revoke usage on schema catalogue from catalogue_export;
drop role if exists catalogue_export;
drop schema if exists catalogue cascade;
```

This was deliberately not committed as a `.down.sql` file inside
`supabase/migrations/` — a file in that directory could be picked up and
applied by tooling that walks the directory by filename, which would be
exactly backwards. Keep it here, and apply it by hand if this decision is
ever reversed.

## Status as of this session (2026-07-27)

- Nothing has been published anywhere. This session builds the boundary
  only, per the owner's explicit "boundary first" scope.
- `catalogue_export` is `NOLOGIN` — it cannot authenticate directly. It is
  a target for `SET ROLE` (from a role granted membership) or for the
  future export job to be granted `LOGIN` against, once that pipeline
  exists and needs it. Until then, nothing can actually connect as this
  role over the network.
