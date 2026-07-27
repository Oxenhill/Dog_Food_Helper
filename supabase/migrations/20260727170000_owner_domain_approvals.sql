
-- Owner approvals, 2026-07-27, given after both robots_txt_checked_at and
-- tos_reviewed_at were real (the whole reason that gate exists — see the
-- 20260727140100 migration that closed it after finding it had been
-- bypassed).

update public.source_domain_allowlist
set approved = true,
    notes = notes || ' | Approved by owner 2026-07-27.'
where domain = 'fish4dogs.com';

update public.source_domain_allowlist
set approved = true,
    notes = notes || ' | Approved by owner 2026-07-27.'
where domain = 'forthglade.com';

-- emea.acana.com: approved on robots.txt alone — no Terms of Use page could
-- be found at all (see the 20260727160000 ToS review note). Absence of
-- terms is not the same as permission, and an untracked page could appear
-- at any time. Re-check due 2027-01-27 (6 months) — check the site footer
-- and re-search for a Terms of Use/IP page before trusting this approval
-- past that date.
update public.source_domain_allowlist
set approved = true,
    notes = notes || ' | Approved by owner 2026-07-27, on robots.txt alone — no ToS page exists to review. Absence of terms is not permission and can change without notice. RE-CHECK DUE 2027-01-27: re-search for a Terms of Use/IP page before continuing to rely on this approval past that date.'
where domain = 'emea.acana.com';

-- burnspet.co.uk and wellbeloved.com stay approved = false. Explicit
-- database-rights + "personal non-commercial use only" language is a clear
-- statement against exactly what an ODbL-published catalogue would do with
-- their content. Owner is sending permission-request emails instead
-- (drafts: docs/draft-email-burnspet-permission-request.md,
-- docs/draft-email-wellbeloved-permission-request.md). Do not approve
-- unless/until permission is granted in writing.
update public.source_domain_allowlist
set notes = notes || ' | Owner decision 2026-07-27: not approved. Permission-request email drafted, same standard as canagan.com and burnspet.co.uk respectively.'
where domain in ('burnspet.co.uk', 'wellbeloved.com');
