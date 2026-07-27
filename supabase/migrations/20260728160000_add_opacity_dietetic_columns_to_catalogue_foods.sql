-- Gap found 2026-07-28: catalogue.foods has an explicit column list
-- (eefe5a6) that predates composition_is_opaque/composition_opaque_terms
-- and dietetic_feed_claim/dietetic_feeding_duration (20260728140000).
-- Export consumers were silently missing the allergen-caution field and the
-- dietetic-claim fields. Recreated with the same source_domain allowlist
-- WHERE clause as committed in eefe5a6, unchanged.

create or replace view catalogue.foods
with (security_invoker = false)
as
select id,
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
    gtin_norm,
    composition_is_opaque,
    composition_opaque_terms,
    dietetic_feed_claim,
    dietetic_feeding_duration
from public.foods
where source_domain is null
   or source_domain not in (
      select source_domain_allowlist.domain
      from public.source_domain_allowlist
      where source_domain_allowlist.approved = false
   );

alter view catalogue.foods owner to postgres;

grant select on catalogue.foods to catalogue_export;
