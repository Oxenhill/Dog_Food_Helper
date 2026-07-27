
-- Target list of UK pet food manufacturers/suppliers, harvested from the
-- UK Pet Food (formerly PFMA) public member directory — the definitive
-- list of ~90% of the UK market, replacing guesswork about which brands
-- exist. A separate table from crawl_targets on purpose: crawl_targets is
-- product-shaped (brand + product_name + pack_size + gtin required by
-- convention), this is company-shaped. Every row starts 'unapproached' —
-- this is a list of candidates to contact or investigate, not an approval
-- of anything. Matches the source_domain_allowlist/crawl_targets pattern:
-- RLS enabled, no policies, service-role access only.
create table public.manufacturer_targets (
  id uuid primary key default gen_random_uuid(),
  company_name text not null,
  activities text[] not null default '{}',
  source_domain text not null,
  source_url text not null unique,
  website_url text,
  status text not null default 'unapproached'
    check (status = any(array['unapproached','approached','approved','declined','irrelevant'])),
  discovered_at timestamptz not null default now(),
  notes text
);
alter table public.manufacturer_targets enable row level security;

comment on table public.manufacturer_targets is
  'UK pet food manufacturer/supplier target list, harvested from public trade directories (ukpetfood.org). Every row starts unapproached — not an approval of anything, not a crawl allowlist entry.';
comment on column public.manufacturer_targets.activities is
  'Activity tags as published by the source directory (e.g. Manufacturer, Ingredient Supplier, Seller (Branded), Associate Member) — not every row is a food manufacturer.';
