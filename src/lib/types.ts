// Type definitions for Bowl (by Dog Smart)

export type SizeCategory = 'toy' | 'small' | 'medium' | 'large' | 'giant';
export type LifestyleRole = 'pet' | 'working' | 'sporting' | 'breeding';
export type WorkType = 'none' | 'gundog' | 'herding' | 'sled' | 'protection' | 'other';
export type LifeStage = 'puppy' | 'adult' | 'senior';
export type RestrictionType = 'allergy' | 'intolerance' | 'preference';
export type EvidenceSource = 'owner_reported' | 'lab_test' | 'vet_diagnosed';
export type FoodType = 'raw' | 'kibble' | 'cold_pressed' | 'cooked' | 'wet' | 'other';

export interface Dog {
  id: string;
  owner_id: string;
  name: string;
  breed?: string;
  date_of_birth?: string;
  weight_kg?: number;
  size_category?: SizeCategory;
  activity_level?: string;
  neuter_status?: boolean;
  lifestyle_role: LifestyleRole;
  daily_exercise_hours?: number;
  work_type: WorkType;
  life_stage?: LifeStage;
  monthly_food_budget?: number;
  // Treat logging is opt-in per dog and defaults to false — a half-kept treat
  // log is worse than none, because partial data still produces
  // confident-looking correlations. See src/lib/treatLoggingPrompt.ts.
  treat_logging_enabled?: boolean;
  treat_logging_prompt_dismissed_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface DogRestriction {
  id: string;
  dog_id: string;
  restriction_type: RestrictionType;
  substance: string;
  source: EvidenceSource;
  confidence?: string;
  test_document_ref?: string;
  created_at: string;
}

export interface DogHealthCondition {
  id: string;
  dog_id: string;
  condition: string;
  diagnosed_date?: string;
  source: EvidenceSource;
  notes?: string;
  created_at: string;
}

export interface Food {
  id: string;
  brand: string;
  name: string;
  food_type: FoodType;
  suitable_age_min_months?: number;
  suitable_age_max_months?: number;
  suitable_size_min?: SizeCategory;
  suitable_size_max?: SizeCategory;
  price_per_kg?: number;
  calories_per_kg?: number;
  // Guaranteed-analysis nutrients (%), used by the health-condition hard
  // filter's nutrient-threshold rules. Nullable — owner/vet-populated, start
  // NULL on existing rows. See supabase/migrations/*_food_nutrients.sql.
  protein_pct?: number;
  fat_pct?: number;
  fibre_pct?: number;
  moisture_pct?: number;
  ash_pct?: number;
  phosphorus_pct?: number;
  sodium_pct?: number;
  calcium_pct?: number;
  source_url?: string;
  source_domain?: string;
  last_verified_at?: string;
  created_at: string;
  updated_at: string;
  // Opacity WARNS, never gates (owner decision, 2026-07-28 — see
  // hardFilter.ts and the recommendation card): true when a top-level
  // ingredient is a legal category that can conceal a specific
  // protein/animal-derived source (compositionParser.concealsAnimalSource).
  // A boolean alone can't tell "one opaque term covering ~96% of the food"
  // from "one opaque term on the fat line only, both proteins named" —
  // composition_opaque_terms carries the actual matched terms so the UI
  // can say what's unnamed rather than the app deciding it's disqualifying.
  composition_is_opaque?: boolean;
  composition_opaque_terms?: string[];
}

export interface FoodIngredient {
  id: string;
  food_id: string;
  ingredient_name: string;
  ingredient_category?: string;
  // Prevalence rank for composition ingredients only. Additive rows are null
  // so they can never distort label-order prevalence.
  position_in_list: number | null;
  // Printed order inside the additives panel. Null on composition ingredients.
  additive_sequence?: number | null;
  // Exact printed heading, e.g. "Nutritional additives" or "Antioxidants".
  additive_category_printed?: string | null;
  // Printed inclusion percentage (e.g. "Fresh Chicken (26%)" -> 26). Null when
  // the label doesn't state one — never inferred.
  inclusion_pct?: number | null;
  // Label qualifier: "dried", "min 4%", "as a preservative".
  note?: string | null;
  // Set on a sub-ingredient of a compound ingredient, pointing at its parent
  // row (e.g. "Chicken" inside "Animal Derivatives"). Null for top-level
  // ingredients. Both the allergy hard filter and the correlation engine match
  // ingredient_name across ALL rows, so a nested ingredient is still found —
  // which is how a beef-flavoured food's hidden chicken gets caught.
  parent_ingredient_id?: string | null;
}

export interface HardFilterResult {
  excluded_foods: string[];
  excluded_reasons: { food_id: string; reason: string }[];
  suitable_food_ids: string[];
  current_diet_exposure: DietExposureAudit;
}

export interface RecommendationResult {
  food_id: string;
  brand: string;
  name: string;
  food_type: FoodType;
  score: number;
  confidence: number;
  reason: string;
  // Phase 3 sub-scores (0-1 each) — surfaced so the UI/debugging can show the
  // breakdown, not just the blended overall_score.
  nutritional_fit: number;
  research_relevance: number; // fixed at 0 in Gate 4; evidence is disclosed separately
  research_summary: string; // states whether active evidence matched and confirms zero ranking effect
  budget_fit: number;
  correlation_signal: number; // Phase 6 — real; 0.5 = neutral/no history yet
  correlation_summary: string; // plain-language reasoning behind correlation_signal, Phase 6
  estimated_monthly_cost: number | null;
  research_evidence: ResearchEvidence[];
}

// ============================================
// Phase 2 — Baseline & monitoring
// ============================================

export type WellnessLevel = 'good' | 'questionable' | 'poor';
export type FoodEventType = 'main_food' | 'treat';
export type RedFlagType =
  | 'blood_in_stool'
  | 'repeated_vomiting'
  | 'severe_lethargy'
  | 'other_urgent';
export type TrendDirection = 'better' | 'worse' | 'no_change';

// Matches the `outcome_metric` enum in Part A of the schema exactly.
// Note: the schema enum value is `stool_score` (not `bristol_score`) even though
// it's assessed using the Bristol-style 7-point chart — UI copy can say "Bristol
// stool score" for clarity, but the DB/API value must stay `stool_score`.
export type OutcomeMetric =
  | 'stool_score'
  | 'stool_frequency'
  | 'coat_condition'
  | 'stool_odor'
  | 'gas_frequency'
  | 'gas_odor'
  | 'weight_trend'
  | 'behaviour_tag'
  | 'body_condition_score';

// The four wellness_indicator_reference-backed metrics that use a good/questionable/poor scale
export type WellnessMetric = 'coat_condition' | 'stool_odor' | 'gas_frequency' | 'gas_odor';

export interface DogBaseline {
  id: string;
  dog_id: string;
  established_at: string;
  diet_period_id?: string | null;
  food_at_baseline_id?: string | null;
  created_at: string;
}

export interface DogWeightLog {
  id: string;
  dog_id: string;
  log_date: string;
  weight_kg: number;
  created_at: string;
}

export interface DogLogEntry {
  id: string;
  dog_id: string;
  log_date: string;
  metric: OutcomeMetric;
  raw_value?: string | null;
  trend?: TrendDirection | null;
  within_expected_variability_window: boolean;
  /** Whole diet set active for this reading. Replaces singular food_id_active. */
  diet_period_id?: string | null;
  /** DEPRECATED historical provenance only. Never derived from a mixed diet. */
  food_id_active?: string | null;
  notes?: string | null;
  created_at: string;
}

export interface DogStoolEvent {
  id: string;
  dog_id: string;
  occurred_on: string;
  occurred_at?: string | null;
  time_of_day_captured: boolean;
  score?: number | null;
  mucus?: boolean | null;
  blood?: boolean | null;
  urgency?: boolean | null;
  straining?: boolean | null;
  undigested_food?: boolean | null;
  note?: string | null;
  legacy_log_entry_id?: string | null;
  legacy_trend?: TrendDirection | null;
  monitoring_window_id?: string | null;
  created_at: string;
}

export interface DogStoolBaseline {
  id: string;
  dog_id: string;
  dog_baseline_id: string;
  established_at: string;
  typical_scores: number[];
  typical_count_min?: number | null;
  typical_count_max?: number | null;
  created_at: string;
}

export interface DogStoolMonitoringWindow {
  id: string;
  dog_id: string;
  baseline_id?: string | null;
  food_event_id?: string | null;
  diet_period_id?: string | null;
  opened_at: string;
  closed_at?: string | null;
  created_at: string;
}

export interface WellnessIndicatorReference {
  id: string;
  indicator_type: WellnessMetric;
  level: WellnessLevel;
  description: string;
  research_document_id?: string | null;
}

export interface MetricMinimumLagDays {
  outcome_metric: OutcomeMetric;
  minimum_lag_days: number;
}

export interface DogFoodEvent {
  id: string;
  dog_id: string;
  food_or_treat_id?: string | null;
  food_or_treat_freetext?: string | null;
  event_type: FoodEventType;
  started_at: string;
  ended_at?: string | null;
  in_transition_until?: string | null;
  created_at: string;
}

export type DietComponentRole = 'topper' | 'mixer' | 'supplement' | 'treat';
export type DietComponentShare = 'most' | 'about_half' | 'small_amount' | 'spoonful';
export type DietComponentSchedule =
  | 'every_meal'
  | 'daily'
  | 'specific_days'
  | 'rotating'
  | 'occasional';
export type DietMealSlot = 'morning' | 'evening' | 'any';
export type DietPeriodSource = 'owner_recorded' | 'legacy_food_event' | 'legacy_pointer';
export type DietPeriodAnalysisStatus = 'initial_period' | 'analysable' | 'unanalysable';

export interface DietComponentInput {
  food_id?: string | null;
  food_freetext?: string | null;
  role?: DietComponentRole | null;
  share?: DietComponentShare | null;
  schedule?: DietComponentSchedule | null;
  days_of_week?: number[] | null;
  meal_slot?: DietMealSlot | null;
}

export interface DogDietComponent extends DietComponentInput {
  id: string;
  dog_id: string;
  diet_period_id: string;
  created_at: string;
  food?: {
    id: string;
    brand: string;
    name: string;
    food_type: string;
    ingredient_data_status: string;
  } | null;
}

export interface DogDietPeriod {
  id: string;
  dog_id: string;
  started_at?: string | null;
  start_time_captured: boolean;
  ended_at?: string | null;
  in_transition_until?: string | null;
  source: DietPeriodSource;
  legacy_food_event_id?: string | null;
  created_at: string;
  components: DogDietComponent[];
}

export interface DietExposureAudit {
  status: 'confirmed' | 'unconfirmable' | 'not_recorded';
  diet_period_id: string | null;
  component_count: number;
  opaque_component_count: number;
  ingredient_union: string[];
  restricted_ingredients_present: string[];
}

export interface DogRedFlagEvent {
  id: string;
  dog_id: string;
  flag_type: RedFlagType;
  logged_at: string;
  notes?: string | null;
  acknowledged: boolean;
}

// ============================================
// Phase 4 — Research corpus (RAG)
// ============================================

// Matches the `research_topic` enum in Part A of the schema exactly.
export type ResearchTopic = 'gut_biome' | 'allergy' | 'health_condition' | 'general';

// Matches the `review_status` enum in Part A of the schema exactly.
export type ReviewStatus = 'pending' | 'approved' | 'rejected';

export interface ResearchDocument {
  id: string;
  topic: ResearchTopic;
  topic_group?: ResearchTopicGroup | null;
  discovery_topic?: string | null;
  source_name?: ResearchSourceName | null;
  source_id?: string | null;
  source_url?: string | null;
  title?: string | null;
  doi?: string | null;
  pmid?: string | null;
  pmcid?: string | null;
  journal?: string | null;
  publication_year?: number | null;
  study_design?: ResearchStudyDesign | null;
  species?: ResearchSpecies | null;
  sample_size?: number | null;
  funding_declaration?: string | null;
  competing_interests_declaration?: string | null;
  funding_independent?: boolean | null;
  grading_input_sources?: Record<string, string>;
  missing_grading_inputs?: string[];
  grading_inputs_complete?: boolean;
  is_preprint?: boolean;
  open_access?: boolean;
  abstract_only?: boolean;
  access_type?:
    | 'open_access_full_text'
    | 'abstract_only'
    | 'uploaded_full_text_private'
    | 'metadata_pending';
  license?: string | null;
  retracted?: boolean;
  retraction_checked_at?: string | null;
  evidence_grade?: EvidenceGrade;
  evidence_scope?: ResearchEvidenceScope;
  retrieved_at: string;
  review_status: ReviewStatus;
  superseded_by?: string | null;
  // P4 study-family dedup (researchStudyFamily.ts). Always points directly to
  // a primary document; null when this document IS a primary.
  duplicate_of_document_id?: string | null;
}

export interface ResearchChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  // embedding intentionally omitted from the app-facing type — it's a
  // 1536-length vector, never something the client needs to see/hold.
}

