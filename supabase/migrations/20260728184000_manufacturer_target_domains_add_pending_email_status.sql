-- Distinguishes "refused, and a permission email is the next step" (e.g.
-- Akela's circular-template terms, unusually permissive drafting) from a
-- flat refusal.

alter table public.manufacturer_target_domains
  drop constraint manufacturer_target_domains_recon_status_check;
alter table public.manufacturer_target_domains
  add constraint manufacturer_target_domains_recon_status_check
  check (recon_status in ('not_started','reviewed_pending_owner','error','excluded','owner_rejected','owner_rejected_pending_email'));
