import { supabaseAdmin } from './supabase';
import { DogFoodEvent, OutcomeMetric } from './types';

/**
 * Lag-window logic (Phase 2)
 *
 * Finds the dog_food_events row that was active on a given log_date, and
 * uses metric_minimum_lag_days to decide whether a reading for a given
 * metric falls inside that metric's expected settling window post-switch.
 *
 * Per architecture doc §4: this is metric-specific, not one flat number —
 * digestive metrics (stool_score/stool_odor/gas_frequency/gas_odor) settle
 * ~10 days, weight/behaviour ~21 days, coat/BCS ~56 days. Values live in
 * metric_minimum_lag_days rather than being hardcoded here.
 */

export async function getActiveFoodEvent(
  dogId: string,
  logDate: string
): Promise<DogFoodEvent | null> {
  const { data, error } = await supabaseAdmin
    .from('dog_food_events')
    .select('*')
    .eq('dog_id', dogId)
    .eq('event_type', 'main_food')
    .lte('started_at', logDate)
    .or(`ended_at.is.null,ended_at.gte.${logDate}`)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return data as DogFoodEvent | null;
}

export async function getMinimumLagDays(metric: OutcomeMetric): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('metric_minimum_lag_days')
    .select('minimum_lag_days')
    .eq('outcome_metric', metric)
    .maybeSingle();

  if (error) throw error;
  // Fall back to 0 (i.e. "never in-window") only if the reference row is somehow
  // missing — this should always be seeded, see supabase/seed_phase2.sql
  return data?.minimum_lag_days ?? 0;
}

export interface VariabilityWindowResult {
  withinExpectedVariabilityWindow: boolean;
  foodIdActive: string | null;
  activeFoodEvent: DogFoodEvent | null;
}

/**
 * Computes within_expected_variability_window + food_id_active for a single
 * (dog_id, metric, log_date) reading, per §4 / metric_minimum_lag_days.
 *
 * If there's no active main_food event on record for that date, the reading
 * can't be "in a settling window" from a switch we don't know about, so this
 * returns false (not in-window) with a null active food.
 */
export async function computeVariabilityWindow(
  dogId: string,
  metric: OutcomeMetric,
  logDate: string
): Promise<VariabilityWindowResult> {
  const activeFoodEvent = await getActiveFoodEvent(dogId, logDate);

  if (!activeFoodEvent) {
    return {
      withinExpectedVariabilityWindow: false,
      foodIdActive: null,
      activeFoodEvent: null,
    };
  }

  const lagDays = await getMinimumLagDays(metric);
  const startedAt = new Date(activeFoodEvent.started_at);
  const log = new Date(logDate);
  const daysSince = Math.floor(
    (log.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    withinExpectedVariabilityWindow: daysSince < lagDays,
    foodIdActive: activeFoodEvent.food_or_treat_id ?? null,
    activeFoodEvent,
  };
}
