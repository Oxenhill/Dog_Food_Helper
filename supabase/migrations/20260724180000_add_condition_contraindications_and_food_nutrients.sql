-- Health-condition hard-filter safety layer (owner chose BOTH mechanisms:
-- an ingredient/nutrient contraindication mapping table AND nutrient columns
-- on foods). This migration builds the MECHANISM only. The actual clinical
-- mappings and per-food nutrient values are owner/vet-gated data-entry and are
-- intentionally left empty here (never invented) — until a vet-approved row
-- exists, health-condition exclusion contributes nothing, exactly as before.
--
-- Applied to project ysffyuohwvdifvbopfcm on 2026-07-24 via the Supabase MCP
-- (migration name: add_condition_contraindications_and_food_nutrients).

-- 1) Nutrient columns on foods (guaranteed-analysis %, all nullable).
--    Existing rows stay NULL; the hard filter never excludes on a NULL value.
alter table public.foods
  add column if not exists protein_pct    numeric,
  add column if not exists fat_pct        numeric,
  add column if not exists fibre_pct      numeric,
  add column if not exists moisture_pct   numeric,
  add column if not exists ash_pct        numeric,
  add column if not exists phosphorus_pct numeric,
  add column if not exists sodium_pct     numeric,
  add column if not exists calcium_pct    numeric;

-- 2) condition_contraindications: condition -> exclusion rule. Each row is
--    EITHER an ingredient rule (exclude foods containing an ingredient) OR a
--    nutrient-threshold rule (exclude foods whose nutrient breaches a bound).
create table if not exists public.condition_contraindications (
  id                          uuid primary key default gen_random_uuid(),
  condition                   text not null,  -- matched case-insensitively vs dog_health_conditions.condition
  contraindicated_ingredient  text,           -- ingredient substring (ilike), OR
  nutrient                    text,           -- a foods nutrient column, with:
  comparator                  text,           --   one of > >= < <=
  threshold                   numeric,
  rationale                   text,           -- clinical explanation (transparency / review UI)
  source                      text,           -- citation
  approved                    boolean not null default false, -- ONLY approved rows affect the hard filter
  created_by                  uuid,
  created_at                  timestamptz default now(),
  constraint condition_contra_one_mechanism check (
    (contraindicated_ingredient is not null
      and nutrient is null and comparator is null and threshold is null)
    or
    (contraindicated_ingredient is null
      and nutrient is not null and comparator is not null and threshold is not null)
  ),
  constraint condition_contra_valid_comparator check (
    comparator is null or comparator in ('>', '>=', '<', '<=')
  ),
  constraint condition_contra_valid_nutrient check (
    nutrient is null or nutrient in (
      'protein_pct','fat_pct','fibre_pct','moisture_pct',
      'ash_pct','phosphorus_pct','sodium_pct','calcium_pct'
    )
  )
);

create index if not exists idx_condition_contra_condition
  on public.condition_contraindications (lower(condition));

-- 3) RLS: internal clinical reference data. The app reads it only via the
--    service-role client (supabaseAdmin), so enable RLS with no anon/auth
--    policy (deny-all to public keys), matching source_domain_allowlist.
alter table public.condition_contraindications enable row level security;

comment on table public.condition_contraindications is
  'Vet-approved condition -> contraindication rules for the deterministic hard filter. approved=false rows are ignored by src/lib/hardFilter.ts. Clinical mappings must not be machine-generated.';
