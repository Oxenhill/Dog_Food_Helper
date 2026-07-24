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
  score: number;
  confidence: number;
  reason: string;
}
