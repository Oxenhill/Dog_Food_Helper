
-- First-class, directly-queryable mirror of foods.composition_raw for the
-- staging table. payload.source_excerpt already carries this text for the
-- review screen, but a JSON path isn't something you verify a harvest run
-- against with a plain SELECT — this column is. When a contributed_foods
-- row is approved into foods, this value copies straight across.
alter table public.contributed_foods add column composition_raw text;

comment on column public.contributed_foods.composition_raw is
  'Verbatim composition/ingredients text as found on the source page, unparsed. Mirrors payload.source_excerpt as a directly-queryable column; copies straight to foods.composition_raw on approval.';
