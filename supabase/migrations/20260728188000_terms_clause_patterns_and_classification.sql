-- FOOD_DISCOVERY_DESIGN.md sec5: terms classification is policy, not
-- per-domain adjudication. Owner decisions about clause SHAPES, applied by
-- a deterministic regex classifier -- never a model, never per-domain.

create table public.manufacturer_entities (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  permission_decision text not null default 'not_yet_requested'
    check (permission_decision in ('not_yet_requested','pending_email','approved','refused')),
  permission_notes text,
  created_at timestamptz not null default now()
);
comment on table public.manufacturer_entities is
  'The real-world legal entity behind one or more domains/brands (e.g. Assisi Pet Care Ltd owns both burnspet.co.uk and assisipetcare.com). One permission decision here propagates to every domain via manufacturer_target_domains.entity_id -- one email per company, not per domain.';

alter table public.manufacturer_target_domains
  add column entity_id uuid references public.manufacturer_entities(id);

create table public.terms_clause_patterns (
  id uuid primary key default gen_random_uuid(),
  shape text not null check (shape in (
    'explicit_tdm_prohibition','personal_use_only','reproduction_boilerplate',
    'copyright_asserted_no_prohibition','no_content_clause'
  )),
  pattern text,
  default_decision text not null check (default_decision in ('refuse','refuse_pending_email','approval_candidate')),
  rationale text not null,
  priority int not null,
  added_by uuid,
  added_at timestamptz not null default now(),
  version int not null default 1,
  active boolean not null default true
);
comment on table public.terms_clause_patterns is
  'Policy, not adjudication (FOOD_DISCOVERY_DESIGN.md sec5). Patterns matched against terms_excerpt in priority order, lowest first, first match wins. Retired via active=false, never deleted -- reclassification re-derives every domain''s status from here, so history stays auditable against the exact pattern+version that produced it.';

-- Note: these patterns originally used .{0,300} for the proximity windows,
-- which Postgres's regex engine rejects (RE_DUP_MAX): "invalid repetition
-- count(s)". Written here already corrected to .{0,200} -- see
-- 20260728188100_fix_terms_clause_patterns_repetition_count.sql for the
-- exact fix as it was actually applied, live, against already-seeded rows.
insert into public.terms_clause_patterns (shape, pattern, default_decision, rationale, priority) values
  ('explicit_tdm_prohibition',
   '(scraping|data mining|data harvesting|data extraction).{0,200}(robot|spider)|(robot|spider).{0,200}(scraping|data mining)|systematic or automated data collection',
   'refuse',
   'Names scraping/crawling/robots/spiders/text-and-data-mining as an explicit, considered prohibition (petsathome.com, bellaandduke.com). Not a permission-email candidate -- the position is deliberate, not boilerplate oversight.',
   1),
  ('personal_use_only',
   'personal,? (non-commercial )?(use|reference)( only)?.{0,200}(commercial|business)',
   'refuse_pending_email',
   'Permits personal/non-commercial reference, bars commercial use (wellbeloved.com, burnspet.co.uk, assisipetcare.com, benyfitnatural.co.uk). Common template drafting rather than a considered anti-automation stance -- queue a permission request rather than closing the door.',
   2),
  ('reproduction_boilerplate',
   'reproduction is prohibited other than in accordance with the copyright notice',
   'refuse_pending_email',
   'Circular template wording -- prohibits reproduction "other than in accordance with the copyright notice" without ever stating what the notice permits (alphafeeds.com, vitalinpetfood.co.uk, foldhill.co.uk, fish4pets.com). Same shape as personal_use_only: template, not policy. Queue permission email.',
   3),
  ('reproduction_boilerplate',
   'you may not copy or reuse (it|this)?\s*without written permission|fair use of intellectual property',
   'refuse_pending_email',
   'Akela Pet Foods'' own template (wholeprey.com, countrykibble.com, netpetshop.co.uk) -- distinct wording from the alphafeeds-shaped template above but the same circular shape: prohibits reuse, then separately preserves "UK copyright exceptions" without saying which. Unusually permissive drafting for a refusal -- strong permission-email candidate.',
   3),
  ('copyright_asserted_no_prohibition',
   'copyright and other relevant intellectual property rights exist',
   'approval_candidate',
   'States rights exist, prohibits nothing (durhamanimalfeeds.co.uk). No reuse restriction, no personal-use-only limit, no commercial bar. Never auto-approved -- queues for explicit human sign-off with robots.txt directives shown alongside.',
   4),
  ('no_content_clause',
   '^no matching clause found$',
   'approval_candidate',
   'Terms page exists but is a sales contract only (fish4dogs.com, copdockmill.co.uk, cotswoldraw.com), or no terms page exists at all. Absence of a content-reuse clause is evidence, not permission -- never auto-approved, queues for explicit human sign-off.',
   5);

alter table public.manufacturer_target_domains
  add column matched_pattern_id uuid references public.terms_clause_patterns(id),
  add column classified_shape text,
  add column classification_confidence text check (classification_confidence in ('high','low','none'));

alter table public.manufacturer_target_domains
  drop constraint manufacturer_target_domains_recon_status_check;
alter table public.manufacturer_target_domains
  add constraint manufacturer_target_domains_recon_status_check
  check (recon_status in (
    'not_started','reviewed_pending_owner','error','excluded',
    'owner_rejected','owner_rejected_pending_email','approval_candidate',
    'no_terms_found','blocked','unresolved'
  ));

create or replace function public.classify_terms_excerpt(p_excerpt text, p_recon_status text)
returns table(pattern_id uuid, shape text, decision text, confidence text)
language plpgsql
stable
as $$
declare
  rec record;
begin
  if p_recon_status = 'no_terms_found' then
    select id, tcp.shape, tcp.default_decision into rec
    from public.terms_clause_patterns tcp
    where tcp.shape = 'no_content_clause' and tcp.active
    order by priority limit 1;
    return query select rec.id, rec.shape, rec.default_decision, 'high'::text;
    return;
  end if;

  if p_excerpt is null then
    return query select null::uuid, null::text, null::text, 'none'::text;
    return;
  end if;

  for rec in
    select tcp.id, tcp.shape, tcp.default_decision, tcp.pattern
    from public.terms_clause_patterns tcp
    where tcp.active
    order by tcp.priority, tcp.id
  loop
    if p_excerpt ~* rec.pattern then
      return query select rec.id, rec.shape, rec.default_decision, 'high'::text;
      return;
    end if;
  end loop;

  return query select null::uuid, null::text, null::text, 'none'::text;
end;
$$;