// P5: the row shape propagate_research_document_status_change returns —
// the append-only audit/tombstone event for a retraction or supersession.
export interface ResearchEvidenceLifecycleEvent {
  id: number;
  document_id: string;
  event_type: 'retracted' | 'superseded';
  reason: string;
  actor_type: 'system' | 'owner' | 'worker';
  actor_id: string | null;
  replacement_document_id: string | null;
  affected_claim_ids: string[];
  affected_cluster_ids: string[];
  promoted_primary_document_id: string | null;
  orphaned_duplicate_document_ids: string[];
  occurred_at: string;
}

export type ResearchTopicGroup = 'A' | 'B' | 'C' | 'D' | 'E' | 'F' | 'G';
export type ResearchSourceName = 'europe_pmc' | 'pubmed' | 'crossref' | 'wsava' | 'fediaf';
export type ResearchSpecies = 'dog' | 'cat' | 'human' | 'rodent' | 'other';
export type EvidenceGrade = 'A' | 'B' | 'C' | 'D' | 'E';
export type ResearchEvidenceScope = 'canine_direct' | 'veterinary_methodology';
export type ResearchStudyDesign =
  | 'systematic_review'
  | 'meta_analysis'
  | 'rct'
  | 'controlled_trial'
  | 'comparative_study'
  | 'clinical_trial'
  | 'cohort'
  | 'case_control'
  | 'case_series'
  | 'cross_sectional'
  | 'in_vitro'
  | 'narrative_review'
  | 'guideline'
  | 'other';
