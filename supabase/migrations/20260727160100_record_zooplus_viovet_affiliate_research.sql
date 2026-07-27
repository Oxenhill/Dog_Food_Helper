
-- Owner asked, before any ToS review of zooplus.co.uk/viovet.co.uk: do
-- either run an affiliate programme with a product feed? Answer: yes, both.
-- Recorded here as research findings only — no crawl, no ToS review, no
-- approval. tos_reviewed_at stays null for both; that decision is on hold
-- pending the owner's choice between affiliate-feed and crawl adapters.
update public.source_domain_allowlist
set notes = notes || ' | Affiliate research 2026-07-27: ' || finding
from (values
  ('zooplus.co.uk',
   'Runs an Awin affiliate programme (merchant profile ui.awin.com/merchant-profile/2940) with a product data feed reported at ~9,840 products / 100+ brands in the UK feed. A licensed Awin product feed typically carries GTIN, price and pack size per SKU — exactly the identity fields Phase 2 needs — with no scraping/ToS question, because feed use is licensed as part of joining the affiliate programme. Requires: an Awin publisher account, which in turn requires a live site/property to be approved against (Bowl does not currently run affiliate links or a monetised storefront) — an owner decision, not a technical one. Held pending that decision; not ToS-reviewed.'),
  ('viovet.co.uk',
   'Also runs an Awin affiliate programme (merchant profile ui.awin.com/merchant-profile/6960), integrated via Awin MasterTag. Product feed availability confirmed in principle (Awin supports feeds, including converting a Google Shopping feed) but specific feed contents/fields were not confirmed in this pass — would need direct confirmation after an Awin publisher account exists. Same eligibility question as zooplus: needs a live Bowl property Awin will approve. Held pending owner decision; not ToS-reviewed.')
) as findings(domain, finding)
where public.source_domain_allowlist.domain = findings.domain;
