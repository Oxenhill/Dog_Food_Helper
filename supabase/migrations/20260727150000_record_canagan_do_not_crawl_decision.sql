
-- Owner decision 2026-07-27: canagan.com's robots.txt explicitly disallows
-- ~20 named crawlers (including ClaudeBot) under their own listed
-- User-agent block. Routing around that with a generic UA would technically
-- comply with the letter of robots.txt while defeating its evident intent —
-- unacceptable for a dataset this project intends to publish openly. Do not
-- crawl, do not approve. Owner will email the brand to ask permission
-- instead of scraping around the block.
-- Idempotent: the note may already have been appended via a direct query
-- in the same session this migration documents; guard against double-append.
update public.source_domain_allowlist
set notes = notes || ' | 2026-07-27: owner decision — do not crawl, do not approve. Blocks ~20 named crawlers incl. ClaudeBot under their own explicit User-agent block; using a generic UA to route around a rule aimed at automated collection is against its intent for an openly-published dataset. Owner will email to ask permission instead.'
where domain = 'canagan.com'
  and notes not like '%owner decision — do not crawl, do not approve%';