export type ResearchClaimSubjectType =
  | 'ingredient'
  | 'nutrient'
  | 'ingredient_class'
  | 'processing_method'
  | 'biome_marker';
export type ResearchClaimDirection =
  | 'supports'
  | 'cautions_against'
  | 'neutral'
  | 'insufficient_evidence';
export type ResearchClaimStatus =
  | 'draft'
  | 'active'
  | 'queued_for_review'
  | 'rejected'
  | 'superseded';

export interface ResearchClaim {
  id: string;
  claim_identity: string;
  document_id: string;
  chunk_id: string;
  supporting_quote: string;
  subject_type: ResearchClaimSubjectType;
  subject_value: string;
  applies_to_condition?: string | null;
  applies_to_life_stage?: 'growth' | 'adult' | 'senior' | 'all_life_stages' | null;
  direction: ResearchClaimDirection;
  effect_summary: string;
  study_design?: ResearchStudyDesign | null;
  species?: ResearchSpecies | null;
  sample_size?: number | null;
  funding_independent?: boolean | null;
  is_preprint: boolean;
  evidence_grade: EvidenceGrade;
  evidence_scope: ResearchEvidenceScope;
  missing_grading_inputs: string[];
  grading_inputs_complete: boolean;
  corroborating_claim_ids: string[];
  status: ResearchClaimStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  created_at: string;
  updated_at: string;
}

