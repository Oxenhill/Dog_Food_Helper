alter table public.manufacturer_target_domains
  add column locale_status text not null default 'unverified'
    check (locale_status in ('uk_specific','multi_region','unverified'));

comment on column public.manufacturer_target_domains.locale_status is
  'multi_region = bare .com/international brand or country-selector site. No composition may ever be taken from a multi_region domain until a UK pack or UK retailer listing confirms the formulation -- the ACANA precedent (13 crawl_targets + 4 contributed_foods quarantined).';
