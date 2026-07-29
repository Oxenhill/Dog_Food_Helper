alter table public.research_claims
  add column claim_identity text not null,
  add constraint research_claims_claim_identity_format_check
    check (claim_identity ~ '^[0-9a-f]{64}$'),
  add constraint research_claims_claim_identity_key
    unique (claim_identity);

comment on column public.research_claims.claim_identity
is 'Deterministic SHA-256 identity over document, chunk, exact quote, and normalized proposition. Used to make approved offline claim insertion repeatable.';
