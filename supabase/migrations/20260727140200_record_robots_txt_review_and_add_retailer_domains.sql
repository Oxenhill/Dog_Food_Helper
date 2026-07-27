
-- Records real robots.txt review dates and findings for Phase 2 domain
-- due-diligence. Does NOT set approved = true for anything — that stays an
-- explicit per-domain owner decision (see BUILD_PROGRESS.md). tos_reviewed_at
-- is deliberately left null: this migration only covers the robots.txt read,
-- not a Terms of Service review.

-- jameswellbeloved.com does not resolve (DNS NXDOMAIN) — the brand's live
-- site is wellbeloved.com (matches foods.source_url for the one food already
-- sourced from it). Correct the domain on file rather than review a dead one.
update public.source_domain_allowlist
set domain = 'wellbeloved.com'
where domain = 'jameswellbeloved.com';

update public.source_domain_allowlist
set robots_txt_checked_at = now(),
    notes = notes || ' | robots.txt reviewed 2026-07-27: ' || finding
from (values
  ('acana.com', 'User-agent: * Allow: /, only /*search? disallowed. No crawl-delay, no Content-Signal. Sitemap at /en-US/sitemap_index.xml.'),
  ('burnspet.co.uk', 'Shopify storefront, generic Allow with standard admin/cart/checkout/account disallows and filter-parameter crawl-trap blocks. No crawl-delay for generic UA, no Content-Signal. Sitemap at /sitemap.xml. Also publishes /agents.md with an agent-specific policy — not yet reviewed.'),
  ('canagan.com', 'Generic UA allowed except checkout/basket/login/filter-sort paths. ~20 named bots (incl. ClaudeBot, PerplexityBot) fully disallowed under their own listed User-agent block — does not affect a generically-identified crawler. No Content-Signal. Sitemap at /sitemap_index.xml.'),
  ('fish4dogs.com', 'Generic UA disallowed on 5 paths only (search, checkout, customer, one product page, one directory). No crawl-delay, no Content-Signal. Sitemap at /fish4dogs-sitemap/sitemap.xml.'),
  ('forthglade.com', 'Shopify storefront, generic Allow with standard admin/cart/checkout/account/filter-sort disallows. Crawl-delay 10s applies only to named bots (AhrefsBot, MJ12bot), 1s to Pinterest — none apply to a generic UA. No Content-Signal. Two sitemaps: /sitemap.xml and /ai-sitemap.xml.'),
  ('wellbeloved.com', 'Generic UA disallowed on checkout/search/sort/review-submission paths and a couple of admin-ish paths; large legacy blocklist of scraping tools (WebZip, Wget, etc.), not us. No crawl-delay, no Content-Signal. Three product/department/list sitemap indexes.')
) as findings(domain, finding)
where public.source_domain_allowlist.domain = findings.domain;

insert into public.source_domain_allowlist (domain, robots_txt_checked_at, approved, notes)
values
  ('zooplus.co.uk', now(), false,
   'robots.txt reviewed 2026-07-27: blocks /ov? and *detailedQuestion.htm$ for all crawlers; Crawl-delay 5 applies to bingbot/msnbot only (applying 5s to ourselves regardless, per project instructions), ia_archiver fully disallowed. No Content-Signal. Sitemap at /sitemap.xml. Carries GTINs — primary Phase 2 identity source. Awaiting owner approval before first crawl.'),
  ('viovet.co.uk', now(), false,
   'robots.txt reviewed 2026-07-27: generic UA disallows /api/, /tuhq/, account/checkout/basket paths and a few parameterised patterns; product/category pages open. ClaudeBot gets an explicit Crawl-delay: 1. No Content-Signal. Sitemap index at /sitemaps/index.xml. Second Phase 2 identity source. Awaiting owner approval before first crawl.')
on conflict (domain) do update
set robots_txt_checked_at = excluded.robots_txt_checked_at,
    notes = excluded.notes;
