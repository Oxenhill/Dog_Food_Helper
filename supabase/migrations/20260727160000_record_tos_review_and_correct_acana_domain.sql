
-- Corrects the acana.com allowlist row the same way wellbeloved.com was
-- corrected: existing foods rows were actually sourced from emea.acana.com
-- (the Mars/Champion Petfoods EMEA site), a different origin — and
-- therefore a different robots.txt/ToS — from the root acana.com (US site)
-- originally checked. acanapetfoods.co.uk (a third-party UK distributor,
-- "Bern Pet Foods Limited") is a different legal entity again and is not
-- our source; not reviewed here.
update public.source_domain_allowlist
set domain = 'emea.acana.com',
    notes = notes || ' | 2026-07-27: corrected from acana.com — foods rows were actually sourced from emea.acana.com (Mars/Champion Petfoods EU site), a distinct origin with its own robots.txt. emea.acana.com/robots.txt reviewed separately: same shape as acana.com (Allow: / except /*search?), sitemap at /en/sitemap_index.xml.'
where domain = 'acana.com'
  and notes not like '%corrected from acana.com%';

-- Terms of Service review, 2026-07-27 (owner requirement: robots_txt_checked_at
-- AND tos_reviewed_at must both be real before approved can flip to true —
-- see the gate that was previously left open with both null). None of these
-- five are approved by this migration; that stays an explicit owner decision.
update public.source_domain_allowlist
set tos_reviewed_at = now(),
    notes = notes || ' | ToS reviewed 2026-07-27: ' || finding
from (values
  ('emea.acana.com',
   'No dedicated site Terms of Use page found — only a Privacy Policy (checked directly: no "intellectual property" clause in it) and a footer with no Terms link at all. Corporate-level Mars terms may apply but were not locatable at the brand-site level. No content-reuse or database-right restriction found on the reviewed pages.'),
  ('fish4dogs.com',
   'Terms & Conditions page is entirely a sales contract (conditions of sale, returns, complaints, refund policy) — no clause on site content reuse, copyright, database rights, or scraping. No restriction found.'),
  ('burnspet.co.uk',
   'RESTRICTIVE — Terms of Service (Assisi Pet Care Ltd) explicitly claims copyright and database rights over site Content (defined to include "data compilations") and limits use to personal, non-commercial reference only: view on screen, print one copy. "You must not otherwise reproduce, modify, copy, distribute or use for commercial purposes any Content without written permission." Prohibited-use clause separately bars "making, transmitting or storing electronic copies of Content protected by copyright without permission." An ODbL-published extraction of their ingredient data plausibly breaches this — same shape as the allaboutdogfood.co.uk situation. Recommend: do not approve without written permission, same as canagan.com.'),
  ('forthglade.com',
   'Reviewed the general T&Cs (sales/competition/loyalty terms) and the separate Privacy & Security page in full — no site-content IP or reuse restriction found in either. No restriction found.'),
  ('wellbeloved.com',
   'RESTRICTIVE — Terms & Conditions clause 10 (Intellectual Property): "We are the owner or the licensee of all intellectual property rights in our site... You may print off a copy, and may download extracts, of any pages from our site for your personal reference. You must not use any part of our copyright materials or other intellectual property belonging to us for commercial purposes without first obtaining a license." Same shape as burnspet.co.uk. Recommend: do not approve without written permission.')
) as findings(domain, finding)
where public.source_domain_allowlist.domain = findings.domain
  and public.source_domain_allowlist.tos_reviewed_at is null;
