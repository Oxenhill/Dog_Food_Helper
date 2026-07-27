
-- Secondary identity anchor for when GTIN is absent — which the Shopify
-- tier's own probe run showed is the common case, not the exception (0/300
-- Forthglade variants, 0/266 independently-checked Lily's Kitchen variants
-- had a barcode; both had a SKU on every variant). Weaker than a GTIN
-- (doesn't cross sources cleanly, it's retailer/manufacturer-specific), but
-- real, stable, and sometimes cross-referenceable via published MPN data.
alter table public.crawl_targets add column sku text;

comment on column public.crawl_targets.sku is
  'Manufacturer/retailer SKU or variant identifier from the source, verbatim. Secondary identity anchor used when gtin is null.';
