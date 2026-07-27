
-- The Phase 6 seed inserted six manufacturer domains with approved = true
-- and both review-date columns null — i.e. the table asserted "reviewed and
-- approved" for domains nobody had actually checked. Default the gate closed
-- until each domain's robots.txt/Content-Signal/ToS is reviewed for real and
-- re-approved individually (see BUILD_PROGRESS.md, Phase 2). Nothing crawls
-- as a result of this migration; it only stops the table lying about its own
-- state.
update public.source_domain_allowlist
set approved = false,
    notes = coalesce(notes, '') || case when notes is null or notes = '' then '' else ' ' end
      || 'Re-gated 2026-07-27: was approved=true with no robots.txt/ToS review recorded; closed pending real review.'
where approved = true
  and robots_txt_checked_at is null
  and tos_reviewed_at is null;
