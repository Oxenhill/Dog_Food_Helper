-- Owner-sanctioned 6th shape: bespoke drafting that prohibits reproduction/
-- copying/distribution without prior written permission, but doesn't name
-- scraping/crawling/robots/TDM (so not a considered anti-automation
-- position) and doesn't merely assert rights with no prohibition (so it's
-- not copyright_asserted_no_prohibition either).
--
-- Requires three independent tokens to all be present -- a reuse verb, a
-- prohibition verb, and a without-written-permission clause -- which a
-- single contiguous regex can't express (Postgres's regex engine has no
-- lookahead). pattern_all_of holds the three tokens; classify_terms_excerpt
-- is updated separately (20260728190100) to require every element to match.

alter table public.terms_clause_patterns
  add column pattern_all_of text[];
comment on column public.terms_clause_patterns.pattern_all_of is
  'When set, ALL elements must match terms_excerpt (~*) for this row to count as a match, instead of the single `pattern` column. Used where a shape requires several independent tokens (a reuse verb, a prohibition verb, a without-permission clause) rather than one contiguous phrase.';

alter table public.terms_clause_patterns
  drop constraint terms_clause_patterns_shape_check;
alter table public.terms_clause_patterns
  add constraint terms_clause_patterns_shape_check
  check (shape in (
    'explicit_tdm_prohibition','personal_use_only','reproduction_boilerplate',
    'explicit_reproduction_prohibition','copyright_asserted_no_prohibition','no_content_clause'
  ));

update terms_clause_patterns set priority = 5 where shape = 'copyright_asserted_no_prohibition';
update terms_clause_patterns set priority = 6 where shape = 'no_content_clause';

insert into terms_clause_patterns (shape, pattern, pattern_all_of, default_decision, rationale, priority) values
  ('explicit_reproduction_prohibition', null,
   array[
     '(reproduc|\ycopy\y|copies|distribut|republish|transmit)',
     '(prohibited|not permitted|\ymay not\y|\ymust not\y|\yshall not\y)',
     'without .{0,40}(written|prior) (permission|consent|approval)'
   ],
   'refuse_pending_email',
   'Bespoke drafting prohibiting reproduction, copying, distribution or republication without prior written permission. A clear prohibition, but does not name scraping, crawling, robots or text and data mining, so not a considered position on automated collection. Manufacturers publishing their own product composition: the data is fact, and database right over self-created data is weak under the BHB line. Refuse on the terms, ask for permission.',
   4);

update terms_clause_patterns set version = version + 1;
