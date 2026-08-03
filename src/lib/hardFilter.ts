import { supabaseAdmin } from './supabase';
import { HardFilterResult } from './types';
import { estimateCarbohydrate } from './carbohydrate';
import { loadDietExposureAudit } from './dietPeriods';
import { ageInMonths } from './lifeStage';
import type { LifeStage } from './types';

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
  name: string;
  ingredient_data_status: string;
  product_availability_status: string;
  suitable_age_min_months: number | null;
  suitable_age_max_months: number | null;
}

export interface DogLifeStageContext {
  lifeStage: LifeStage | null;
  ageMonths: number | null;
}

const SENIOR_PRODUCT_PATTERN = /\bsenior\b/i;
const GROWTH_PRODUCT_PATTERN = /\b(?:puppy|junior)\b/i;

/**
 * A food explicitly recorded for a different life stage is not a valid meal
 * candidate. Product-name matching is deliberately limited to exact
 * whole-word stage labels; "juniper" must never be treated as "junior".
 */
export function foodLifeStageEligibility(
  food: Pick<
    CandidateFoodRow,
    'name' | 'suitable_age_min_months' | 'suitable_age_max_months'
  >,
  dog: DogLifeStageContext
): { eligible: boolean; reason: string | null } {
  const explicitlySenior = SENIOR_PRODUCT_PATTERN.test(food.name);
  const explicitlyGrowth = GROWTH_PRODUCT_PATTERN.test(food.name);

  if (explicitlySenior && dog.lifeStage !== 'senior') {
    return {
      eligible: false,
      reason:
        dog.lifeStage === null
          ? 'Senior life-stage food cannot be confirmed suitable because the dog’s life stage is unknown.'
          : 'Senior life-stage food is not suitable for this dog’s recorded life stage.',
    };
  }
  if (explicitlyGrowth && dog.lifeStage !== 'puppy') {
    return {
      eligible: false,
      reason:
        dog.lifeStage === null
          ? 'Puppy/junior food cannot be confirmed suitable because the dog’s life stage is unknown.'
          : 'Puppy/junior food is not suitable for this dog’s recorded life stage.',
    };
  }

  const hasRecordedRange =
    food.suitable_age_min_months !== null || food.suitable_age_max_months !== null;
  if (!hasRecordedRange) return { eligible: true, reason: null };
  if (dog.ageMonths === null) {
    return {
      eligible: false,
      reason: 'Age-restricted food cannot be confirmed suitable because the dog’s age is unknown.',
    };
  }

  if (
    food.suitable_age_min_months !== null &&
    dog.ageMonths < food.suitable_age_min_months
  ) {
    return {
      eligible: false,
      reason: `Food is recorded for dogs aged ${food.suitable_age_min_months} months or older.`,
    };
  }
  if (
    food.suitable_age_max_months !== null &&
    dog.ageMonths > food.suitable_age_max_months
  ) {
    return {
      eligible: false,
      reason: `Food is recorded for dogs aged ${food.suitable_age_max_months} months or younger.`,
    };
  }

  return { eligible: true, reason: null };
}

/**
 * True when a dog has at least one criterion that would exclude a food based
 * on its ingredients: an explicit restriction, or a recorded health
 * condition.
 *
 * Owner decision (2026-07-28, DECISION 1): the gate applies whenever the dog
 * has ANY dog_restrictions row OR ANY dog_health_conditions row — not only
 * when a condition happens to have an approved ingredient-based
 * contraindication mapped. A food with no ingredient list on record cannot
 * be confirmed free of an unmapped condition's risk either, so "no approved
 * mapping yet" must not read as "safe to skip the gate".
 *
 * This decides whether the ingredient-completeness gate below applies at
 * all. A dog with neither gets today's behaviour (no gate, full candidate
 * pool including foods with no composition data) — the gate exists to stop
 * a missing ingredient list from reading as "no allergen match found" for a
 * dog who actually needs that match to be checked, not to thin every dog's
 * results.
 */
export function dogNeedsIngredientGate(
  hasIngredientRestrictions: boolean,
  hasAnyHealthCondition: boolean
): boolean {
  return hasIngredientRestrictions || hasAnyHealthCondition;
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
  opts: {
    needsIngredientGate: boolean;
    foodIdsWithIngredients: ReadonlySet<string>;
    dogLifeStage?: DogLifeStageContext;
  }
): CandidateFoodRow[] {
  return foods.filter((food) => {
    if (UNAVAILABLE_STATUSES.has(food.product_availability_status)) return false;
    if (
      opts.dogLifeStage &&
      !foodLifeStageEligibility(food, opts.dogLifeStage).eligible
    ) {
      return false;
    }
    if (opts.needsIngredientGate) {
      if (food.ingredient_data_status !== 'complete') return false;
      if (!opts.foodIdsWithIngredients.has(food.id)) return false;
    }
    return true;
  });
}

