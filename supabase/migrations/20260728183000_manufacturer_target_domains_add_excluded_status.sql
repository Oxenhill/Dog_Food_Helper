-- Interpet.co.uk (Aquagarden Interpet Limited's listed domain) turned out to
-- be an aquarium/fish-care equipment company, not a dog food manufacturer --
-- 'excluded' records that call without deleting the recon row.

alter table public.manufacturer_target_domains
  drop constraint manufacturer_target_domains_recon_status_check;
alter table public.manufacturer_target_domains
  add constraint manufacturer_target_domains_recon_status_check
  check (recon_status in ('not_started','reviewed_pending_owner','error','excluded','owner_rejected'));
