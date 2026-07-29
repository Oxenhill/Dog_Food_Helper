import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { computeVariabilityWindow } from '@/lib/lagWindow';
import { deriveTrend } from '@/lib/trendLogic';
import { OutcomeMetric } from '@/lib/types';

const VALID_METRICS: OutcomeMetric[] = [
  'coat_condition',
  'stool_odor',
  'gas_frequency',
  'gas_odor',
  'body_condition_score',
  'behaviour_tag',
];

/**
 * logRecalibration (Part B)
 *
 * The full visual-chart re-selection path — computes `trend` server-side by
 * comparing raw_value against the baseline reading for that metric, in
 * addition to storing the raw value itself.
 *
 * Input: dog_id, log_date, entries: [{ metric, raw_value, trend? }]
 * `trend` in the input is only honoured for `behaviour_tag`, where an
 * automatic derivation isn't principled (see lib/trendLogic.ts) — for every
 * other metric it's always server-derived and any client-supplied trend is
 * ignored.
 */
export async function POST(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const { dog_id, log_date, entries } = await request.json();

    if (!dog_id || !Array.isArray(entries) || entries.length === 0) {
      return NextResponse.json(
        { error: 'dog_id and a non-empty entries array are required' },
        { status: 400 }
      );
    }

    for (const e of entries) {
      if (!VALID_METRICS.includes(e.metric)) {
        return NextResponse.json({ error: `Invalid metric: ${e.metric}` }, { status: 400 });
      }
      if (e.raw_value === undefined || e.raw_value === null || e.raw_value === '') {
        return NextResponse.json(
          { error: `raw_value is required for recalibration of ${e.metric}` },
          { status: 400 }
        );
      }
    }

    const { data: dog, error: dogError } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', dog_id)
      .eq('owner_id', userId)
      .single();

    if (dogError || !dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const { data: baseline, error: baselineError } = await supabaseAdmin
      .from('dog_baselines')
      .select('established_at')
      .eq('dog_id', dog_id)
      .order('established_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (baselineError) {
      return NextResponse.json({ error: baselineError.message }, { status: 500 });
    }

    const baselineLogDate = baseline ? new Date(baseline.established_at).toISOString().split('T')[0] : null;

    const logDateStr = log_date
      ? new Date(log_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const rowsToInsert = await Promise.all(
      entries.map(
        async (e: { metric: OutcomeMetric; raw_value: string; trend?: string; notes?: string }) => {
          let baselineRawValue: string | null = null;

          if (baselineLogDate) {
            const { data: baselineEntry } = await supabaseAdmin
              .from('dog_log_entries')
              .select('raw_value')
              .eq('dog_id', dog_id)
              .eq('metric', e.metric)
              .eq('log_date', baselineLogDate)
              .order('created_at', { ascending: true })
              .limit(1)
              .maybeSingle();
            baselineRawValue = baselineEntry?.raw_value ?? null;
          }

          let trend = deriveTrend(e.metric, baselineRawValue, e.raw_value);
          // behaviour_tag can't be auto-derived — honour an owner-supplied trend if given
          if (trend === null && e.metric === 'behaviour_tag' && e.trend) {
            trend = e.trend as 'better' | 'worse' | 'no_change';
          }

          const { withinExpectedVariabilityWindow, foodIdActive } = await computeVariabilityWindow(
            dog_id,
            e.metric,
            logDateStr
          );

          return {
            dog_id,
            log_date: logDateStr,
            metric: e.metric,
            raw_value: e.raw_value,
            trend,
            within_expected_variability_window: withinExpectedVariabilityWindow,
            // The food event open ON THE LOG DATE only — see the same note in
            // /api/logs/quick. `dogs.current_food_id` describes now, not then.
            food_id_active: foodIdActive,
            notes: e.notes ?? null,
          };
        }
      )
    );

    const { data, error } = await supabaseAdmin
      .from('dog_log_entries')
      .insert(rowsToInsert)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from('user_profiles')
      .update({ last_active_at: new Date().toISOString(), inactivity_warning_sent_at: null })
      .eq('id', userId);

    return NextResponse.json(
      {
        message: 'Recalibration recorded',
        log_entries: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Recalibration error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
