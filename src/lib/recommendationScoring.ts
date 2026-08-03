import { supabaseAdmin } from './supabase';
import { Dog, Food } from './types';
import { DerResult, NutritionalFitResult, scoreNutritionalFitForFood } from './nutritionalScoring';
import { BudgetFitResult, scoreBudgetFit } from './budgetScoring';
import { type ResearchRelevanceResult } from './researchScoring';
import { type DogCorrelationContext, scoreCorrelationSignalForFood } from './correlationScoring';

/**
 * Recommendation scoring (Phase 3; Gate 5 research boundary)
 *
 * overall_score = nutritional_fit_weight*nutritional_fit
 *               + research_relevance_weight*research_relevance   (Gate 4: always exactly 0. Gate 5, when enabled: 0.5-neutral, ±0.3 capped — see below)
 *               + budget_fit_weight*budget_fit
 *               + correlation_signal_weight*correlation_signal   (Phase 6 — dog's own log history, real; 0.5 neutral if no data yet)
 *
 * Weights come from `recommendation_scoring_weights` (active row), normalized
 * if they don't sum to 1.0 — never hardcoded here.
 *
 * This function is agnostic to WHICH research result it's given: the caller
 * decides. Real recommendations (api/recommendations/route.ts) pass the
 * unmodified Gate 4 forced-zero result unless `research_scoring_enabled` is
 * true, in which case they pass the real Gate 5 result
 * (researchScoringPolicy.ts's computeResearchRankingResult — a *different*,
 * deliberately 0.5-neutral convention, necessary because Gate 5 must express
 * both supports and cautions_against as a two-sided deviation, which a
 * literal-zero baseline cannot do). The admin decision-trace page computes
 * both, for every food, regardless of the flag.
 */

export interface ScoringWeights {
  nutritional_fit_weight: number;
  research_relevance_weight: number;
  budget_fit_weight: number;
  correlation_signal_weight: number;
  // Gate 5 switch (recommendation_scoring_weights.research_scoring_enabled,
  // default false). Independent of research_relevance_weight's magnitude:
  // false means research contributes zero to every real recommendation
  // regardless of what the weight is set to. Flipping this on is the intended
  // way to make research affect real client-facing scores later, with no
  // code deploy. See src/lib/researchScoringPolicy.ts.
  research_scoring_enabled: boolean;
}

// Documented default from architecture doc §5 / Part A's column defaults —
// only used as a last-resort safety net if the reference table is somehow
// completely empty (should always be seeded per Phase 1).
const FALLBACK_WEIGHTS: ScoringWeights = {
  nutritional_fit_weight: 0.35,
  research_relevance_weight: 0.25,
  budget_fit_weight: 0.2,
  correlation_signal_weight: 0.2,
  research_scoring_enabled: false,
};

