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
import { fetchDogCorrelationContext } from '@/lib/correlationScoring';
import { fetchFoodFullMany, flattenIngredientNames } from '@/lib/foodFull';
import { deriveDataState, dataStateMessage, needsRefusedDomainCaution, REFUSED_DOMAIN_LINE } from '@/lib/dataState';
import {
  researchRankingResult,
  retrieveActiveClaimEvidence,
} from '@/lib/activeClaimRetrieval';

const DISCLAIMER =
  'This is a decision-support tool, not veterinary advice. Always consult your vet before changing your dog\'s diet, especially if your dog has existing health conditions.';

const TOP_N = 10;
// Research retrieval makes no model or embedding call. Candidate scoring
// remains bounded to preserve the existing correlation runtime behaviour.
const SCORING_BATCH_SIZE = 10;

/**
 * Verify the dog belongs to the caller. Returns null when it doesn't exist or
 * isn't theirs — callers must not distinguish the two (don't leak row existence).
 */
async function loadOwnedDog(dogId: string, userId: string): Promise<Dog | null> {
  const { data, error } = await supabaseAdmin
    .from('dogs')
    .select('*')
    .eq('id', dogId)
    .eq('owner_id', userId)
    .maybeSingle();

  if (error || !data) return null;
  return data as Dog;
}

/**
 * GET /api/recommendations?dog_id=... — the most recently SAVED set.
 *
 * Recommendations are persisted at generation time so a returning owner sees
 * their results immediately instead of paying to recompute them (WS4 #5).
 * Returns `{ saved: null }` when this dog has never had a set generated —
 * that's an empty state, not an error.
 */
