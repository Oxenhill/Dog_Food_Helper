import { supabaseAdmin } from './supabase';
import { HardFilterResult } from './types';
import { estimateCarbohydrate } from './carbohydrate';

/**
 * Virtual nutrient: carbohydrate is never printed on a guaranteed-analysis
 * panel, so it has no `foods` column. It is derived by difference from the five
 * printed fractions (see src/lib/carbohydrate.ts) and compared in memory. This
 * stays fully deterministic arithmetic — no LLM — so it does not breach the
 * safety-layer separation.
 */
const CARBOHYDRATE_NUTRIENT = 'carbohydrate_pct';

/**
 * Hard-filter logic (Phase 1, critical safety layer)
 *
 * Excludes any food touching a dog's ingredient restrictions OR a
 * vet-approved contraindication for one of the dog's health conditions.
 * This is deterministic, rule-based SQL — never probabilistic, never uses an
 * LLM (architecture doc §2: the safety layer is completely separate from the
 * inference/scoring layer).
 *
 * Health-condition exclusion (added this pass) is driven entirely by the
 * `condition_contraindications` reference table. ONLY rows with approved=true
 * affect exclusions — an unreviewed/draft mapping never silently changes what
 * a dog is allowed to eat. The clinical mappings themselves are owner/vet
 * data-entry and are intentionally never machine-generated; until an approved
 * mapping exists for a dog's condition, health-condition exclusion contributes
 * nothing (identical to the previous behaviour), but the mechanism is now in
 * place and deterministic.
 */

const COMPARATOR_TO_PG_OP: Record<string, string> = {
  '>': 'gt',
  '>=': 'gte',
  '<': 'lt',
  '<=': 'lte',
};

interface Contraindication {
  condition: string;
  contraindicated_ingredient: string | null;
  nutrient: string | null;
  comparator: string | null;
  threshold: number | null;
}

