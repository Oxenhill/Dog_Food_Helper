-- Phase 2 reference data seed
-- Run against the Supabase project after confirming dog_baselines, dog_weight_logs,
-- dog_log_entries, wellness_indicator_reference, dog_food_events, dog_red_flag_events,
-- and metric_minimum_lag_days already exist (technical-build-spec.md Part A).
--
-- This only seeds reference/lookup tables — nothing here touches owner or dog data.

-- ============================================
-- metric_minimum_lag_days
-- Seed values per technical-build-spec.md Part A comment / architecture doc §4:
-- digestive metrics ~10 days, weight/behaviour ~21 days, coat/BCS ~56 days.
-- ============================================
insert into metric_minimum_lag_days (outcome_metric, minimum_lag_days) values
  ('stool_score', 10),
  ('stool_odor', 10),
  ('gas_frequency', 10),
  ('gas_odor', 10),
  ('weight_trend', 21),
  ('behaviour_tag', 21),
  ('coat_condition', 56),
  ('body_condition_score', 56)
on conflict (outcome_metric) do update set minimum_lag_days = excluded.minimum_lag_days;

-- ============================================
-- wellness_indicator_reference
-- Draft taxonomy — architecture doc §4 flags this as needing real research
-- input before it's more than "just guessed". Seeded here as a starting
-- point (matches src/lib/chartReference.ts WELLNESS_INDICATOR_DESCRIPTIONS,
-- which is what actually renders in the UI) so the reference table isn't
-- left empty. research_document_id intentionally left null until backing
-- research_documents rows exist (Phase 4). See BUILD_PROGRESS.md.
-- ============================================
insert into wellness_indicator_reference (indicator_type, level, description) values
  ('coat_condition', 'good', 'Shiny, soft, no bald or flaky patches'),
  ('coat_condition', 'questionable', 'Slightly dull or dry in places, occasional flaking'),
  ('coat_condition', 'poor', 'Dull, flaky, brittle, or noticeably excessive shedding'),
  ('stool_odor', 'good', 'Mild, typical odour for this dog'),
  ('stool_odor', 'questionable', 'Stronger than usual'),
  ('stool_odor', 'poor', 'Foul or acrid, clearly different from normal'),
  ('gas_frequency', 'good', 'Infrequent, in line with normal for this dog'),
  ('gas_frequency', 'questionable', 'Noticeably more frequent than usual'),
  ('gas_frequency', 'poor', 'Frequent, near-constant'),
  ('gas_odor', 'good', 'Mild or unnoticeable'),
  ('gas_odor', 'questionable', 'Stronger than usual'),
  ('gas_odor', 'poor', 'Strong and unpleasant, clearly different from normal')
on conflict (indicator_type, level) do update set description = excluded.description;