export async function getActiveScoringWeights(): Promise<ScoringWeights> {
  const { data, error } = await supabaseAdmin
    .from('recommendation_scoring_weights')
    .select(
      'nutritional_fit_weight, research_relevance_weight, budget_fit_weight, correlation_signal_weight, research_scoring_enabled'
    )
    .eq('active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  if (!data) return FALLBACK_WEIGHTS;

  return {
    nutritional_fit_weight: Number(data.nutritional_fit_weight),
    research_relevance_weight: Number(data.research_relevance_weight),
    budget_fit_weight: Number(data.budget_fit_weight),
    correlation_signal_weight: Number(data.correlation_signal_weight),
    research_scoring_enabled: Boolean(data.research_scoring_enabled),
  };
}

export function normalizeWeights(weights: ScoringWeights): ScoringWeights {
  const sum =
    weights.nutritional_fit_weight +
    weights.research_relevance_weight +
    weights.budget_fit_weight +
    weights.correlation_signal_weight;

  if (sum <= 0) return FALLBACK_WEIGHTS;
  if (Math.abs(sum - 1) < 0.001) return weights;

  return {
    nutritional_fit_weight: weights.nutritional_fit_weight / sum,
    research_relevance_weight: weights.research_relevance_weight / sum,
    budget_fit_weight: weights.budget_fit_weight / sum,
    correlation_signal_weight: weights.correlation_signal_weight / sum,
    research_scoring_enabled: weights.research_scoring_enabled,
  };
}

export interface ScoredFood {
  food: Food;
  overall_score: number;
  confidence: number;
  nutritional_fit: NutritionalFitResult;
  budget_fit: BudgetFitResult;
  research_relevance: number; // whatever `research` the caller passed in — exactly 0 (Gate 4, default) or a real 0.5-neutral Gate 5 result
  research_summary: string; // matches whichever research_relevance came in
  correlation_signal: number; // Phase 6 — real (0.5 neutral if this dog has no eligible signal history yet)
  correlation_summary: string;
  reason: string;
}

/**
 * Per-food scoring.
 *
 * `research` is whichever deterministic result the caller computed: the
 * Gate 4 forced-zero boundary, or (when enabled) the real Gate 5 policy
 * result. Either way it is always a plain {score, summary} pair with no
 * model call in this function — historical offline scoring code remains
 * available outside this request path but is not a caller here.
 *
 * As of Phase 6 it also takes this dog's ingredient_outcome_signals
 * (fetchDogCorrelationSignals — dog-level, fetched once per request and
 * reused across every candidate food, same pattern as der/weights).
 */
export async function scoreFood(
  dog: Dog,
  food: Food,
  der: DerResult,
  weights: ScoringWeights,
  monthlyBudget: number | null | undefined,
  research: ResearchRelevanceResult,
  correlationContext: DogCorrelationContext,
  foodIngredientNames: string[] = []
): Promise<ScoredFood> {
  const nutritional_fit = scoreNutritionalFitForFood(dog, food, der);
  const budget_fit = scoreBudgetFit(food, der, monthlyBudget);
  const { score: research_relevance, summary: research_summary } = research;
  // Pure and synchronous now — the ingredient names come from the detail the
  // route already fetched for every candidate in one query, instead of this
  // function issuing its own lookup per food.
  const { score: correlation_signal, summary: correlation_summary } = scoreCorrelationSignalForFood(
    foodIngredientNames,
    correlationContext
  );

  const overall_score =
    weights.nutritional_fit_weight * nutritional_fit.score +
    weights.research_relevance_weight * research_relevance +
    weights.budget_fit_weight * budget_fit.score +
    weights.correlation_signal_weight * correlation_signal;

  // Confidence stays the sum of active weights regardless of what research
  // contributed — it reports how much of the formula had a real input at
  // all, not how favourable that input was.
  const confidence = Math.round(
    (weights.nutritional_fit_weight +
      weights.research_relevance_weight +
      weights.budget_fit_weight +
      weights.correlation_signal_weight) *
      100
  ) / 100;

  const reason = buildReason(dog, food, nutritional_fit, budget_fit, research_relevance, research_summary, correlation_summary);

  return {
    food,
    overall_score,
    confidence,
    nutritional_fit,
    budget_fit,
    research_relevance,
    research_summary,
    correlation_signal,
    correlation_summary,
    reason,
  };
}

function buildReason(
  dog: Dog,
  food: Food,
  nutritional_fit: NutritionalFitResult,
  budget_fit: BudgetFitResult,
  research_relevance: number,
  research_summary: string,
  correlation_summary: string
): string {
  const parts: string[] = [];

  const roleDescriptor =
    dog.lifestyle_role === 'pet'
      ? 'your dog\'s activity level'
      : `a ${dog.work_type !== 'none' ? dog.work_type + ' ' : ''}${dog.lifestyle_role} dog's activity level`;

  if (nutritional_fit.calorieDensityScore >= 0.75) {
    parts.push(`calorie density is a good match for ${roleDescriptor}`);
  } else if (nutritional_fit.calorieDensityScore <= 0.35) {
    parts.push(`calorie density is a weaker match for ${roleDescriptor}`);
  } else {
    parts.push(`calorie density is a reasonable match for ${roleDescriptor}`);
  }

  if (nutritional_fit.ageSuitabilityScore < 0.6 || nutritional_fit.sizeSuitabilityScore < 0.6) {
    parts.push('though it sits close to the edge of its stated age/size suitability range');
  }

  if (budget_fit.estimatedMonthlyCost != null) {
    const costText = `est. £${budget_fit.estimatedMonthlyCost.toFixed(2)}/month`;
    if (budget_fit.budgetUsed != null) {
      parts.push(
        budget_fit.score >= 1
          ? `fits within your £${budget_fit.budgetUsed.toFixed(2)}/month budget (${costText})`
          : `runs above your £${budget_fit.budgetUsed.toFixed(2)}/month budget (${costText})`
      );
    } else {
      parts.push(`${costText} — no budget set, so this wasn't scored against one`);
    }
  }

  const base = `Based on your dog's profile: ${parts.join('; ')}.`;
  // research_summary/correlation_summary are surfaced either way — "no
  // relevant research/correlation history found" is honest information, not
  // something to hide (architecture doc §9).
  void research_relevance;
  return `${base} ${research_summary} ${correlation_summary}`;
}
