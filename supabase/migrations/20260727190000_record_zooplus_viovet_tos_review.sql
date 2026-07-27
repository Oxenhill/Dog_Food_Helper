
-- Full ToS review, 2026-07-27 (both pages are JS-rendered — read via a real
-- browser, full document, not a keyword search). Neither is approved by
-- this migration; both come back restrictive. Owner fallback: permission
-- emails, same pattern as canagan/burnspet/wellbeloved — not an affiliate
-- signup, not a workaround.
update public.source_domain_allowlist
set tos_reviewed_at = now(),
    notes = notes || ' | ToS reviewed 2026-07-27: ' || finding
from (values
  ('zooplus.co.uk',
   'RESTRICTIVE — not in the "General Terms and Conditions of Business" (that page is a pure sales contract, no IP/reuse clause at all), but in the separate /info/legal/imprint page under "Copyright": "All content on this site – including all pictures, textual information, trademarks and design – are property of zooplus SE... Copying and distribution require the written consent of zooplus SE. All content is for personal information purposes only. Any further commercial or non-commercial use, in particular storage on databases, publication, duplication and any form of commercial use, as well as transfer to third parties – even in parts or revised form – without the consent of the rights holders is prohibited... The use of automatic mechanisms (such as search engines, robots and crawlers) in product services or price search engines is also subject to licensing, as well as deep-linking on content or product levels." Explicitly names robots/crawlers and database storage — the most direct hit of any domain reviewed. Recommend: do not approve without written permission.'),
  ('viovet.co.uk',
   'RESTRICTIVE — /terms-and-conditions, "Legal matters" section: "All rights, including copyright, in the content of these web pages are owned or controlled by VioVet Ltd. You are not permitted to copy, broadcast, download, store (in any medium), transmit, show or play in public, adapt or change in any way the content of these web pages for any other purpose whatsoever without the prior written permission of VioVet Ltd." Blanket prohibition on copying/storing content for any purpose, no personal-use carve-out at all (stricter in that respect than Burns/Wellbeloved). No named mention of robots/crawlers/database rights specifically, but the copy/store prohibition already covers what a crawler does. Recommend: do not approve without written permission.')
) as findings(domain, finding)
where public.source_domain_allowlist.domain = findings.domain
  and public.source_domain_allowlist.tos_reviewed_at is null;
