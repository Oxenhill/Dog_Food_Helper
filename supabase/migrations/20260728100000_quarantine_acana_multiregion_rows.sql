
-- Owner finding, 2026-07-28: emea.acana.com's JSON-LD brand field being
-- wrong on every product ("Droogvoer voor honden" — Dutch for "dry dog
-- food") isn't just a bad label, it's evidence the site serves multiple
-- regions from one domain (/en/, /fr-FR/, /de-DE/, /nl-NL/... confirmed in
-- the sitemap walk). That means the composition text captured for the
-- English-language page is not guaranteed to be the UK formulation — EU
-- recipes can legally differ from UK ones. Wrong ingredients attached to a
-- UK product in a UK allergen database is a safety risk, not a labelling
-- inconvenience. Quarantined pending human verification against a UK pack
-- or UK retailer listing. Checked fish4dogs.com for the same shape
-- separately (no hreflang tags, no locale-prefixed URLs, no alternate-
-- market links, single GBP price, lang="en") — confirmed single-region,
-- not affected.

-- crawl_targets: add a general-purpose notes column (mirrors the pattern
-- already used on source_domain_allowlist) and widen the status check
-- constraint so "needs_verification" is a real, queryable state rather
-- than a note attached to a misleadingly-plain "new".
alter table public.crawl_targets add column notes text;

alter table public.crawl_targets drop constraint crawl_targets_status_check;
alter table public.crawl_targets add constraint crawl_targets_status_check
  check (status = any(array['new','needs_verification','matched','ignored']));

update public.crawl_targets
set status = 'needs_verification',
    notes = 'QUARANTINED 2026-07-28: emea.acana.com is a confirmed multi-region site (/en/, /fr-FR/, /de-DE/, /nl-NL/ mirrors of the same product). The JSON-LD brand field is wrong on every row from this domain, which is what surfaced the multi-region risk. Composition captured from the English-language page is not guaranteed to be the UK formulation. Do not match/approve without verifying brand, identity and composition against a real UK pack or UK retailer listing first.'
where source_domain = 'emea.acana.com';

-- contributed_foods: the actual composition-risk rows. review_note already
-- exists for exactly this purpose (surfaced on the admin review screen).
update public.contributed_foods
set review_note = 'QUARANTINED 2026-07-28: source is emea.acana.com, a confirmed multi-region site. This composition text may be the EU formulation, not the UK one — verify against a real UK pack or UK retailer listing before approving. Do not approve on the strength of the crawl alone.'
where source_url like '%emea.acana.com%'
  and status = 'pending';
