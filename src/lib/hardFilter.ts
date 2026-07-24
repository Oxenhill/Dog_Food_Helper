import { supabaseAdmin } from './supabase';
import { HardFilterResult } from './types';

/**
 * Hard-filter logic (Phase 1, critical safety layer)
 * Excludes any food touching a dog's restrictions or contraindicated health conditions
 * This is deterministic, rule-based SQL — never probabilistic, never uses LLM
 */
export async function applyHardFilter(dogId: string): Promise<HardFilterResult> {
  const excluded_foods = new Set<string>();
  const excluded_reasons: { food_id: string; reason: string }[] = [];

  try {
    // Fetch dog's restrictions and health conditions
    const { data: restrictions, error: restrictionError } = await supabaseAdmin
      .from('dog_restrictions')
      .select('substance')
      .eq('dog_id', dogId);

    if (restrictionError) throw restrictionError;

    // Fetch dog's health conditions
    const { data: conditions, error: conditionError } = await supabaseAdmin
      .from('dog_health_conditions')
      .select('condition')
      .eq('dog_id', dogId);

    if (conditionError) throw conditionError;

    // Get all foods
    const { data: foods, error: foodError } = await supabaseAdmin
      .from('foods')
      .select('id, brand, name');

    if (foodError) throw foodError;

    if (!foods) return { excluded_foods: [], excluded_reasons: [], suitable_food_ids: [] };

    // For each restriction, find foods containing that ingredient
    if (restrictions && restrictions.length > 0) {
      for (const restriction of restrictions) {
        const { data: ingredientMatches, error: ingredientError } = await supabaseAdmin
          .from('food_ingredients')
          .select('food_id')
          .ilike('ingredient_name', `%${restriction.substance}%`);

        if (ingredientError) throw ingredientError;

        if (ingredientMatches) {
          for (const match of ingredientMatches) {
            if (!excluded_foods.has(match.food_id)) {
              excluded_foods.add(match.food_id);
              excluded_reasons.push({
                food_id: match.food_id,
                reason: `Contains restricted ingredient: ${restriction.substance}`,
              });
            }
          }
        }
      }
    }

    // Suitable food IDs = all foods - excluded foods
    const suitable_food_ids = foods
      .filter((f) => !excluded_foods.has(f.id))
      .map((f) => f.id);

    return {
      excluded_foods: Array.from(excluded_foods),
      excluded_reasons,
      suitable_food_ids,
    };
  } catch (error) {
    console.error('Hard filter error:', error);
    throw error;
  }
}

/**
 * Check if a specific food is suitable for a dog (given restrictions/conditions)
 */
export async function isFoodSuitable(dogId: string, foodId: string): Promise<boolean> {
  const result = await applyHardFilter(dogId);
  return result.suitable_food_ids.includes(foodId);
}
