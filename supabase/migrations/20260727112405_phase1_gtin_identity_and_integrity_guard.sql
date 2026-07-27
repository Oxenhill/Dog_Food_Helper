
-- GTIN anchor, normalized to GTIN-14 so UPC-A/EAN-13/EAN-8 collide correctly.
alter table public.foods add column gtin text;

alter table public.foods add column gtin_norm text
  generated always as (
    case
      when gtin is null or regexp_replace(gtin, '\D', '', 'g') = '' then null
      else lpad(regexp_replace(gtin, '\D', '', 'g'), 14, '0')
    end
  ) stored;

create unique index foods_gtin_norm_key on public.foods (gtin_norm);

-- Mod-10 GTIN checksum, valid for GTIN-8/12/13/14 once zero-padded to 14.
-- Vectors verified before this migration: 5063334025939, 8717249776390 (EAN-13),
-- 036000291452 (UPC-A), 96385074 (EAN-8) all valid; a corrupted check digit rejected.
create or replace function public.is_valid_gtin14(gtin14 text)
returns boolean
language sql
immutable
as $$
  select gtin14 ~ '^\d{14}$'
     and ((10 - (sum(
           (case when (14 - i) % 2 = 0 then 3 else 1 end)
           * substr(gtin14, i + 1, 1)::int
         ) % 10)) % 10) = substr(gtin14, 14, 1)::int
  from generate_series(0, 12) as i;
$$;

alter table public.foods add constraint foods_gtin_checksum_valid
  check (gtin_norm is null or public.is_valid_gtin14(gtin_norm));

-- Retailer/brand harvest queue for Phase 2 crawling. Identity data only —
-- never a path into foods/food_ingredients; rows are matched by an admin.
create table public.crawl_targets (
  id uuid primary key default gen_random_uuid(),
  brand text not null,
  product_name text not null,
  pack_size text,
  gtin text,
  source_domain text not null,
  source_url text,
  discovered_at timestamptz not null default now(),
  status text not null default 'new' check (status = any(array['new','matched','ignored'])),
  matched_food_id uuid references public.foods(id)
);
alter table public.crawl_targets enable row level security;

-- Scheduled assertion: a `complete` food must have at least one food_ingredients
-- row. A synchronous trigger was considered and rejected: src/app/api/ingredients/
-- confirm/route.ts inserts the `foods` row with ingredient_data_status = 'complete'
-- in one call, then inserts food_ingredients rows in a separate, later call (rolling
-- back the food row only if that second call fails) — a trigger firing on the first
-- insert would reject that flow, which is currently the one path producing good data.
-- This scheduled check catches the same defect after the fact instead.
create extension if not exists pg_cron;

create or replace function public.assert_complete_foods_have_ingredients()
returns void
language plpgsql
as $$
declare
  offending_count integer;
begin
  select count(*) into offending_count
  from public.foods f
  where f.ingredient_data_status = 'complete'
    and not exists (select 1 from public.food_ingredients fi where fi.food_id = f.id);

  if offending_count > 0 then
    raise exception 'data integrity: % foods row(s) are ingredient_data_status = complete with zero food_ingredients rows', offending_count;
  end if;
end;
$$;

select cron.schedule(
  'assert-complete-foods-have-ingredients',
  '0 6 * * *',
  $$select public.assert_complete_foods_have_ingredients();$$
);