/**
 * Human-reviewed research attached to a recommendation. This is evidence
 * disclosure only in Gate 4: it never contributes a numeric ranking value.
 */
export interface ResearchEvidence {
  claim_id: string;
  claim_identity: string;
  subject_type: ResearchClaimSubjectType;
  subject_value: string;
  direction: ResearchClaimDirection;
  effect_summary: string;
  supporting_quote: string;
  evidence_grade: EvidenceGrade;
  grading_inputs_complete: boolean;
  access_type:
    | 'open_access_full_text'
    | 'abstract_only'
    | 'uploaded_full_text_private';
  title: string;
  doi: string | null;
  source_url: string | null;
  cluster_id?: string | null;
  outcome_type?: string | null;
  outcome_value?: string | null;
  matched_dog_context?: string[];
  // Gate 5 corroboration input (researchScoringPolicy.ts): the source
  // document's id, and its study-family root -- duplicate_of_document_id when
  // this document is a republished form of an earlier one, otherwise the
  // document's own id. Two evidence items sharing a study_family_id are the
  // same underlying study and must never be counted as independent
  // corroboration of each other.
  document_id: string;
  study_family_id: string;
}

export interface ResearchEvidenceCluster {
  id: string;
  cluster_identity: string;
  label: string;
  subject_type: ResearchClaimSubjectType;
  subject_value: string;
  outcome_type:
    | 'condition'
    | 'biome_marker'
    | 'clinical_marker'
    | 'outcome_metric'
    | 'general_health';
  outcome_value: string;
  direction: ResearchClaimDirection;
  cautious_summary: string;
  status: ResearchClaimStatus;
  reviewed_by?: string | null;
  reviewed_at?: string | null;
  review_note?: string | null;
  last_edited_by?: string | null;
  last_edited_at?: string | null;
  created_at: string;
  updated_at: string;
}