export async function GET(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    if (!authedUser) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const dogId = request.nextUrl.searchParams.get('dog_id');
    if (!dogId) {
      return NextResponse.json({ error: 'dog_id is required' }, { status: 400 });
    }

    const dog = await loadOwnedDog(dogId, authedUser.id);
    if (!dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from('dog_recommendation_sets')
      .select('id, generated_at, payload')
      .eq('dog_id', dogId)
      .eq('owner_id', authedUser.id)
      .order('generated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ saved: null }, { status: 200 });
    }

    return NextResponse.json(
      {
        saved: {
          id: data.id,
          generated_at: data.generated_at,
          ...(data.payload as Record<string, unknown>),
        },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Get saved recommendations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * POST /api/recommendations — generate (or regenerate) a set.
 *
 * Flow (architecture doc §5):
 *   1. Hard filter (deterministic, §2) — excludes restricted-ingredient foods
 *   2. Retrieve eligible active claims and deterministically match them
 *   3. Keep the Gate 4 research ranking contribution at exactly zero
 *   4. Score candidates: nutritional_fit + zero research contribution + budget_fit
 *      + correlation_signal
 *   5. Attach each recommended food's full ingredient list and nutrients
 *   6. Persist the set, then return it
 *
 * No language-model, embedding, pending-document RAG or score-queue call
 * happens anywhere in this request.
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

    const typedDog = await loadOwnedDog(dog_id, userId);
    if (!typedDog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    // Restriction substances, for the opacity caution below (composition
    // opacity never gates — see hardFilter.ts — but a dog with a recorded
    // sensitivity still deserves to know a food's label can't rule it out).
    const { data: restrictionRows } = await supabaseAdmin
      .from('dog_restrictions')
      .select('substance')
      .eq('dog_id', dog_id);
    const restrictionSubstances = (restrictionRows ?? []).map((r) => r.substance);

    // DECISION 6 (owner, 2026-07-28): domains the allowlist has since marked
    // approved=false — fetched once, reused per-candidate below rather than a
    // query per food.
    const { data: refusedDomainRows } = await supabaseAdmin
      .from('source_domain_allowlist')
      .select('domain')
      .eq('approved', false);
    const refusedDomains = new Set((refusedDomainRows ?? []).map((r) => r.domain));

    // 1. Hard filter — deterministic SQL, never LLM (architecture doc §2)
    const hardFilterResult = await applyHardFilter(dog_id);

    if (hardFilterResult.suitable_food_ids.length === 0) {
      return NextResponse.json(
        {
          dog_id,
          recommendations: [],
          excluded_count: hardFilterResult.excluded_foods.length,
          total_candidates: 0,
          current_diet_exposure: hardFilterResult.current_diet_exposure,
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

    // Phase 6 — this dog's own correlation signals AND its rolling ingredient
    // suspect set, fetched once and reused across every candidate food.
    // Switch-derived signals take precedence over
    // the weak per-food-period ones; the suspect set is applied as a ranking
    // preference only, never an exclusion.
    const correlationContext = await fetchDogCorrelationContext(dog_id);

    const foodsToScore = (candidateFoods ?? []) as Food[];

    // Full detail (ingredients + nutrients) for every candidate. It supplies
    // both deterministic claim matching and owner-facing composition.
    const detail = await fetchFoodFullMany(foodsToScore.map((f) => f.id));

    // 2. Active claims only: four bounded reads (conditions, claims, documents,
    // chunks) regardless of candidate count, followed by in-memory matching.
    const activeResearch = await retrieveActiveClaimEvidence(
      typedDog,
      [...detail.values()]
    );

    // 4. Score remaining candidates
    const weights = normalizeWeights(await getActiveScoringWeights());
    const der = await calculateDER(typedDog);
    const monthlyBudget = budget_override ?? typedDog.monthly_food_budget ?? null;

    const scored: ScoredFood[] = [];
    for (let i = 0; i < foodsToScore.length; i += SCORING_BATCH_SIZE) {
      const batch = foodsToScore.slice(i, i + SCORING_BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map((food) =>
          scoreFood(
            typedDog,
            food,
            der,
            weights,
            monthlyBudget,
            researchRankingResult(
              (activeResearch.evidenceByFoodId.get(food.id) ?? []).map(
                (evidence) => evidence.direction
              )
            ),
            correlationContext,
            // Flattened, so nested sub-ingredients are matched too — a
            // beef-flavoured food's hidden chicken is a nested row.
            flattenIngredientNames(detail.get(food.id)?.ingredients ?? [])
          )
        )
      );
      scored.push(...batchResults);
    }

    // DECISION 3 (owner, 2026-07-28): at equal score, a food with an
    // ingredient list ranks above one without. Tie-break only — no score
    // number is invented for this.
    scored.sort((a, b) => {
      if (b.overall_score !== a.overall_score) return b.overall_score - a.overall_score;
      const aHasIngredients = (detail.get(a.food.id)?.ingredients ?? []).length > 0;
      const bHasIngredients = (detail.get(b.food.id)?.ingredients ?? []).length > 0;
      if (aHasIngredients === bHasIngredients) return 0;
      return aHasIngredients ? -1 : 1;
    });
    const top = scored.slice(0, TOP_N);

    // 5. Owner-facing food contents (WS4 #3). Clients need to see what is
    // actually in a recommended food, so each result carries its full ordered
    // ingredient list (with any printed percentages, label qualifiers and
    // nested sub-ingredients) plus its guaranteed-analysis nutrients. Already
    // fetched above in one query via the food_full view.
    const recommendations = top.map((s) => {
      const full = detail.get(s.food.id);
      // Warn, never rank down or remove (owner decision, 2026-07-28): a
      // recorded sensitivity plus an opaque legal-category ingredient means
      // the label itself can't confirm the food is free of it — that's
      // different from the food actually containing it, which the
      // named-ingredient hard filter above already excludes on.
      const opacityCaution =
        restrictionSubstances.length > 0 && s.food.composition_is_opaque
          ? `Composition lists ${(s.food.composition_opaque_terms ?? []).join(', ')} without naming the source, so this food cannot be confirmed free of ${restrictionSubstances.join(', ')}. Check the pack or ask your vet.`
          : null;

      // DECISION 2 (owner, 2026-07-28): every recommendation carries a
      // data-state statement — informational, never a score input.
      const hasIngredients = (full?.ingredients ?? []).length > 0;
      const dataState = deriveDataState(hasIngredients, s.food.composition_is_opaque === true);
      const dataStateMsg = dataStateMessage(dataState, s.food.composition_opaque_terms);

      // DECISION 6 (owner, 2026-07-28): refused-domain provenance caution —
      // separate line, same informational treatment as opacity.
      const sourceDomainRefused = !!s.food.source_domain && refusedDomains.has(s.food.source_domain);
      const refusedDomainCaution = needsRefusedDomainCaution(hasIngredients, sourceDomainRefused)
        ? REFUSED_DOMAIN_LINE
        : null;

      return {
        food_id: s.food.id,
        brand: s.food.brand,
        name: s.food.name,
        food_type: s.food.food_type,
        opacity_caution: opacityCaution,
        data_state: dataState,
        data_state_message: dataStateMsg,
        refused_domain_caution: refusedDomainCaution,
        score: Math.round(s.overall_score * 1000) / 1000,
        confidence: s.confidence,
        reason: s.reason,
        nutritional_fit: Math.round(s.nutritional_fit.score * 1000) / 1000,
        research_relevance: Math.round(s.research_relevance * 1000) / 1000,
        research_summary: s.research_summary,
        research_evidence: activeResearch.evidenceByFoodId.get(s.food.id) ?? [],
        budget_fit: Math.round(s.budget_fit.score * 1000) / 1000,
        correlation_signal: Math.round(s.correlation_signal * 1000) / 1000,
        correlation_summary: s.correlation_summary,
        estimated_monthly_cost: s.budget_fit.estimatedMonthlyCost
          ? Math.round(s.budget_fit.estimatedMonthlyCost * 100) / 100
          : null,
        // Empty array = no ingredient list recorded for this food yet. The UI
        // must say so plainly; it is never filled in or inferred.
        ingredients: full?.ingredients ?? [],
        nutrients: full?.nutrients ?? null,
      };
    });

    const payload = {
      dog_id,
      recommendations,
      excluded_count: hardFilterResult.excluded_foods.length,
      excluded_reasons: hardFilterResult.excluded_reasons,
      current_diet_exposure: hardFilterResult.current_diet_exposure,
      total_candidates: candidateFoods?.length ?? 0,
      weights_used: weights,
      life_stage_used: der.lifeStage,
      weight_assumed: der.weightAssumed,
      research_runtime: {
        eligible_claim_count: activeResearch.eligibleClaimCount,
        unsupported_claim_count: activeResearch.unsupportedClaimIds.length,
        ranking_effect: 'none',
      },
      disclaimer: DISCLAIMER,
    };

    // 6. Persist so the owner sees this on return without regenerating. A
    // failure here must not lose the results the caller is waiting for — log
    // it and still return them.
    const generatedAt = new Date().toISOString();
    const { error: saveError } = await supabaseAdmin.from('dog_recommendation_sets').insert({
      dog_id,
      owner_id: userId,
      generated_at: generatedAt,
      payload,
    });
    if (saveError) {
      console.error('Failed to persist recommendation set (returning results anyway):', saveError);
    }

    return NextResponse.json({ ...payload, generated_at: generatedAt }, { status: 200 });
  } catch (error) {
    console.error('Get recommendations error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
