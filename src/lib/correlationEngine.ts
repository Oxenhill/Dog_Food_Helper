import { supabaseAdmin } from './supabase';
import { DogLogEntry, OutcomeMetric } from './types';

/**
 * Ingredient → outcome correlation engine (Phase 6, technical build spec
 * Part A `ingredient_outcome_signals`, architecture doc §6).
 *
 * Runs per-dog (not real-time — designed to be invoked by a daily cron
 * route). For each dog: walks every `dog_log_entries` row that has a
 * `food_id_active` and is NOT `within_expected_variability_window` (that
 * flag was already computed at log-time against `metric_minimum_lag_days` —
 * see src/lib/lagWindow.ts from Phase 2 — so "respect the variability
 * window" and "respect the metric's minimum lag" are the same filter here,
 * not two separate checks; the lag gate was already applied once, at
 * log-write time, per metric). For each ingredient present in the active
 * food's `food_ingredients`, for each outcome metric, computes a directional
 * signal from the logged `trend` values and writes/updates
 * `ingredient_outcome_signals`.
 *
 * **Correlation methodology (flagged, tunable — not a statistically
 * rigorous correlation coefficient):** `correlation_strength` is computed as
 * (count(better) - count(worse)) / total_eligible_logs, i.e. a directional
 * "net improvement rate" in the range [-1, 1]. A true correlation
 * coefficient would need a continuous outcome variable and ideally a
 * within-dog control period (logs on OTHER foods without this ingredient),
 * which the current log data doesn't cleanly support (trend is already
 * baseline-relative ordinal, not a raw continuous score). This is an
 * honest, documented heuristic, consistent with the confidence-honesty
 * principle applied elsewhere (architecture doc §9) — it is NOT presented
 * as more rigorous than it is.
 *
 * **Confidence thresholds are hardcoded here per the phase spec's explicit
 * permission** ("hardcode in correlation logic with a comment flagging it as
 * tunable if the code needs refactoring later" — no config table exists for
 * this in Part A):
 *   sample_size < 3        -> no signal written (not enough data to say anything)
 *   sample_size 3-5        -> 'low_sample'
 *   sample_size 6-15       -> 'preliminary'
 *   sample_size >= 16      -> 'established'
 */

export const CONFIDENCE_THRESHOLDS = {
  low_sample_min: 3,
  preliminary_min: 6,
  established_min: 16,
};

export function confidenceFlagForSampleSize(sampleSize: number): string | null {
  if (sampleSize < CONFIDENCE_THRESHOLDS.low_sample_min) return null;
  if (sampleSize < CONFIDENCE_THRESHOLDS.preliminary_min) return 'low_sample';
  if (sampleSize < CONFIDENCE_THRESHOLDS.established_min) return 'preliminary';
  return 'established';
}

interface FoodIngredientsRow {
  food_id: string;
  ingredient_name: string;
}

/**
 * Computes and upserts ingredient_outcome_signals rows for a single dog.
 * Returns per-signal sample sizes so the caller (the cron route) can log
 * "still collecting data" context, per the phase spec's item 2 requirement.
 */
