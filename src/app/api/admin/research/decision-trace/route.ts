import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { Dog, Food, LifeStage } from '@/lib/types';
import { applyHardFilter, HardFilterOverrides } from '@/lib/hardFilter';
import { calculateDER } from '@/lib/nutritionalScoring';
import { getActiveScoringWeights, normalizeWeights, scoreFood, ScoredFood } from '@/lib/recommendationScoring';
import { fetchDogCorrelationContext } from '@/lib/correlationScoring';
import { fetchFoodFullMany, flattenIngredientNames } from '@/lib/foodFull';
import {
  createActiveClaimEvidenceRetriever,
  researchRankingResult,
  supabaseActiveClaimDataSource,
  withConditionRestrictionOverrides,
} from '@/lib/activeClaimRetrieval';
import { computeResearchRankingResult, computeResearchScoringTrace, RESEARCH_SCORING_POLICY } from '@/lib/researchScoringPolicy';

/**
 * Admin decision-trace: pick any registered dog, see the full recommendation
 * engine trace, and see the ranked output computed TWICE -- with the real
 * Gate 5 research contribution applied, and with it forced to zero -- so the
 * difference research makes is directly visible rather than inferred.
 *
 * Also supports the what-if sandbox: `overrides` substitutes a dog's
 * restrictions/conditions/life-stage/date-of-birth for this one scratch
 * computation only. Nothing here is ever persisted (no dog_recommendation_sets
 * insert, unlike the real POST /api/recommendations).
 *
 * Boundary: this endpoint calls the exact same applyHardFilter as production.
 * It never re-implements or loosens hard-filter exclusion logic -- the "what
 * changed" comparison is entirely about the RESEARCH contribution to score,
 * never about which foods survive the safety gate.
 */

const TOP_N = 10;

interface OverridesBody {
  restrictions?: string[];
  conditions?: string[];
  life_stage?: LifeStage | null;
  date_of_birth?: string | null;
}

function buildEffectiveDog(dog: Dog, overrides?: OverridesBody): Dog {
  if (!overrides) return dog;
  const effective: Dog = { ...dog };
  if (overrides.life_stage !== undefined) {
    effective.life_stage = overrides.life_stage ?? undefined;
  }
  if (overrides.date_of_birth !== undefined) {
    effective.date_of_birth = overrides.date_of_birth ?? undefined;
  }
  return effective;
}

