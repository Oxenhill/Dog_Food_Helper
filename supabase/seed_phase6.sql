-- Phase 6 reference data seed
-- Seeds source_domain_allowlist with real UK dog food brand domains, marked
-- approved=true per the phase spec's explicit instruction ("you'll need to
-- populate source_domain_allowlist with real UK dog food brands... and mark
-- them approved=true").
--
-- IMPORTANT (flagged, not silently skipped): approved=true is meant to mean
-- "robots.txt and ToS have been reviewed and this domain may be scraped" per
-- architecture doc §7/§11. robots_txt_checked_at/tos_reviewed_at are left
-- NULL here — no actual robots.txt/ToS review was performed in this coding
-- session (no browsing of each brand's live robots.txt/ToS took place). Per
-- the phase prompt's own caveat ("Phase 6 focuses on the job structure, not
-- the full scraping compliance suite"), these rows are seeded so the job has
-- something to iterate over end-to-end, but a real compliance review of each
-- domain's robots.txt/ToS should happen before this runs against production
-- traffic — see BUILD_PROGRESS.md "Needs owner input".

insert into source_domain_allowlist (domain, approved, notes) values
  ('canagan.com', true, 'Phase 6 seed — robots.txt/ToS not yet reviewed, see BUILD_PROGRESS.md'),
  ('acana.com', true, 'Phase 6 seed — robots.txt/ToS not yet reviewed, see BUILD_PROGRESS.md'),
  ('burnspet.co.uk', true, 'Phase 6 seed — robots.txt/ToS not yet reviewed, see BUILD_PROGRESS.md'),
  ('fish4dogs.com', true, 'Phase 6 seed — robots.txt/ToS not yet reviewed, see BUILD_PROGRESS.md'),
  ('jameswellbeloved.com', true, 'Phase 6 seed — robots.txt/ToS not yet reviewed, see BUILD_PROGRESS.md'),
  ('forthglade.com', true, 'Phase 6 seed — robots.txt/ToS not yet reviewed, see BUILD_PROGRESS.md')
on conflict (domain) do update set approved = excluded.approved, notes = excluded.notes;