/**
 * What-if overrides for the admin decision-trace sandbox
 * (src/app/api/admin/research/decision-trace/route.ts). Every field is
 * additive and optional: when `overrides` is omitted entirely, this function
 * is byte-identical to its pre-Gate-5 behaviour, and every real call site
 * (api/recommendations/route.ts, isFoodSuitable) is unaffected. Nothing here
 * is persisted — a caller passing overrides is always a scratch computation.
 */
export interface HardFilterOverrides {
  restrictions?: string[];
  conditions?: string[];
  life_stage?: LifeStage | null;
  date_of_birth?: string | null;
}

export async function applyHardFilter(
  dogId: string,
  overrides?: HardFilterOverrides
): Promise<HardFilterResult> {
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
    const [
      { data: restrictionRows, error: restrictionError },
      { data: conditionRows, error: conditionError },
      { data: dogRow, error: dogError },
    ] =
      await Promise.all([
        supabaseAdmin.from('dog_restrictions').select('substance').eq('dog_id', dogId),
        supabaseAdmin.from('dog_health_conditions').select('condition').eq('dog_id', dogId),
        supabaseAdmin
          .from('dogs')
          .select('date_of_birth, life_stage')
          .eq('id', dogId)
          .maybeSingle(),
      ]);

    if (restrictionError) throw restrictionError;
    if (conditionError) throw conditionError;
    if (dogError) throw dogError;
    if (!dogRow) throw new Error('Dog not found');

    // What-if substitution happens right here, once, before anything below
    // reads restrictions/conditions/life-stage — everything downstream is
    // unaware whether a value came from the database or a sandbox override.
    const restrictions = overrides?.restrictions
      ? overrides.restrictions.map((substance) => ({ substance }))
      : restrictionRows;
    const conditions = overrides?.conditions
      ? overrides.conditions.map((condition) => ({ condition }))
      : conditionRows;
    const effectiveLifeStage =
      overrides?.life_stage !== undefined ? overrides.life_stage : (dogRow.life_stage as LifeStage | null);
    const effectiveDateOfBirth =
      overrides?.date_of_birth !== undefined ? overrides.date_of_birth : dogRow.date_of_birth;

    const dogLifeStage: DogLifeStageContext = {
      lifeStage: effectiveLifeStage,
      ageMonths: effectiveDateOfBirth ? ageInMonths(effectiveDateOfBirth) : null,
    };

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
    const currentDietExposure = await loadDietExposureAudit(dogId, [
      ...(restrictions ?? []).map((row) => row.substance),
      ...applicable
        .map((row) => row.contraindicated_ingredient)
        .filter((value): value is string => Boolean(value)),
    ]);

    const hasIngredientRestrictions = !!restrictions && restrictions.length > 0;
    // DECISION 1: any recorded health condition triggers the gate, whether or
    // not it happens to have an approved ingredient contraindication mapped.
    const hasAnyHealthCondition = dogConditions.size > 0;
    const needsIngredientGate = dogNeedsIngredientGate(
      hasIngredientRestrictions,
      hasAnyHealthCondition
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
      .select(
        'id, brand, name, ingredient_data_status, product_availability_status, suitable_age_min_months, suitable_age_max_months'
      )
      .eq('is_treat', false);

    if (foodError) throw foodError;
    if (!foods) {
      return {
        excluded_foods: [],
        excluded_reasons: [],
        suitable_food_ids: [],
        current_diet_exposure: currentDietExposure,
      };
    }

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
      { needsIngredientGate, foodIdsWithIngredients, dogLifeStage }
    );
    const candidateFoodIds = new Set(candidateFoods.map((f) => f.id));

    // DECISION 1 (owner, 2026-07-28): record the audit reason for foods the
    // gate itself dropped — a food that is available and not a treat, but
    // still gated out for having no (complete) ingredient list, is excluded
    // specifically because its composition cannot be checked, not because it
    // was unavailable. Availability exclusions are intentionally not
    // recorded here — this reason is only for the ingredient-completeness gate.
    if (needsIngredientGate) {
      for (const food of foods as unknown as CandidateFoodRow[]) {
        if (UNAVAILABLE_STATUSES.has(food.product_availability_status)) continue;
        const failsGate =
          food.ingredient_data_status !== 'complete' || !foodIdsWithIngredients.has(food.id);
        if (failsGate) {
          addExcluded(food.id, 'No ingredient list on record, cannot confirm absence.');
        }
      }
    }

    for (const food of foods as unknown as CandidateFoodRow[]) {
      if (UNAVAILABLE_STATUSES.has(food.product_availability_status)) continue;
      const eligibility = foodLifeStageEligibility(food, dogLifeStage);
      if (!eligibility.eligible && eligibility.reason) {
        addExcluded(food.id, eligibility.reason);
      }
    }

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
      current_diet_exposure: currentDietExposure,
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