export interface ResearchClusterApplicability {
  id: string;
  cluster_id: string;
  context_type:
    | 'health_condition'
    | 'document_finding'
    | 'life_stage'
    | 'restriction'
    | 'outcome_metric';
  context_key: string;
  context_value: string | null;
  match_operator: 'exact' | 'enum';
  required: boolean;
  created_at: string;
}

export interface DogDocumentFinding {
  id: string;
  document_id: string;
  dog_id: string;
  owner_id: string;
  finding_type: string;
  marker_name: string;
  value: string | number | null;
  unit: string | null;
  reference_range: string | null;
  interpretation_flag: string | null;
  source_kind: string;
  review_status: 'accepted' | 'needs_review';
  verbatim_source_text: string;
  created_at: string;
}

// ============================================
// Phase 5 — Photo/OCR ingestion (Tier 2 review queue)
// ============================================

// The structured JSON shape submitIngredientPhoto extracts via vision/OCR
// (technical build spec Part B). Free-text fields are intentionally
// nullable — Haiku is instructed not to guess/hallucinate a value it can't
// actually read off the packet (confidence-honesty principle, architecture
// doc §9, applied to OCR rather than just scoring).
export interface OcrExtractionResult {
  brand: string | null;
  product_name: string | null;
  ingredients: string[];
  age_suitability: string | null;
  weight_range: string | null;
  price: string | null;
  notes: string | null;
}

// Matches `ingredient_review_queue` in Part A exactly.
export interface IngredientReviewQueueItem {
  id: string;
  raw_ocr_json: OcrExtractionResult & {
    // Non-Part-A metadata deliberately nested inside the jsonb column rather
    // than added as new top-level table columns — see BUILD_PROGRESS.md
    // Phase 5 deviations for why (schema fidelity: "don't add/rename fields
    // without flagging").
    _image_storage_path?: string;
    _ocr_error?: string;
    _review?: { feedback?: string; corrections_applied?: boolean };
  };
  submitted_by: string | null;
  dog_id: string | null;
  status: ReviewStatus;
  reviewed_by: string | null;
  reviewed_at: string | null;
  resulting_food_id: string | null;
  created_at: string;
}

// Structured corrections an admin can supply on approval to map the free-text
// OCR fields onto the strict `foods`/`food_ingredients` schema columns (see
// BUILD_PROGRESS.md Phase 5 deviation on OCR→schema mapping).
export interface IngredientReviewCorrections {
  brand?: string;
  name?: string;
  food_type?: FoodType;
  suitable_age_min_months?: number | null;
  suitable_age_max_months?: number | null;
  suitable_size_min?: SizeCategory | null;
  suitable_size_max?: SizeCategory | null;
  price_per_kg?: number | null;
  calories_per_kg?: number | null;
  ingredients?: string[];
}

// ============================================
// Phase 6 — Weekly discovery, correlation engine, inactivity deletion
// ============================================

// Matches `source_domain_allowlist` in Part A exactly.
export interface SourceDomainAllowlistEntry {
  id: string;
  domain: string;
  robots_txt_checked_at?: string | null;
  tos_reviewed_at?: string | null;
  approved: boolean;
  notes?: string | null;
}

