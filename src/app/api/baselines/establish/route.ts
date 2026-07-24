import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { OutcomeMetric } from '@/lib/types';

/**
 * establishBaseline (Part B)
 *
 * Input: dog_id, full visual chart selections (Bristol stool_score, BCS
 * body_condition_score) plus the other indicator readings, an optional
 * initial behaviour_tag list, and log_date (defaults to today).
 *
 * Writes the initial dog_log_entries rows (one per metric) and a
 * dog_baselines pointer row. Anchors to the dog's current_food_id.
 *
 * Only callable once per dog unless explicitly reset (force_reset: true) —
 * a reset is logged as a distinct new dog_baselines row, never a silent
 * overwrite of the previous one or its entries.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const body = await request.json();
    const {
      dog_id,
      log_date,
      stool_score, // 1-7
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
      stool_score === undefined ||
      body_condition_score === undefined ||
      !coat_condition ||
      !stool_odor ||
      !gas_frequency ||
      !gas_odor
    ) {
      return NextResponse.json(
        {
          error:
            'Full baseline requires stool_score, body_condition_score, coat_condition, stool_odor, gas_frequency and gas_odor',
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
        metric: 'stool_score',
        raw_value: String(stool_score),
        trend: null,
        within_expected_variability_window: false,
        food_id_active: dog.current_food_id ?? null,
        notes: null,
      },
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
      return NextResponse.json({ error: logEntriesError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: 'Baseline established',
        baseline_id: baseline.id,
        baseline,
        log_entries: logEntries,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Establish baseline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
