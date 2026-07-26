import { supabaseAdmin } from './supabase';
import { DogIngredientSuspect, IngredientOutcomeSignal } from './types';
import { isSuspectSetNarrowedEnough } from './switchAnalysis';

/**
 * Wires the correlation engine's output into per-food recommendation scoring
 * (`recommendationScoring.ts`'s `correlation_signal`).
 *
 * Two inputs, both dog-level and fetched once per request:
 *
 * 1. **`ingredient_outcome_signals`** — averaged across the signals whose
 *    ingredient appears in the candidate food. Switch-derived rows
 *    (`evidence_basis = 'food_switch'`) are PREFERRED whenever the dog has
 *    any: they are attributed to what actually changed across a food switch,
 *    whereas `single_food_period` rows credit every ingredient in a food
 *    equally and say very little. Mixing the two would let 30 weak signals
 *    drown out one good one.
 *
 * 2. **`dog_ingredient_suspects`** — the rolling suspect set. Applied as a
 *    PREFERENCE, never an exclusion: foods that break the suspect set score
 *    better, foods that carry it score worse, and nothing is filtered out.
 *    That separation is not stylistic. The deterministic hard filter
 *    (`hardFilter.ts`) is reserved for vet-gated facts — diagnosed allergies
 *    and approved contraindications. A logged suspicion is a hypothesis, and
 *    blending the two would breach the safety-layer separation.
 *
 * `correlation_strength` is already in [-1, 1]; rescaled to [0, 1] here to
 * match the other scoring factors (0 = worst, 1 = best), the same convention
 * as nutritional_fit/budget_fit.
 *
 * No matching signals (new dog, or ingredients this dog has no history with)
 * -> neutral 0.5, the same "don't guess, stay neutral" convention
 * budgetScoring.ts uses when no budget is set — NOT 0, which would wrongly
 * imply a known-bad result.
 */

/**
 * Bounded suspect adjustments. Tunable heuristics, flagged as such in the same
 * spirit as CONFIDENCE_THRESHOLDS — deliberately small, because this is a
 * nudge in ranking and must never approach the effect of an exclusion.
 */
export const SUSPECT_SCORING = {
  penaltyPerSuspect: 0.08,
  maxPenalty: 0.3,
  /** For a food carrying none of the suspects at all — the point of the exercise. */
  breaksSetBonus: 0.15,
};

export interface DogCorrelationContext {
  signals: IngredientOutcomeSignal[];
  suspects: DogIngredientSuspect[];
  /** True when switch-derived signals exist, so the weak per-period ones were dropped. */
  usingSwitchEvidence: boolean;
  /**
   * False when the suspect set is too broad or backed by too few failed
   * switches to act on. The set is NOT applied to scoring while this is false.
   */
  suspectsNarrowedEnough: boolean;
}

export interface CorrelationSignalResult {
  score: number; // 0-1, 0.5 = neutral/no data
  sampleBackedIngredientCount: number;
  /** Suspect-set ingredients this food actually contains. */
  suspectIngredientsPresent: string[];
  summary: string;
}

const NEUTRAL_SCORE = 0.5;

/**
 * Loads everything the scorer needs for one dog, in two queries.
 */
export async function fetchDogCorrelationContext(dogId: string): Promise<DogCorrelationContext> {
  const [{ data: signalRows, error: signalError }, { data: suspectRows, error: suspectError }] =
    await Promise.all([
      supabaseAdmin
        .from('ingredient_outcome_signals')
        .select('*')
        .eq('dog_id', dogId)
        .not('confidence_flag', 'is', null),
      supabaseAdmin.from('dog_ingredient_suspects').select('*').eq('dog_id', dogId),
    ]);

  if (signalError) throw signalError;
  if (suspectError) throw suspectError;

  const allSignals = (signalRows ?? []) as IngredientOutcomeSignal[];
  const switchSignals = allSignals.filter((s) => s.evidence_basis === 'food_switch');
  const usingSwitchEvidence = switchSignals.length > 0;

  const suspects = (suspectRows ?? []) as DogIngredientSuspect[];

  return {
    signals: usingSwitchEvidence ? switchSignals : allSignals,
    suspects,
    usingSwitchEvidence,
    suspectsNarrowedEnough: isSuspectSetNarrowedEnough(
      suspects.map((s) => ({ poorFoodCount: s.poor_food_count }))
    ),
  };
}

