-- Gate 5: explicit on/off switch for research evidence actually affecting
-- ranking, separate from research_relevance_weight (which is already 0.25 --
-- a nonzero magnitude, but currently inert because the request path hardcodes
-- the research score to zero regardless of weight).
--
-- Owner decision, 2026-08-03: the diagnostic "with/without research" view is
-- admin-only for now, but real client-facing recommendations must not start
-- using research the moment the Gate 5 formula ships. Flipping this column is
-- the intended future switch for going live for real dog owners -- no code
-- deploy required. Defaults to false so today's production scoring behaviour
-- is unchanged until an admin explicitly turns it on.
alter table public.recommendation_scoring_weights
  add column research_scoring_enabled boolean not null default false;

comment on column public.recommendation_scoring_weights.research_scoring_enabled
is 'Gate 5 switch: when false (default), research evidence is informational only and contributes zero to overall_score for every real recommendation, regardless of research_relevance_weight. When true, the reviewed Gate 5 policy (src/lib/researchScoringPolicy.ts) actually scores evidence and research_relevance_weight applies. The admin decision-trace page always computes both, for comparison, regardless of this flag.';
