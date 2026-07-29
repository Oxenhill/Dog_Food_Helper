import { computeVariabilityWindow } from './lagWindow';
import { supabaseAdmin } from './supabase';
import { deriveDailyStoolSummaries, DailyStoolSummary, StoolEventForAggregation } from './stoolEventAggregation';
import { deriveTrend } from './trendLogic';
import { DogLogEntry, DogStoolBaseline, DogStoolMonitoringWindow } from './types';

export interface DogStoolEvent extends StoolEventForAggregation {
  dog_id: string;
  time_of_day_captured: boolean;
  note?: string | null;
  legacy_log_entry_id?: string | null;
  legacy_trend?: 'better' | 'worse' | 'no_change' | null;
  monitoring_window_id?: string | null;
}
export async function loadStoolEventsForDog(
  dogId: string,
  monitoringWindowId?: string | null
): Promise<DogStoolEvent[]> {
  let query = supabaseAdmin
    .from('dog_stool_events')
    .select('*')
    .eq('dog_id', dogId)
    .order('occurred_on', { ascending: false })
    .order('occurred_at', { ascending: false, nullsFirst: false });

  if (monitoringWindowId) query = query.eq('monitoring_window_id', monitoringWindowId);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as DogStoolEvent[];
}

export async function loadDailyStoolSummariesForDog(
  dogId: string,
  monitoringWindowId?: string | null
): Promise<DailyStoolSummary[]> {
  return deriveDailyStoolSummaries(
    await loadStoolEventsForDog(dogId, monitoringWindowId)
  );
}

function frequencyTrend(
  count: number,
  baseline: DogStoolBaseline
): 'worse' | 'no_change' | null {
  const min = baseline.typical_count_min;
  const max = baseline.typical_count_max;
  if (min == null || max == null) return null;
  if (count >= min && count <= max) return 'no_change';
  // More frequent than the dog's own recorded range is directionally clear.
  // Below range may be improvement from a high-frequency baseline or
  // constipation; assigning a direction would be inference.
  return count > max ? 'worse' : null;
}

/**
 * Converts event-level observations to one analytical sample per day.
 *
 * Existing baseline/recalibration score rows remain reference points only.
 * They are not bowel movements and are never counted as events.
 */
export async function loadDailyStoolObservationLogs(
  dogId: string,
  monitoringWindowId?: string | null
): Promise<DogLogEntry[]> {
  const [summaries, baselineResult] = await Promise.all([
    loadDailyStoolSummariesForDog(dogId, monitoringWindowId),
    supabaseAdmin
      .from('dog_stool_baselines')
      .select('*')
      .eq('dog_id', dogId)
      .order('established_at', { ascending: true }),
  ]);

  if (baselineResult.error) throw baselineResult.error;
  const baselines = (baselineResult.data ?? []) as DogStoolBaseline[];

  const logs: DogLogEntry[] = [];
  for (const summary of summaries) {
    const baseline = [...baselines]
      .filter((entry) => entry.established_at.slice(0, 10) <= summary.date)
      .sort(
        (a, b) =>
          b.established_at.localeCompare(a.established_at) ||
          new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

    const [scoreWindow, frequencyWindow] = await Promise.all([
      computeVariabilityWindow(dogId, 'stool_score', summary.date),
      computeVariabilityWindow(dogId, 'stool_frequency', summary.date),
    ]);

    if (summary.worst_score !== null) {
      const baselineWorst =
        baseline && baseline.typical_scores.length > 0
          ? Math.max(...baseline.typical_scores)
          : null;
      logs.push({
        id: `stool-score-day:${dogId}:${summary.date}`,
        dog_id: dogId,
        log_date: summary.date,
        metric: 'stool_score',
        raw_value: String(summary.worst_score),
        trend:
          baselineWorst === null
            ? null
            : deriveTrend('stool_score', String(baselineWorst), String(summary.worst_score)),
        within_expected_variability_window: scoreWindow.withinExpectedVariabilityWindow,
        diet_period_id: scoreWindow.dietPeriodId,
        food_id_active: null,
        notes: null,
        created_at: `${summary.date}T23:59:59.999Z`,
      });
    }

    logs.push({
      id: `stool-frequency-day:${dogId}:${summary.date}`,
      dog_id: dogId,
      log_date: summary.date,
      metric: 'stool_frequency',
      raw_value: String(summary.count),
      trend: baseline ? frequencyTrend(summary.count, baseline) : null,
      within_expected_variability_window: frequencyWindow.withinExpectedVariabilityWindow,
      diet_period_id: frequencyWindow.dietPeriodId,
      food_id_active: null,
      notes: null,
      created_at: `${summary.date}T23:59:59.999Z`,
    });
  }

  return logs;
}

export async function getMonitoringWindowAt(
  dogId: string,
  occurredAt: string
): Promise<DogStoolMonitoringWindow | null> {
  const { data, error } = await supabaseAdmin
    .from('dog_stool_monitoring_windows')
    .select('*')
    .eq('dog_id', dogId)
    .lte('opened_at', occurredAt)
    .or(`closed_at.is.null,closed_at.gte.${occurredAt}`)
    .order('opened_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) throw error;
  return (data as DogStoolMonitoringWindow | null) ?? null;
}
