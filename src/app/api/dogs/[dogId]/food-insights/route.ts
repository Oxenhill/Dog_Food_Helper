import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { DogFoodSwitchAnalysis, DogIngredientSuspect } from '@/lib/types';
import { isSuspectSetNarrowedEnough, SWITCH_ANALYSIS_THRESHOLDS } from '@/lib/switchAnalysis';

/**
 * GET /api/dogs/[dogId]/food-insights — what the food-change analysis has
 * learned about this dog.
 *
 * The gating here is the point of the endpoint, not decoration. Cheap foods
 * share the same generic staples, so after one failed switch the suspect
 * intersection may still be 15+ ingredients. Returning that list as a finding
 * would be actively misleading, so `narrowed_enough` decides whether the
 * ingredients are returned at all — the SIZE is always reported either way, so
 * the UI can honestly say "not narrowed enough yet, currently N ingredients".
 *
 * The framing is deliberate too. This edges toward diagnosing food
 * intolerance, which is a veterinary matter: a real elimination diet must be
 * vet-supervised. Nothing here asserts intolerance; the copy points at a vet
 * conversation.
 */
const VET_FRAMING =
  'These are ingredients worth discussing with your vet — not a diagnosis. Only a vet can confirm a food intolerance, and a proper elimination diet needs to be vet-supervised.';

export async function GET(request: NextRequest, { params }: { params: { dogId: string } }) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { data: dog, error: dogError } = await supabaseAdmin
      .from('dogs')
      .select('id, treat_logging_enabled')
      .eq('id', params.dogId)
      .eq('owner_id', user.id)
      .single();

    if (dogError || !dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const [{ data: suspectRows, error: suspectError }, { data: analysisRows, error: analysisError }] =
      await Promise.all([
        supabaseAdmin
          .from('dog_ingredient_suspects')
          .select('*')
          .eq('dog_id', params.dogId)
          .order('poor_food_count', { ascending: false }),
        supabaseAdmin
          .from('dog_food_switch_analyses')
          .select('*')
          .eq('dog_id', params.dogId)
          .order('switched_at', { ascending: false }),
      ]);

    if (suspectError) throw suspectError;
    if (analysisError) throw analysisError;

    const suspects = (suspectRows ?? []) as DogIngredientSuspect[];
    const analyses = (analysisRows ?? []) as DogFoodSwitchAnalysis[];

    const narrowedEnough = isSuspectSetNarrowedEnough(
      suspects.map((s) => ({ poorFoodCount: s.poor_food_count }))
    );

    // A switch analysis with no predecessor is a first food period, not a
    // change. Counting it as a "switch" would overstate how much evidence
    // there is.
    const switchCount = analyses.filter(
      (analysis) =>
        analysis.from_diet_period_id != null && analysis.analysis_status === 'analysable'
    ).length;
    const unanalysable = analyses.filter((analysis) => analysis.analysis_status === 'unanalysable');
    const failedSwitchCount = suspects.length > 0
      ? Math.max(...suspects.map((s) => s.poor_food_count))
      : 0;

    return NextResponse.json(
      {
        // Always reported, so the UI can be honest about progress without
        // showing a list that isn't ready.
        suspect_set_size: suspects.length,
        narrowed_enough: narrowedEnough,
        failed_switch_count: failedSwitchCount,
        switches_analysed: switchCount,
        unanalysable_periods: unanalysable.length,
        unanalysable_reasons: Array.from(
          new Set(unanalysable.map((analysis) => analysis.unanalysable_reason).filter(Boolean))
        ),
        min_failed_switches_needed: SWITCH_ANALYSIS_THRESHOLDS.minFailedSwitchesToSurface,

        // Withheld until the set is genuinely small and backed by more than
        // one failed switch.
        suspects: narrowedEnough
          ? suspects.map((s) => ({
              ingredient_name: s.ingredient_name,
              poor_food_count: s.poor_food_count,
              implicated_metrics: s.implicated_metrics,
              suspect_reason: s.suspect_reason,
            }))
          : [],

        switches: analyses.map((a) => ({
          switched_at: a.switched_at,
          from_diet_period_id: a.from_diet_period_id,
          to_diet_period_id: a.to_diet_period_id,
          is_switch: a.from_diet_period_id != null,
          analysis_status: a.analysis_status,
          unanalysable_reason: a.unanalysable_reason,
          ingredient_sets_known: a.ingredient_sets_known,
          added_count: a.added_ingredients.length,
          removed_count: a.removed_ingredients.length,
          retained_count: a.retained_ingredients.length,
          metric_outcomes: a.metric_outcomes,
        })),

        // With treat logging off, an unlogged treat is an unmeasured
        // confounder — stated, not silently assumed away.
        treat_logging_enabled: dog.treat_logging_enabled,
        treat_confounder_unmeasured: !dog.treat_logging_enabled,
        // True when any analysed switch had a food with no recorded ingredient
        // list, so the comparison could not be made for it.
        has_unknown_ingredient_data: analyses.some((a) => !a.ingredient_sets_known),

        vet_framing: VET_FRAMING,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Food insights error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
