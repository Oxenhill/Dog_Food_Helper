
-- ukpetfood.org (UK Pet Food, formerly PFMA — the trade association whose
-- member-listing page is the target for the manufacturer target-list
-- harvest). robots.txt contains no User-agent/Disallow/Allow/Sitemap rules
-- at all — only an unpopulated Content-Signal explainer comment (defines
-- what search/ai-input/ai-train would mean if set, but sets none of them —
-- per its own rule (c), an unset signal "neither grants nor restricts").
-- No privacy policy, cookie policy, terms, or any other legal page exists
-- anywhere on the site (checked footer links and site-wide anchor scan —
-- zero matches for privacy/cookie/terms/legal/copyright). Approved: nothing
-- restricts it, and the target is a public membership directory (company
-- names), not creative or database-right content.
insert into public.source_domain_allowlist (domain, robots_txt_checked_at, tos_reviewed_at, approved, notes)
values (
  'ukpetfood.org',
  now(),
  now(),
  true,
  'robots.txt reviewed 2026-07-27: no Disallow/Allow/Sitemap rules at all, only an unpopulated Content-Signal preamble (defines the framework, sets no values). ToS reviewed 2026-07-27: no legal page of any kind exists on the site (footer has no privacy/terms/cookie link; site-wide anchor scan for privacy/cookie/terms/legal/copyright returned zero matches). Approved for harvesting the public member-listing page only (company names/websites — a trade directory, not creative or database-right content).'
)
on conflict (domain) do update
set robots_txt_checked_at = excluded.robots_txt_checked_at,
    tos_reviewed_at = excluded.tos_reviewed_at,
    approved = excluded.approved,
    notes = excluded.notes
where public.source_domain_allowlist.tos_reviewed_at is null;
