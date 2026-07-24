import { supabaseAdmin } from './supabase';
import { Food, IngredientOutcomeSignal } from './types';

/**
 * Wires the Phase 6 correlation engine's output into per-food recommendation
 * scoring (recommendationScoring.ts's `correlation_signal`, hardcoded to 0
 * since Phase 3 — see BUILD_PROGRESS.md, "Phase 6 adds the correlation
 * engine"). Fetched once per request (dog-level, like retrieveResearchFor)
 * and reused across every candidate food.
 *
 * Scoring approach: for a candidate food, average `correlation_strength`
 * across every `ingredient_outcome_signals` row for this dog whose
 * `ingredient_name` appears in the food's ingredient list, restricted to
 * rows that actually cleared the minimum sample size (confidence_flag is
 * non-null — see correlationEngine.ts). correlation_strength is already in
 * [-1, 1]; rescaled to [0, 1] here to match the other scoring factors'
 * range (0 = worst, 1 = best), same convention as nutritional_fit/budget_fit.
 *
 * No matching signals (new dog, or ingredients this dog has no logged
 * history with) -> neutral 0.5, same "don't guess, stay neutral" convention
 * budgetScoring.ts already uses when a budget isn't set (confidence-honesty
 * principle, architecture doc §9) — NOT 0, which would wrongly imply a
 * known-bad signal.
 */

export interface CorrelationSignalResult {
  score: number; // 0-1, 0.5 = neutral/no data
  sampleBackedIngredientCount: number;
  summary: string;
}

export async function fetchDogCorrelationSignals(dogId: string): Promise<IngredientOutcomeSignal[]> {
  const { data, error } = await supabaseAdmin
    .from('ingredient_outcome_signals')
    .select('*')
    .eq('dog_id', dogId)
    .not('confidence_flag', 'is', null);

  if (error) throw error;
  return (data ?? []) as IngredientOutcomeSignal[];
}

export async function scoreCorrelationSignalForFood(
  food: Food,
  dogSignals: IngredientOutcomeSignal[]
): Promise<CorrelationSignalResult> {
  if (dogSignals.length === 0) {
    return { score: 0.5, sampleBackedIngredientCount: 0, summary: 'No correlation history yet for this dog.' };
  }

  const { data: ingredientRows, error } = await supabaseAdmin
    .from('food_ingredients')
    .select('ingredient_name')
    .eq('food_id', food.id);
  if (error) throw error;

  const foodIngredients = new Set((ingredientRows ?? []).map((r) => (r.ingredient_name as string).toLowerCase()));
  const matching = dogSignals.filter((s) => foodIngredients.has(s.ingredient_name.toLowerCase()));

  if (matching.length === 0) {
    return {
      score: 0.5,
      sampleBackedIngredientCount: 0,
      summary: 'No correlation history for this food\'s ingredients yet.',
    };
  }

  const avgStrength =
    matching.reduce((sum, s) => sum + (s.correlation_strength ?? 0), 0) / matching.length;
  const score = (avgStrength + 1) / 2; // rescale [-1,1] -> [0,1]

  const lowSampleCount = matching.filter((s) => s.confidence_flag === 'low_sample').length;
  const sampleCaveat =
    lowSampleCount > 0
      ? ` (${lowSampleCount} of ${matching.length} based on a low sample — treat cautiously)`
      : '';

  return {
    score,
    sampleBackedIngredientCount: matching.length,
    summary: `Based on this dog's own logged history with ${matching.length} ingredient(s) in this food${sampleCaveat}.`,
  };
}
