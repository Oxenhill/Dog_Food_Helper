// Type definitions for Dog Food Helper

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
  current_food_id?: string;
  current_food_freetext?: string;
  monthly_food_budget?: number;
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
}

export interface FoodIngredient {
  id: string;
  food_id: string;
  ingredient_name: string;
  ingredient_category?: string;
  position_in_list: number;
}

export interface HardFilterResult {
  excluded_foods: string[];
  excluded_reasons: { food_id: string; reason: string }[];
  suitable_food_ids: string[];
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
  research_relevance: number; // real, RAG-backed as of Phase 4
  research_summary: string; // plain-language reasoning behind research_relevance, Phase 4
  budget_fit: number;
  correlation_signal: number; // Phase 6 — real; 0.5 = neutral/no history yet
  correlation_summary: string; // plain-language reasoning behind correlation_signal, Phase 6
  estimated_monthly_cost: number | null;
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
  food_id_active?: string | null;
  notes?: string | null;
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
  source_url?: string | null;
  title?: string | null;
  retrieved_at: string;
  review_status: ReviewStatus;
  superseded_by?: string | null;
}

export interface ResearchChunk {
  id: string;
  document_id: string;
  content: string;
  chunk_index: number;
  // embedding intentionally omitted from the app-facing type — it's a
  // 1536-length vector, never something the client needs to see/hold.
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