export async function computeCorrelationsForDog(dogId: string): Promise<{
  dog_id: string;
  signals_written: number;
  signals_skipped_insufficient_data: number;
  sample_sizes: Array<{ ingredient_name: string; outcome_metric: OutcomeMetric; sample_size: number; confidence_flag: string | null }>;
}> {
  const { data: logsData, error: logsError } = await supabaseAdmin
    .from('dog_log_entries')
    .select('*')
    .eq('dog_id', dogId)
    .eq('within_expected_variability_window', false)
    .not('food_id_active', 'is', null);

  if (logsError) throw logsError;
  const logs = (logsData ?? []) as DogLogEntry[];

  const sampleSizes: Array<{ ingredient_name: string; outcome_metric: OutcomeMetric; sample_size: number; confidence_flag: string | null }> = [];

  if (logs.length === 0) {
    return { dog_id: dogId, signals_written: 0, signals_skipped_insufficient_data: 0, sample_sizes: [] };
  }

  const activeFoodIds = Array.from(new Set(logs.map((l) => l.food_id_active).filter(Boolean))) as string[];

  const { data: ingredientRows, error: ingredientsError } = await supabaseAdmin
    .from('food_ingredients')
    .select('food_id, ingredient_name')
    .in('food_id', activeFoodIds);

  if (ingredientsError) throw ingredientsError;
  const ingredients = (ingredientRows ?? []) as FoodIngredientsRow[];

  const ingredientsByFood = new Map<string, string[]>();
  for (const row of ingredients) {
    const list = ingredientsByFood.get(row.food_id) ?? [];
    list.push(row.ingredient_name);
    ingredientsByFood.set(row.food_id, list);
  }

  // metric_minimum_lag_days lookup — stored on each signal row as the lag
  // basis actually applied (useful for the UI to show "we required at least
  // N days post-switch"), even though the filtering itself already happened
  // upstream at log-write time.
  const { data: lagRows, error: lagError } = await supabaseAdmin
    .from('metric_minimum_lag_days')
    .select('outcome_metric, minimum_lag_days');
  if (lagError) throw lagError;
  const lagByMetric = new Map<OutcomeMetric, number>(
    (lagRows ?? []).map((r) => [r.outcome_metric as OutcomeMetric, r.minimum_lag_days as number])
  );

  // Group eligible logs by (ingredient_name, outcome_metric)
  const groups = new Map<string, DogLogEntry[]>();
  for (const log of logs) {
    if (!log.food_id_active) continue;
    const ingredientNames = ingredientsByFood.get(log.food_id_active) ?? [];
    for (const ingredientName of ingredientNames) {
      const key = `${ingredientName}::${log.metric}`;
      const arr = groups.get(key) ?? [];
      arr.push(log);
      groups.set(key, arr);
    }
  }

  let written = 0;
  let skipped = 0;

  for (const [key, groupLogs] of groups.entries()) {
    const [ingredientName, metric] = key.split('::') as [string, OutcomeMetric];
    const sampleSize = groupLogs.length;
    const confidenceFlag = confidenceFlagForSampleSize(sampleSize);

    if (!confidenceFlag) {
      skipped += 1;
      sampleSizes.push({ ingredient_name: ingredientName, outcome_metric: metric, sample_size: sampleSize, confidence_flag: null });
      continue;
    }

    const better = groupLogs.filter((l) => l.trend === 'better').length;
    const worse = groupLogs.filter((l) => l.trend === 'worse').length;
    const correlationStrength = (better - worse) / sampleSize;
    const lagDays = lagByMetric.get(metric) ?? 0;

    const { data: existing, error: existingError } = await supabaseAdmin
      .from('ingredient_outcome_signals')
      .select('id')
      .eq('dog_id', dogId)
      .eq('ingredient_name', ingredientName)
      .eq('outcome_metric', metric)
      .maybeSingle();
    if (existingError) throw existingError;

    if (existing) {
      const { error: updateError } = await supabaseAdmin
        .from('ingredient_outcome_signals')
        .update({
          lag_days: lagDays,
          correlation_strength: correlationStrength,
          sample_size: sampleSize,
          confidence_flag: confidenceFlag,
          computed_at: new Date().toISOString(),
        })
        .eq('id', existing.id);
      if (updateError) throw updateError;
    } else {
      const { error: insertError } = await supabaseAdmin.from('ingredient_outcome_signals').insert({
        dog_id: dogId,
        ingredient_name: ingredientName,
        outcome_metric: metric,
        lag_days: lagDays,
        correlation_strength: correlationStrength,
        sample_size: sampleSize,
        confidence_flag: confidenceFlag,
        computed_at: new Date().toISOString(),
      });
      if (insertError) throw insertError;
    }

    written += 1;
    sampleSizes.push({ ingredient_name: ingredientName, outcome_metric: metric, sample_size: sampleSize, confidence_flag: confidenceFlag });
  }

  return { dog_id: dogId, signals_written: written, signals_skipped_insufficient_data: skipped, sample_sizes: sampleSizes };
}

/**
 * Runs the correlation engine across every dog that has at least one
 * eligible log entry. Intended to be invoked by a daily cron route.
 * Processes dogs sequentially (not Promise.all) — same latency/rate-limit
 * bounding rationale as Phase 4's batched research scoring; this is DB-only
 * work (no LLM calls) so sequential is mainly to keep Supabase connection
 * pressure bounded on a serverless function, not an LLM concern here.
 */
export async function runCorrelationEngine(): Promise<{
  dogs_processed: number;
  total_signals_written: number;
  per_dog: Array<Awaited<ReturnType<typeof computeCorrelationsForDog>>>;
}> {
  const { data: dogRows, error } = await supabaseAdmin
    .from('dog_log_entries')
    .select('dog_id')
    .eq('within_expected_variability_window', false)
    .not('food_id_active', 'is', null);

  if (error) throw error;
  const dogIds = Array.from(new Set((dogRows ?? []).map((r) => r.dog_id as string)));

  const perDog: Array<Awaited<ReturnType<typeof computeCorrelationsForDog>>> = [];
  let totalWritten = 0;

  for (const dogId of dogIds) {
    try {
      const result = await computeCorrelationsForDog(dogId);
      perDog.push(result);
      totalWritten += result.signals_written;
      console.log(
        `[correlation-engine] dog ${dogId}: ${result.signals_written} signals written, ${result.signals_skipped_insufficient_data} skipped (insufficient sample), sizes=${JSON.stringify(
          result.sample_sizes
        )}`
      );
    } catch (err) {
      console.error(`[correlation-engine] failed for dog ${dogId}`, err);
    }
  }

  return { dogs_processed: dogIds.length, total_signals_written: totalWritten, per_dog: perDog };
}