/**
 * Back-compat shim for callers that only want the signals.
 * @deprecated Prefer fetchDogCorrelationContext, which also loads the suspect set.
 */
export async function fetchDogCorrelationSignals(dogId: string): Promise<IngredientOutcomeSignal[]> {
  const context = await fetchDogCorrelationContext(dogId);
  return context.signals;
}

/**
 * Scores one food. Pure — the caller passes the food's ingredient names.
 *
 * This used to run its own `food_ingredients` query per food. That was one
 * round trip per candidate (~270 per request) and had simply never fired,
 * because the function short-circuits when the dog has no signals and no dog
 * has ever had any. Populating signals would have switched it on. The
 * recommendations route already fetches every candidate's full detail in one
 * query, so the names are handed in instead.
 */
export function scoreCorrelationSignalForFood(
  foodIngredientNames: string[],
  context: DogCorrelationContext
): CorrelationSignalResult {
  const foodIngredients = new Set(
    foodIngredientNames.map((n) => n.trim().toLowerCase()).filter(Boolean)
  );

  // --- Suspect-set preference ---------------------------------------------
  // Only applied once the set is genuinely narrow and backed by more than one
  // failed switch; before that it is noise, and penalising every food for
  // containing "cereals" ranks nothing.
  const suspectIngredientsPresent = context.suspectsNarrowedEnough
    ? context.suspects
        .map((s) => s.ingredient_name.toLowerCase())
        .filter((name) => foodIngredients.has(name))
        .sort()
    : [];

  let suspectAdjustment = 0;
  let suspectNote = '';

  if (context.suspectsNarrowedEnough && context.suspects.length > 0) {
    if (suspectIngredientsPresent.length === 0) {
      suspectAdjustment = SUSPECT_SCORING.breaksSetBonus;
      suspectNote =
        ' It contains none of the ingredients that have been present every time your dog did poorly — worth discussing with your vet.';
    } else {
      suspectAdjustment = -Math.min(
        suspectIngredientsPresent.length * SUSPECT_SCORING.penaltyPerSuspect,
        SUSPECT_SCORING.maxPenalty
      );
      suspectNote = ` It contains ${suspectIngredientsPresent.length} ingredient(s) present every time your dog did poorly (${suspectIngredientsPresent.join(', ')}) — worth discussing with your vet.`;
    }
  }

  // --- Signal average ------------------------------------------------------
  const matching = context.signals.filter((s) =>
    foodIngredients.has(s.ingredient_name.toLowerCase())
  );

  const clamp = (n: number) => Math.max(0, Math.min(1, n));

  if (context.signals.length === 0 || matching.length === 0) {
    const base = context.signals.length === 0
      ? 'No correlation history yet for this dog.'
      : "No correlation history for this food's ingredients yet.";
    return {
      score: clamp(NEUTRAL_SCORE + suspectAdjustment),
      sampleBackedIngredientCount: 0,
      suspectIngredientsPresent,
      summary: `${base}${suspectNote}`,
    };
  }

  const avgStrength =
    matching.reduce((sum, s) => sum + (s.correlation_strength ?? 0), 0) / matching.length;
  const score = clamp((avgStrength + 1) / 2 + suspectAdjustment); // rescale [-1,1] -> [0,1]

  const lowSampleCount = matching.filter((s) => s.confidence_flag === 'low_sample').length;
  const sampleCaveat =
    lowSampleCount > 0
      ? ` (${lowSampleCount} of ${matching.length} based on a low sample — treat cautiously)`
      : '';

  const basisNote = context.usingSwitchEvidence
    ? "your dog's response to actual food changes"
    : "your dog's logged history";

  return {
    score,
    sampleBackedIngredientCount: matching.length,
    suspectIngredientsPresent,
    summary: `Based on ${basisNote} with ${matching.length} ingredient(s) in this food${sampleCaveat}.${suspectNote}`,
  };
}