export async function applyHardFilter(dogId: string): Promise<HardFilterResult> {
  const excluded_foods = new Set<string>();
  const excluded_reasons: { food_id: string; reason: string }[] = [];

  const addExcluded = (foodId: string, reason: string) => {
    if (!excluded_foods.has(foodId)) {
      excluded_foods.add(foodId);
      excluded_reasons.push({ food_id: foodId, reason });
    }
  };

  try {
    // Fetch the dog's ingredient restrictions and diagnosed health conditions.
    const [{ data: restrictions, error: restrictionError }, { data: conditions, error: conditionError }] =
      await Promise.all([
        supabaseAdmin.from('dog_restrictions').select('substance').eq('dog_id', dogId),
        supabaseAdmin.from('dog_health_conditions').select('condition').eq('dog_id', dogId),
      ]);

    if (restrictionError) throw restrictionError;
    if (conditionError) throw conditionError;

    // Get all foods (the candidate universe).
    const { data: foods, error: foodError } = await supabaseAdmin
      .from('foods')
      .select('id, brand, name');

    if (foodError) throw foodError;
    if (!foods) return { excluded_foods: [], excluded_reasons: [], suitable_food_ids: [] };

    // --- 1) Ingredient restrictions (allergy / intolerance / preference) ----
    if (restrictions && restrictions.length > 0) {
      for (const restriction of restrictions) {
        const { data: ingredientMatches, error: ingredientError } = await supabaseAdmin
          .from('food_ingredients')
          .select('food_id')
          .ilike('ingredient_name', `%${restriction.substance}%`);

        if (ingredientError) throw ingredientError;

        for (const match of ingredientMatches ?? []) {
          addExcluded(match.food_id, `Contains restricted ingredient: ${restriction.substance}`);
        }
      }
    }

    // --- 2) Health-condition contraindications (vet-approved only) ----------
    if (conditions && conditions.length > 0) {
      // Case-insensitive set of the dog's condition names.
      const dogConditions = new Set(
        conditions.map((c) => c.condition.toLowerCase().trim()).filter(Boolean)
      );

      // Pull only approved rules; match to this dog's conditions in memory
      // (case-insensitive). Approved-only is enforced here so a draft mapping
      // can never affect a real recommendation.
      const { data: contraRows, error: contraError } = await supabaseAdmin
        .from('condition_contraindications')
        .select('condition, contraindicated_ingredient, nutrient, comparator, threshold')
        .eq('approved', true);

      if (contraError) throw contraError;

      const applicable = ((contraRows ?? []) as Contraindication[]).filter((row) =>
        dogConditions.has(row.condition.toLowerCase().trim())
      );

      for (const rule of applicable) {
        if (rule.contraindicated_ingredient) {
          // Ingredient-based contraindication: exclude foods containing it.
          const { data: matches, error: matchError } = await supabaseAdmin
            .from('food_ingredients')
            .select('food_id')
            .ilike('ingredient_name', `%${rule.contraindicated_ingredient}%`);

          if (matchError) throw matchError;

          for (const match of matches ?? []) {
            addExcluded(
              match.food_id,
              `Not suitable for ${rule.condition}: contains ${rule.contraindicated_ingredient}`
            );
          }
        } else if (
          rule.nutrient === CARBOHYDRATE_NUTRIENT &&
          rule.comparator &&
          rule.threshold != null
        ) {
          // Derived-carbohydrate rule (e.g. a gut-biome or metabolic finding
          // calling for reduced carbohydrate). Computed by difference from the
          // printed fractions; foods with an incomplete panel yield null and
          // are NEVER excluded — same "unknown is not a breach" rule as the
          // stored-column path below.
          const { data: nutrientRows, error: nutrientError } = await supabaseAdmin
            .from('foods')
            .select('id, protein_pct, fat_pct, fibre_pct, moisture_pct, ash_pct');

          if (nutrientError) throw nutrientError;

          for (const row of nutrientRows ?? []) {
            const estimate = estimateCarbohydrate(row as Record<string, number | null>);
            if (!estimate) continue;

            const value = estimate.percent;
            const threshold = rule.threshold;
            const breached =
              (rule.comparator === '>' && value > threshold) ||
              (rule.comparator === '>=' && value >= threshold) ||
              (rule.comparator === '<' && value < threshold) ||
              (rule.comparator === '<=' && value <= threshold);

            if (breached) {
              addExcluded(
                (row as { id: string }).id,
                `Not suitable for ${rule.condition}: estimated carbohydrate ${rule.comparator} ${threshold}%`,
              );
            }
          }
        } else if (rule.nutrient && rule.comparator && rule.threshold != null) {
          // Nutrient-threshold contraindication: exclude foods whose nutrient
          // value breaches the bound. Foods with a NULL value for that nutrient
          // are NOT excluded (we can't assert a breach on unknown data — a data
          // completeness caveat, not a safety guess: nutrient columns are
          // owner/vet-populated and start NULL).
          const pgOp = COMPARATOR_TO_PG_OP[rule.comparator];
          if (!pgOp) continue;

          const { data: matches, error: matchError } = await supabaseAdmin
            .from('foods')
            .select('id')
            .not(rule.nutrient, 'is', null)
            .filter(rule.nutrient, pgOp, rule.threshold);

          if (matchError) throw matchError;

          for (const match of matches ?? []) {
            addExcluded(
              match.id,
              `Not suitable for ${rule.condition}: ${rule.nutrient.replace('_pct', '')} ${rule.comparator} ${rule.threshold}%`
            );
          }
        }
      }
    }

    // Suitable food IDs = all foods − excluded foods.
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
 * Check if a specific food is suitable for a dog (given restrictions/conditions).
 */
export async function isFoodSuitable(dogId: string, foodId: string): Promise<boolean> {
  const result = await applyHardFilter(dogId);
  return result.suitable_food_ids.includes(foodId);
}
