-- The admin review-queue's approve action needs a distinct status from
-- owner_rejected -- caught in review before shipping: the route was about
-- to write 'owner_rejected' on approve too.

alter table public.manufacturer_target_domains
  drop constraint manufacturer_target_domains_recon_status_check;
alter table public.manufacturer_target_domains
  add constraint manufacturer_target_domains_recon_status_check
  check (recon_status in (
    'not_started','reviewed_pending_owner','error','excluded',
    'owner_rejected','owner_rejected_pending_email','approval_candidate','owner_approved',
    'no_terms_found','blocked','unresolved'
  ));
