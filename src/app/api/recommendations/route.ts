import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { Dog, Food } from '@/lib/types';
import { applyHardFilter } from '@/lib/hardFilter';
import { calculateDER } from '@/lib/nutritionalScoring';
import {
  getActiveScoringWeights,
  normalizeWeights,
  scoreFood,
  ScoredFood,
} from '@/lib/recommendationScoring';
import { retrieveResearchFor } from '@/lib/ragRetrieval';
import { fetchDogCorrelationSignals } from '@/lib/correlationScoring';

const DISCLAIMER =
  'This is a decision-support tool, not veterinary advice. Always consult your vet before changing your dog\'s diet, especially if your dog has existing health conditions.';

const TOP_N = 10;
const RESEARCH_TOP_K = 5;
// Research scoring makes one Claude Sonnet call per candidate food. To keep
// request latency/cost bounded regardless of how large the food dataset
// grows, candidates are scored in small concurrent batches rather than all
// at once (30 candidates today; unbounded Promise.all would scale linearly
// with dataset size and risk provider rate limits). This is an engineering
// choice, not a spec requirement — flagged here and in BUILD_PROGRESS.md.
const SCORING_BATCH_SIZE = 5;

/**
 * getRecommendations (Part B)
 *
 * Input: dog_id, optional budget_override.
 * Flow (architecture doc §5):
 *   1. Hard filter (deterministic, §2) — excludes restricted-ingredient foods
 *   2. Retrieve RAG research context for this dog's profile (Phase 4)
 *   3. Score remaining candidates: nutritional_fit + research_relevance +
 *      budget_fit (correlation_signal stays 0 until Phase 6)
 *   4. Return top 10 with confidence + plain-language reason
 */
export async function POST(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const body = await request.json();
    const { dog_id, budget_override }: { dog_id: string; budget_override?: number } = body;

    if (!dog_id) {
      return NextResponse.json({ error: 'dog_id is required' }, { status: 400 });
    }

    // Verify dog ownership
    const { data: dog, error: dogError } = await supabaseAdmin
      .from('dogs')
      .select('*')
      .eq('id', dog_id)
      .eq('owner_id', userId)
      .single();

    if (dogError || !dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const typedDog = dog as Dog;

    // 1. Hard filter — deterministic SQL, never LLM (architecture doc §2)
    const hardFilterResult = await applyHardFilter(dog_id);

    if (hardFilterResult.suitable_food_ids.length === 0) {
      return NextResponse.json(
        {
          dog_id,
          recommendations: [],
          excluded_count: hardFilterResult.excluded_foods.length,
          total_candidates: 0,
          message:
            'No foods remain after applying your dog\'s restrictions. Try broadening the dataset or reviewing logged restrictions.',
          disclaimer: DISCLAIMER,
        },
        { status: 200 }
      );
    }

    // Fetch full records for the surviving candidates
    const { data: candidateFoods, error: foodsError } = await supabaseAdmin
      .from('foods')
      .select('*')
      .in('id', hardFilterResult.suitable_food_ids);

    if (foodsError) {
      return NextResponse.json({ error: foodsError.message }, { status: 500 });
    }

    // 2. Retrieve RAG research context for this dog's profile (Phase 4) —
    // dog-level, computed once and reused across every candidate food below,
    // same pattern as der/weights.
    const researchChunks = await retrieveResearchFor(dog_id, RESEARCH_TOP_K);

    // Phase 6 — this dog's own ingredient_outcome_signals, fetched once and
    // reused across every candidate food, same pattern as researchChunks.
    const correlationSignals = await fetchDogCorrelationSignals(dog_id);

    // 3. Score remaining candidates
    const weights = normalizeWeights(await getActiveScoringWeights());
    const der = await calculateDER(typedDog);
    const monthlyBudget = budget_override ?? typedDog.monthly_food_budget ?? null;

    const foodsToScore = (candidateFoods ?? []) as Food[];
    const scored: ScoredFood[] = [];
    for (let i = 0; i < foodsToScore.length; i += SCORING_BATCH_SIZE) {
      const batch = foodsToScore.slice(i, i + SCORING_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((food) =>
          scoreFood(typedDog, food, der, weights, monthlyBudget, researchChunks, correlationSignals)
        )
      );
      scored.push(...batchResults);
    }

    scored.sort((a, b) => b.overall_score - a.overall_score);
    const top = scored.slice(0, TOP_N);

    const recommendations = top.map((s) => ({
      food_id: s.food.id,
      brand: s.food.brand,
      name: s.food.name,
      food_type: s.food.food_type,
      score: Math.round(s.overall_score * 1000) / 1000,
      confidence: s.confidence,
      reason: s.reason,
      nutritional_fit: Math.round(s.nutritional_fit.score * 1000) / 1000,
      research_relevance: Math.round(s.research_relevance * 1000) / 1000,
      research_summary: s.research_summary,
      budget_fit: Math.round(s.budget_fit.score * 1000) / 1000,
      correlation_signal: Math.round(s.correlation_signal * 1000) / 1000,
      correlation_summary: s.correlation_summary,
      estimated_monthly_cost: s.budget_fit.estimatedMonthlyCost
        ? Math.round(s.budget_fit.estimatedMonthlyCost * 100) / 100
        : null,
    }));

    return NextResponse.json(
      {
        dog_id,
        recommendations,
        excluded_count: hardFilterResult.excluded_foods.length,
        excluded_reasons: hardFilterResult.excluded_reasons,
        total_candidates: candidateFoods?.length ?? 0,
        weights_used: weights,
        life_stage_used: der.lifeStage,
        weight_assumed: der.weightAssumed,
        // Research context surfaced for transparency (architecture doc §9 /
        // Phase 4 spec item 2 — "include source_url + title for transparency").
        research_context: researchChunks.map((c) => ({
          topic: c.topic,
          title: c.title,
          source_url: c.source_url,
          similarity: Math.round(c.similarity * 1000) / 1000,
        })),
        disclaimer: DISCLAIMER,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get recommendations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
