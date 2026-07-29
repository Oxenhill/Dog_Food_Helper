import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { OutcomeMetric } from '@/lib/types';

/**
 * establishBaseline (Part B)
 *
 * Input: dog_id, representative Bristol stool score set, the dog's usual
 * stools-per-day range, BCS body_condition_score, the other indicator
 * readings, and an optional initial behaviour_tag list.
 *
 * Stool baseline is stored separately because it is a representative pattern,
 * not a bowel movement. It must never be counted as a stool event.
 *
 * Only callable once per dog unless explicitly reset (force_reset: true) —
 * a reset is logged as a distinct new dog_baselines row, never a silent
 * overwrite of the previous one or its entries.
 */
export async function POST(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const body = await request.json();
    const {
      dog_id,
      log_date,
      stool_scores, // distinct representative values, each 1-7
      stools_per_day_min,
      stools_per_day_max,
      body_condition_score, // 1-9
      coat_condition, // good|questionable|poor
      stool_odor, // good|questionable|poor
      gas_frequency, // good|questionable|poor
      gas_odor, // good|questionable|poor
      behaviour_tags, // string[] or comma-joined string, optional
      force_reset = false,
    } = body;

    if (!dog_id) {
      return NextResponse.json({ error: 'dog_id is required' }, { status: 400 });
    }
    if (
      !Array.isArray(stool_scores) ||
      stool_scores.length === 0 ||
      !stool_scores.every(
        (score: unknown) => Number.isInteger(score) && Number(score) >= 1 && Number(score) <= 7
      ) ||
      !Number.isInteger(stools_per_day_min) ||
      !Number.isInteger(stools_per_day_max) ||
      stools_per_day_min < 0 ||
      stools_per_day_max < stools_per_day_min ||
      stools_per_day_max > 30 ||
      body_condition_score === undefined ||
      !coat_condition ||
      !stool_odor ||
      !gas_frequency ||
      !gas_odor
    ) {
      return NextResponse.json(
        {
          error:
            'Full baseline requires stool_scores, a valid stools-per-day range, body_condition_score, coat_condition, stool_odor, gas_frequency and gas_odor',
        },
        { status: 400 }
      );
    }

    // Verify dog belongs to user, and grab current_food_id as the baseline anchor
    const { data: dog, error: dogError } = await supabaseAdmin
      .from('dogs')
      .select('id, current_food_id, current_food_freetext')
      .eq('id', dog_id)
      .eq('owner_id', userId)
      .single();

    if (dogError || !dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    // A baseline should only be established once unless explicitly reset
    const { data: existingBaselines, error: existingError } = await supabaseAdmin
      .from('dog_baselines')
      .select('id')
      .eq('dog_id', dog_id);

    if (existingError) {
      return NextResponse.json({ error: existingError.message }, { status: 500 });
    }
    if (existingBaselines && existingBaselines.length > 0 && !force_reset) {
      return NextResponse.json(
        {
          error:
            'A baseline already exists for this dog. Pass force_reset: true to log a new baseline (this does not delete the old one or its history).',
        },
        { status: 409 }
      );
    }

    if (!dog.current_food_id && !dog.current_food_freetext) {
      // Not a hard failure — the dog may genuinely not have a food on record yet
      // — but the baseline's food anchor will be null. Logged, not silently guessed.
      console.warn(
        `establishBaseline: dog ${dog_id} has no current_food_id/freetext to anchor baseline to`
      );
    }

    const establishedAt = log_date ? new Date(log_date).toISOString() : new Date().toISOString();
    const logDateStr = establishedAt.split('T')[0];

    const { data: baseline, error: baselineError } = await supabaseAdmin
      .from('dog_baselines')
      .insert({
        dog_id,
        established_at: establishedAt,
        food_at_baseline_id: dog.current_food_id ?? null,
      })
      .select()
      .single();

    if (baselineError) {
      return NextResponse.json({ error: baselineError.message }, { status: 500 });
    }

    const { data: stoolBaseline, error: stoolBaselineError } = await supabaseAdmin
      .from('dog_stool_baselines')
      .insert({
        dog_id,
        dog_baseline_id: baseline.id,
        established_at: establishedAt,
        typical_scores: Array.from(new Set(stool_scores)).sort((a, b) => a - b),
        typical_count_min: stools_per_day_min,
        typical_count_max: stools_per_day_max,
      })
      .select()
      .single();

    if (stoolBaselineError || !stoolBaseline) {
      await supabaseAdmin.from('dog_baselines').delete().eq('id', baseline.id);
      return NextResponse.json(
        { error: stoolBaselineError?.message ?? 'Failed to save stool baseline' },
        { status: 500 }
      );
    }

    const behaviourTagValue = Array.isArray(behaviour_tags)
      ? behaviour_tags.join(',')
      : behaviour_tags ?? null;

    const entries: {
      dog_id: string;
      log_date: string;
      metric: OutcomeMetric;
      raw_value: string | null;
      trend: null;
      within_expected_variability_window: boolean;
      food_id_active: string | null;
      notes: null;
    }[] = [
      {
        dog_id,
        log_date: logDateStr,
        metric: 'body_condition_score',
        raw_value: String(body_condition_score),
        trend: null,
        within_expected_variability_window: false,
        food_id_active: dog.current_food_id ?? null,
        notes: null,
      },
      {
        dog_id,
        log_date: logDateStr,
        metric: 'coat_condition',
        raw_value: coat_condition,
        trend: null,
        within_expected_variability_window: false,
        food_id_active: dog.current_food_id ?? null,
        notes: null,
      },
      {
        dog_id,
        log_date: logDateStr,
        metric: 'stool_odor',
        raw_value: stool_odor,
        trend: null,
        within_expected_variability_window: false,
        food_id_active: dog.current_food_id ?? null,
        notes: null,
      },
      {
        dog_id,
        log_date: logDateStr,
        metric: 'gas_frequency',
        raw_value: gas_frequency,
        trend: null,
        within_expected_variability_window: false,
        food_id_active: dog.current_food_id ?? null,
        notes: null,
      },
      {
        dog_id,
        log_date: logDateStr,
        metric: 'gas_odor',
        raw_value: gas_odor,
        trend: null,
        within_expected_variability_window: false,
        food_id_active: dog.current_food_id ?? null,
        notes: null,
      },
    ];

    if (behaviourTagValue) {
      entries.push({
        dog_id,
        log_date: logDateStr,
        metric: 'behaviour_tag',
        raw_value: behaviourTagValue,
        trend: null,
        within_expected_variability_window: false,
        food_id_active: dog.current_food_id ?? null,
        notes: null,
      });
    }

    const { data: logEntries, error: logEntriesError } = await supabaseAdmin
      .from('dog_log_entries')
      .insert(entries)
      .select();

    if (logEntriesError) {
      await supabaseAdmin.from('dog_baselines').delete().eq('id', baseline.id);
      return NextResponse.json({ error: logEntriesError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: 'Baseline established',
        baseline_id: baseline.id,
        baseline,
        stool_baseline: stoolBaseline,
        log_entries: logEntries,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Establish baseline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
