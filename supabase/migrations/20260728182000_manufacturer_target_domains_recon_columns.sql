alter table public.manufacturer_target_domains
  add column terms_fetched_at timestamptz,
  add column terms_text_sha256 text,
  add constraint manufacturer_target_domains_recon_status_check
    check (recon_status in ('not_started','reviewed_pending_owner','error'));