// Matches `ingredient_outcome_signals` in Part A exactly. correlation_strength
// here is a directional "net improvement rate" heuristic in [-1, 1], not a
// statistically rigorous correlation coefficient — see
// src/lib/correlationEngine.ts's header comment for the honesty caveat
// (architecture doc §9).
export interface IngredientOutcomeSignal {
  id: string;
  dog_id: string;
  ingredient_name: string;
  outcome_metric: OutcomeMetric;
  lag_days: number;
  correlation_strength?: number | null;
  sample_size: number;
  computed_at: string;
  // 'low_sample' (3-5 logs) | 'preliminary' (6-15) | 'established' (16+) —
  // see CONFIDENCE_THRESHOLDS in src/lib/correlationEngine.ts. Rows with
  // fewer than 3 eligible logs are never written at all.
  confidence_flag?: string | null;
  // Which kind of evidence produced this signal. 'food_switch' is attributed
  // to the ingredient difference across a food change — a natural experiment,
  // and the diagnostically useful kind. 'single_food_period' credits every
  // ingredient in one food equally, which is weak by construction.
  evidence_basis?: EvidenceBasis;
}

export type EvidenceBasis = 'food_switch' | 'single_food_period';

// How an outcome metric moved across a food switch.
export type SwitchOutcome = 'improved' | 'worsened' | 'unchanged' | 'insufficient_data';

// The dog's absolute state for that metric BEFORE the switch, read from the
// most recent baseline/recalibration reading. 'unknown' when no absolute
// reading exists — which is a real and common case, and must not be guessed:
// it is what distinguishes "poor -> still poor" (retained ingredients are the
// suspects) from "good -> still good" (weak positive only).
export type BeforeState = 'concerning' | 'acceptable' | 'unknown';

export interface SwitchMetricOutcome {
  outcome: SwitchOutcome;
  before_state: BeforeState;
  /** Post-switch logs that were eligible (past the lag window, past transition). */
  sample_size: number;
  /** (better - worse) / sample_size, in [-1, 1]. */
  net: number;
  lag_days: number;
}

export interface DogFoodSwitchAnalysis {
  id: string;
  dog_id: string;
  from_event_id?: string | null;
  to_event_id?: string | null;
  from_food_id?: string | null;
  to_food_id?: string | null;
  from_diet_period_id?: string | null;
  to_diet_period_id?: string | null;
  analysis_status?: DietPeriodAnalysisStatus | null;
  unanalysable_reason?: string | null;
  switched_at?: string | null;
  added_ingredients: string[];
  removed_ingredients: string[];
  retained_ingredients: string[];
  // False when either side of the switch has no recorded ingredient list. Three
  // empty arrays would otherwise be indistinguishable from "nothing changed",
  // and an unknown food would look like one containing nothing.
  ingredient_sets_known: boolean;
  metric_outcomes: Record<string, SwitchMetricOutcome>;
  treat_logging_enabled: boolean;
  confounding_treat_ingredients: string[];
  computed_at: string;
}

export type SuspectReason =
  | 'retained_across_failed_switches'
  | 'removed_on_improvement'
  | 'added_on_worsening';

/**
 * An ingredient worth DISCUSSING WITH A VET — never a diagnosis of
 * intolerance, and never a hard filter. See src/lib/switchAnalysis.ts.
 */
export interface DogIngredientSuspect {
  id: string;
  dog_id: string;
  ingredient_name: string;
  poor_food_count: number;
  implicated_metrics: string[];
  suspect_reason: SuspectReason;
  computed_at: string;
}

// Matches `account_inactivity_policy` in Part A exactly.
export interface AccountInactivityPolicyRow {
  id: string;
  inactivity_threshold_days: number;
  warning_before_days: number;
  active: boolean;
}

// Matches `user_profiles` in Part A exactly (personal-data columns beyond
// `id` live in auth.users, not here — see accountLifecycle.ts's deletion
// logic for why both must be touched on account deletion).
export interface UserProfile {
  id: string;
  display_name?: string | null;
  last_active_at?: string | null;
  inactivity_warning_sent_at?: string | null;
  // Real admin role (replaces the RESEARCH_INGEST_ADMIN_TOKEN shared-secret
  // stopgap) — checked server-side in src/lib/serverAdminAuth.ts.
  is_admin: boolean;
  created_at: string;
}
