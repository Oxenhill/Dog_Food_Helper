
-- Full ToS review, 2026-07-27. petsathome.com's footer links only three
-- legal documents (Terms & Conditions, Privacy Policy, Cookies) — no
-- separate imprint/copyright page the way zooplus had. Read the full
-- Terms & Conditions (64KB, every section — sales/account/Easy Repeat/
-- Health Plan/reviews terms) and spot-checked Privacy Policy for absence
-- of IP content (confirmed clean, as expected for a data-protection doc).
-- Not approved by this migration — the finding is unambiguous but the
-- decision stays the owner's.
insert into public.source_domain_allowlist (domain, robots_txt_checked_at, tos_reviewed_at, approved, notes)
values (
  'petsathome.com',
  now(),
  now(),
  false,
  'robots.txt (per owner, re-verify before relying on it long-term): Allow: /, Content-Signal: ai-train=no, ai-input=yes, disallows /search* and any filters=/sortBy=/limit= URL. ' ||
  'ToS reviewed 2026-07-27, RESTRICTIVE — the clearest and most explicit prohibition of any domain reviewed this project. Main Terms & Conditions, "Ownership and Intellectual Property" section: "You shall not conduct, facilitate, authorise or permit any text or data mining or web scraping in relation to our Website or any goods or services provided via, or in relation to, our Website. This includes using (or permitting, authorising or attempting the use of): Any ''robot'', ''bot'', ''spider'', ''scraper'' or other automated device, program, tool, algorithm, code, process or methodology to access, obtain, copy, monitor or republish any portion of the Website or any data, content, information or services accessed via the same. Any automated analytical technique aimed at analysing text and data in digital form to generate information which includes but is not limited to patterns, trends and correlations." A separate clause under "Limitations" reinforces it: "You may not use the Website for: ... making, transmitting or storing electronic copies of materials protected by copyright without the permission of the owner." Also: "you may download a single copy of each piece of material contained on the Website for your own private viewing purposes only." No separate imprint/copyright/acceptable-use page exists (footer links only T&C, Privacy, Cookies) — this one document is the complete legal surface. Recommend: do not approve. Not even a permission-email candidate in the same spirit as the others — this explicitly names TDM and scraping as requiring a licence, which is a considered legal position (likely GDPR/DSM-Directive TDM-opt-out driven), not an oversight to be politely asked around.'
)
on conflict (domain) do update
set robots_txt_checked_at = excluded.robots_txt_checked_at,
    tos_reviewed_at = excluded.tos_reviewed_at,
    notes = excluded.notes
where public.source_domain_allowlist.tos_reviewed_at is null;
