
-- Verbatim composition/ingredients string as printed on the label or retailer
-- page, before any parsing. The disk raw-HTML cache stops a parser fix from
-- requiring a re-crawl; this column is the database-side analogue — it lets
-- the fixture corpus for parse_composition() grow from real captured strings,
-- and it is itself the single most independently-checkable fact in an
-- eventual ODbL export (a reader can compare it against the packet).
-- Never normalized, never truncated, never inferred.
alter table public.foods add column composition_raw text;

comment on column public.foods.composition_raw is
  'Verbatim composition/ingredients string as printed on the source label or page, unparsed. Source of truth for food_ingredients and the parse_composition() fixture corpus.';
