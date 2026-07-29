import { getDietPeriodAt } from './dietPeriods';
import { supabaseAdmin } from './supabase';
import { DogDietPeriod, OutcomeMetric } from './types';

/**
 * Lag-window logic for a whole diet set.
 *
 * Attribution uses the diet period active on log_date. Metric lag remains
 * reference-data driven. A legacy period with no captured start can identify
 * exposure, but cannot create an invented settling interval.
 */
export async function getActiveDietPeriod(
  dogId: string,
  logDate: string
): Promise<DogDietPeriod | null> {
  return getDietPeriodAt(dogId, logDate);
}

export async function getMinimumLagDays(metric: OutcomeMetric): Promise<number> {
  const { data, error } = await supabaseAdmin
    .from('metric_minimum_lag_days')
    .select('minimum_lag_days')
    .eq('outcome_metric', metric)
    .maybeSingle();

  if (error) throw error;
  return data?.minimum_lag_days ?? 0;
}

export interface VariabilityWindowResult {
  withinExpectedVariabilityWindow: boolean;
  dietPeriodId: string | null;
  activeDietPeriod: DogDietPeriod | null;
}

export async function computeVariabilityWindow(
  dogId: string,
  metric: OutcomeMetric,
  logDate: string
): Promise<VariabilityWindowResult> {
  const activeDietPeriod = await getActiveDietPeriod(dogId, logDate);

  if (!activeDietPeriod) {
    return {
      withinExpectedVariabilityWindow: false,
      dietPeriodId: null,
      activeDietPeriod: null,
    };
  }

  if (!activeDietPeriod.started_at) {
    return {
      withinExpectedVariabilityWindow: false,
      dietPeriodId: activeDietPeriod.id,
      activeDietPeriod,
    };
  }

  const lagDays = await getMinimumLagDays(metric);
  const startedAt = new Date(activeDietPeriod.started_at);
  const log = new Date(logDate);
  const daysSince = Math.floor(
    (log.getTime() - startedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  return {
    withinExpectedVariabilityWindow: daysSince < lagDays,
    dietPeriodId: activeDietPeriod.id,
    activeDietPeriod,
  };
}
