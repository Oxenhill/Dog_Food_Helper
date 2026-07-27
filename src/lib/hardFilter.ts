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

/** Foods that can never be bought are excluded regardless of ingredient data. */
const UNAVAILABLE_STATUSES = new Set(['unavailable', 'discontinued']);

export interface CandidateFoodRow {
  id: string;
  ingredient_data_status: string;
  product_availability_status: string;
}

/**
 * True when a dog has at least one criterion that would exclude a food based
 * on its ingredients: an explicit restriction, or a health condition matching
 * an approved ingredient-based contraindication.
 *
 * This decides whether the ingredient-completeness gate below applies at all.
 * A dog with no ingredient-based exclusion criterion gets today's behaviour
 * (no gate, full candidate pool) — the gate exists to stop a missing
 * ingredient list from reading as "no allergen match found" for a dog who
 * actually needs that match to be checked, not to thin every dog's results.
 */
export function dogNeedsIngredientGate(
  hasIngredientRestrictions: boolean,
  hasApprovedIngredientContraindications: boolean
): boolean {
  return hasIngredientRestrictions || hasApprovedIngredientContraindications;
}

/**
 * Filters the raw `foods` candidate pool before ingredient/nutrient exclusion
 * runs.
 *
 * - Unavailable/discontinued foods are always dropped — a trust problem
 *   (43/292 foods today), not a safety one, but cheap to fix in the same
 *   pass and easy to revert as its own line if it thins results too far.
 * - When `needsIngredientGate` is true, a food must have
 *   `ingredient_data_status = 'complete'` AND at least one `food_ingredients`
 *   row. Both checks matter independently: some `complete` rows have zero
 *   ingredient rows, so status alone is not sufficient for the allergy path.
 *   Silence (no ingredients to match against) must never be indistinguishable
 *   from "checked and safe".
 */
export function filterCandidateFoods(
  foods: CandidateFoodRow[],
  opts: { needsIngredientGate: boolean; foodIdsWithIngredients: ReadonlySet<string> }
): CandidateFoodRow[] {
  return foods.filter((food) => {
    if (UNAVAILABLE_STATUSES.has(food.product_availability_status)) return false;
    if (opts.needsIngredientGate) {
      if (food.ingredient_data_status !== 'complete') return false;
      if (!opts.foodIdsWithIngredients.has(food.id)) return false;
    }
    return true;
  });
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

    // Pull only approved contraindication rules; match to this dog's
    // conditions in memory (case-insensitive). Approved-only is enforced here
    // so a draft mapping can never affect a real recommendation. Fetched
    // ahead of the candidate query below because whether this dog has any
    // *ingredient*-based contraindication decides whether the ingredient
    // gate applies.
    const dogConditions = new Set(
      (conditions ?? []).map((c) => c.condition.toLowerCase().trim()).filter(Boolean)
    );

    const { data: contraRows, error: contraError } = await supabaseAdmin
      .from('condition_contraindications')
      .select('condition, contraindicated_ingredient, nutrient, comparator, threshold')
      .eq('approved', true);

    if (contraError) throw contraError;

    const applicable = ((contraRows ?? []) as Contraindication[]).filter((row) =>
      dogConditions.has(row.condition.toLowerCase().trim())
    );

    const hasIngredientRestrictions = !!restrictions && restrictions.length > 0;
    const hasApprovedIngredientContraindications = applicable.some(
      (rule) => !!rule.contraindicated_ingredient
    );
    const needsIngredientGate = dogNeedsIngredientGate(
      hasIngredientRestrictions,
      hasApprovedIngredientContraindications
    );

    // Get the candidate universe.
    //
    // Treats are excluded here rather than filtered out later: this is a MEAL
    // recommendation, and offering a treat or chew as a dog's main food would
    // be wrong regardless of how well it scored. Treats are still logged as
    // food events and still feed the correlation engine — they are simply not
    // candidates for "what should I feed my dog".
    const { data: foods, error: foodError } = await supabaseAdmin
      .from('foods')
      .select('id, brand, name, ingredient_data_status, product_availability_status')
      .eq('is_treat', false);

    if (foodError) throw foodError;
    if (!foods) return { excluded_foods: [], excluded_reasons: [], suitable_food_ids: [] };

    // Only fetched when actually needed — a dog with no ingredient-based
    // exclusion criterion never pays this extra query.
    let foodIdsWithIngredients: ReadonlySet<string> = new Set();
    if (needsIngredientGate) {
      const { data: ingredientFoodIds, error: ingredientFoodIdsError } = await supabaseAdmin
        .from('food_ingredients')
        .select('food_id');

      if (ingredientFoodIdsError) throw ingredientFoodIdsError;
      foodIdsWithIngredients = new Set((ingredientFoodIds ?? []).map((row) => row.food_id));
    }

    const candidateFoods = filterCandidateFoods(
      foods as unknown as CandidateFoodRow[],
      { needsIngredientGate, foodIdsWithIngredients }
    );
    const candidateFoodIds = new Set(candidateFoods.map((f) => f.id));

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
    // `applicable` was already resolved above (needed to decide the ingredient
    // gate before the candidate query ran) — reused here rather than re-fetched.
    {
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

    // Suitable food IDs = the gated candidate pool − excluded foods.
    const suitable_food_ids = foods
      .filter((f) => candidateFoodIds.has(f.id) && !excluded_foods.has(f.id))
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
