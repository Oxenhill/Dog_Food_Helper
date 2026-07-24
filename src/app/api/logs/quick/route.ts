import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { computeVariabilityWindow } from '@/lib/lagWindow';
import { OutcomeMetric, TrendDirection } from '@/lib/types';

const VALID_METRICS: OutcomeMetric[] = [
  'stool_score',
  'coat_condition',
  'stool_odor',
  'gas_frequency',
  'gas_odor',
  'body_condition_score',
  'behaviour_tag',
];
const VALID_TRENDS: TrendDirection[] = ['better', 'worse', 'no_change'];

/**
 * logQuickEntry (Part B)
 *
 * The default, low-friction logging path — owner taps better/worse/no_change
 * per indicator. Input: dog_id, log_date, entries: [{ metric, trend }].
 * Server computes within_expected_variability_window per metric from
 * metric_minimum_lag_days against the active dog_food_events.started_at.
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
      if (!VALID_TRENDS.includes(e.trend)) {
        return NextResponse.json({ error: `Invalid trend: ${e.trend}` }, { status: 400 });
      }
    }

    const { data: dog, error: dogError } = await supabaseAdmin
      .from('dogs')
      .select('id, current_food_id')
      .eq('id', dog_id)
      .eq('owner_id', userId)
      .single();

    if (dogError || !dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const logDateStr = log_date
      ? new Date(log_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const rowsToInsert = await Promise.all(
      entries.map(async (e: { metric: OutcomeMetric; trend: TrendDirection; notes?: string }) => {
        const { withinExpectedVariabilityWindow, foodIdActive } = await computeVariabilityWindow(
          dog_id,
          e.metric,
          logDateStr
        );
        return {
          dog_id,
          log_date: logDateStr,
          metric: e.metric,
          raw_value: null,
          trend: e.trend,
          within_expected_variability_window: withinExpectedVariabilityWindow,
          food_id_active: foodIdActive ?? dog.current_food_id ?? null,
          notes: e.notes ?? null,
        };
      })
    );

    const { data, error } = await supabaseAdmin
      .from('dog_log_entries')
      .insert(rowsToInsert)
      .select();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Any logging activity resets the inactivity clock (architecture doc §10)
    await supabaseAdmin
      .from('user_profiles')
      .update({ last_active_at: new Date().toISOString(), inactivity_warning_sent_at: null })
      .eq('id', userId);

    return NextResponse.json(
      {
        message: 'Quick log entries recorded',
        log_entries: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Quick log error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
