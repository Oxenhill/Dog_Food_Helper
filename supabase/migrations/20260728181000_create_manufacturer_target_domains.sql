-- FOOD_DISCOVERY_DESIGN.md sec3.2 recon. One row per brand domain under a
-- manufacturer_targets company -- recon runs per domain here, never per
-- company, because one manufacturer can own multiple brand domains (Akela
-- Pet Foods Ltd -> wholeprey.com, countrykibble.com, nutriwolds.co.uk,
-- netpetshop.co.uk, discovered mid-session).

create table public.manufacturer_target_domains (
  id uuid primary key default gen_random_uuid(),
  manufacturer_target_id uuid not null references public.manufacturer_targets(id) on delete cascade,
  domain text not null,
  website_url text,
  brand_name text,
  attribution_confidence text not null default 'uncertain'
    check (attribution_confidence in ('confirmed','probable','uncertain')),
  attribution_note text,
  robots_txt_raw text,
  robots_reviewed_at timestamptz,
  terms_url text,
  terms_excerpt text check (terms_excerpt is null or length(terms_excerpt) < 8192),
  recon_status text not null default 'not_started',
  recon_notes text,
  discovered_at timestamptz not null default now(),
  unique (manufacturer_target_id, domain)
);

alter table public.manufacturer_target_domains enable row level security;

comment on table public.manufacturer_target_domains is
  'One row per brand domain under a manufacturer_targets company. Recon (robots.txt/terms) runs per row here, never per company -- a manufacturer can own multiple brand domains. attribution_confidence must be confirmed by a human before the domain can ever reach source_domain_allowlist.';
comment on column public.manufacturer_target_domains.attribution_confidence is
  'confirmed = human-verified this domain belongs to this company. probable/uncertain = discovered by automated page-read, not yet verified. Recon (robots.txt/terms fetch) may run at any confidence level. Approval to source_domain_allowlist requires confirmed.';