function rankTop(
  scored: { food: { id: string; brand: string; name: string }; overall_score: number }[],
  hasIngredients: (foodId: string) => boolean
) {
  const sorted = [...scored].sort((a, b) => {
    if (b.overall_score !== a.overall_score) return b.overall_score - a.overall_score;
    const aHas = hasIngredients(a.food.id);
    const bHas = hasIngredients(b.food.id);
    if (aHas === bHas) return 0;
    return aHas ? -1 : 1;
  });
  return sorted.slice(0, TOP_N).map((s, index) => ({
    rank: index + 1,
    food_id: s.food.id,
    brand: s.food.brand,
    name: s.food.name,
    score: Math.round(s.overall_score * 1000) / 1000,
  }));
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const {
    dog_id,
    budget_override,
    overrides,
  }: { dog_id?: string; budget_override?: number; overrides?: OverridesBody } =
    (body as Record<string, unknown>) ?? {};

  if (!dog_id || typeof dog_id !== 'string') {
    return NextResponse.json({ error: 'dog_id is required' }, { status: 400 });
  }

  const { data: dogRow, error: dogError } = await supabaseAdmin
    .from('dogs')
    .select('*')
    .eq('id', dog_id)
    .maybeSingle();
  if (dogError) {
    return NextResponse.json({ error: dogError.message }, { status: 500 });
  }
  if (!dogRow) {
    return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
  }
  const realDog = dogRow as Dog;
  const effectiveDog = buildEffectiveDog(realDog, overrides);
  const overridesApplied = Boolean(
    overrides &&
      (overrides.restrictions || overrides.conditions || overrides.life_stage !== undefined || overrides.date_of_birth !== undefined)
  );

  const hardFilterOverrides: HardFilterOverrides | undefined = overridesApplied
    ? {
        restrictions: overrides?.restrictions,
        conditions: overrides?.conditions,
        life_stage: overrides?.life_stage,
        date_of_birth: overrides?.date_of_birth,
      }
    : undefined;

  const hardFilterResult = await applyHardFilter(dog_id, hardFilterOverrides);

  const { data: allFoodRows } = await supabaseAdmin
    .from('foods')
    .select('id, brand, name, food_type')
    .in('id', [...hardFilterResult.suitable_food_ids, ...hardFilterResult.excluded_foods]);
  const foodMetaById = new Map(
    (allFoodRows ?? []).map((row) => [row.id as string, row as { id: string; brand: string; name: string; food_type: string }])
  );

  const excluded = hardFilterResult.excluded_reasons.map((row) => ({
    food_id: row.food_id,
    brand: foodMetaById.get(row.food_id)?.brand ?? null,
    name: foodMetaById.get(row.food_id)?.name ?? null,
    reason: row.reason,
  }));

  if (hardFilterResult.suitable_food_ids.length === 0) {
    return NextResponse.json(
      {
        dog: { id: dog_id, name: realDog.name, overrides_applied: overridesApplied },
        hard_filter: { excluded, suitable_food_count: 0, current_diet_exposure: hardFilterResult.current_diet_exposure },
        candidates: [],
        ranked_with_research: [],
        ranked_without_research: [],
        policy: RESEARCH_SCORING_POLICY,
        message: 'No foods remain after applying restrictions/conditions for this dog (or the what-if overrides).',
        generated_at: new Date().toISOString(),
      },
      { status: 200 }
    );
  }

  const { data: candidateFoods } = await supabaseAdmin
    .from('foods')
    .select('*')
    .in('id', hardFilterResult.suitable_food_ids);
  const foodsToScore = (candidateFoods ?? []) as Food[];

  const detail = await fetchFoodFullMany(foodsToScore.map((f) => f.id as string));

  // Correlation history is the dog's real logged data -- never part of the
  // what-if sandbox (see decision brief: overridable attributes are
  // restrictions/conditions/life-stage, not fabricated outcome history).
  const correlationContext = await fetchDogCorrelationContext(dog_id);

  const activeClaimSource = withConditionRestrictionOverrides(supabaseActiveClaimDataSource, {
    conditions: overrides?.conditions,
    restrictions: overrides?.restrictions,
  });
  const activeResearch = await createActiveClaimEvidenceRetriever(activeClaimSource)(
    effectiveDog,
    [...detail.values()]
  );

  const weights = normalizeWeights(await getActiveScoringWeights());
  const der = await calculateDER(effectiveDog);
  const monthlyBudget = budget_override ?? effectiveDog.monthly_food_budget ?? null;

  const withResearchScored: ScoredFood[] = [];
  const withoutResearchScored: ScoredFood[] = [];
  const gate5TraceByFoodId = new Map<string, ReturnType<typeof computeResearchScoringTrace>>();

  for (const food of foodsToScore) {
    const evidenceForFood = activeResearch.evidenceByFoodId.get(food.id as string) ?? [];
    const gate5Trace = computeResearchScoringTrace(evidenceForFood);
    gate5TraceByFoodId.set(food.id as string, gate5Trace);
    const ingredientNames = flattenIngredientNames(detail.get(food.id as string)?.ingredients ?? []);

    const [withResearch, withoutResearch] = await Promise.all([
      scoreFood(
        effectiveDog,
        food,
        der,
        weights,
        monthlyBudget,
        computeResearchRankingResult(evidenceForFood),
        correlationContext,
        ingredientNames
      ),
      scoreFood(
        effectiveDog,
        food,
        der,
        weights,
        monthlyBudget,
        researchRankingResult(evidenceForFood.map((e) => e.direction)),
        correlationContext,
        ingredientNames
      ),
    ]);
    withResearchScored.push(withResearch);
    withoutResearchScored.push(withoutResearch);
  }

  const hasIngredients = (foodId: string) => (detail.get(foodId)?.ingredients ?? []).length > 0;
  const rankedWith = rankTop(withResearchScored, hasIngredients);
  const rankedWithout = rankTop(withoutResearchScored, hasIngredients);

  const withByFoodId = new Map(withResearchScored.map((s) => [s.food.id, s]));
  const withoutByFoodId = new Map(withoutResearchScored.map((s) => [s.food.id, s]));

  const candidates = foodsToScore.map((food) => {
    const foodId = food.id as string;
    const withS = withByFoodId.get(foodId)!;
    const withoutS = withoutByFoodId.get(foodId)!;
    const gate5Trace = gate5TraceByFoodId.get(foodId)!;
    return {
      food_id: foodId,
      brand: food.brand,
      name: food.name,
      food_type: food.food_type,
      nutritional_fit_score: Math.round(withS.nutritional_fit.score * 1000) / 1000,
      budget_fit_score: Math.round(withS.budget_fit.score * 1000) / 1000,
      correlation_signal: Math.round(withS.correlation_signal * 1000) / 1000,
      correlation_summary: withS.correlation_summary,
      research_evidence: activeResearch.evidenceByFoodId.get(foodId) ?? [],
      gate5: {
        score: Math.round(gate5Trace.score * 1000) / 1000,
        summary: gate5Trace.summary,
        topics: gate5Trace.topics,
        inert_evidence: gate5Trace.inert_evidence,
      },
      overall_score_with_research: Math.round(withS.overall_score * 1000) / 1000,
      overall_score_without_research: Math.round(withoutS.overall_score * 1000) / 1000,
    };
  });

  return NextResponse.json(
    {
      dog: {
        id: realDog.id,
        name: realDog.name,
        life_stage_recorded: realDog.life_stage ?? null,
        date_of_birth_recorded: realDog.date_of_birth ?? null,
        life_stage_used_for_hard_filter_and_research: effectiveDog.life_stage ?? null,
        date_of_birth_used_for_nutritional_fit_and_age_checks: effectiveDog.date_of_birth ?? null,
        overrides_applied: overridesApplied,
        overrides_used: overridesApplied ? overrides : null,
      },
      hard_filter: {
        excluded,
        excluded_count: hardFilterResult.excluded_foods.length,
        suitable_food_count: hardFilterResult.suitable_food_ids.length,
        current_diet_exposure: hardFilterResult.current_diet_exposure,
      },
      research_runtime: {
        eligible_claim_count: activeResearch.eligibleClaimCount,
        unsupported_claim_count: activeResearch.unsupportedClaimIds.length,
      },
      policy: RESEARCH_SCORING_POLICY,
      weights_used: weights,
      candidates,
      ranked_with_research: rankedWith,
      ranked_without_research: rankedWithout,
      generated_at: new Date().toISOString(),
    },
    { status: 200 }
  );
}
