-- reviewed_pending_owner must mean evidence was actually gathered (an
-- excerpt, or a verified zero-match). Splits out the states that aren't a
-- decision yet: no terms page exists (evidence, not permission), fetch was
-- blocked (403/robots-denied, nothing fetched), or the target URL 404s and
-- needs a manual check.

alter table public.manufacturer_target_domains
  drop constraint manufacturer_target_domains_recon_status_check;
alter table public.manufacturer_target_domains
  add constraint manufacturer_target_domains_recon_status_check
  check (recon_status in (
    'not_started','reviewed_pending_owner','error','excluded',
    'owner_rejected','owner_rejected_pending_email',
    'no_terms_found','blocked','unresolved'
  ));
