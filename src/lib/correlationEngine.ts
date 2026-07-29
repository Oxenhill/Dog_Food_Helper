import { supabaseAdmin } from './supabase';
import { DogLogEntry, EvidenceBasis, OutcomeMetric } from './types';
import { loadDailyStoolObservationLogs } from './stoolEvents';
import {
  analyseSwitchesForDog,
  deriveSuspectSet,
  SuspectSetResult,
  SwitchAnalysis,
  UNCHANGED_SIGNAL_STRENGTH,
} from './switchAnalysis';

/**
 * Ingredient → outcome correlation engine.
 *
 * Runs per-dog on a daily cron. It now produces TWO grades of evidence, kept
 * distinguishable by `ingredient_outcome_signals.evidence_basis`:
 *
 * **'food_switch' (strong, the primary method).** A food change is a natural
 * experiment. The ingredient sets either side of it differ, so a change in
 * outcome can be attributed to the difference — and, crucially, which set is
 * implicated depends on whether the outcome actually MOVED. When nothing moved
 * and the dog was already unwell, the ingredients that CHANGED are exonerated
 * and the ones that were RETAINED become the prime suspects. See
 * src/lib/switchAnalysis.ts for the full model and the multi-switch narrowing
 * rule.
 *
 * **'single_food_period' (weak, retained).** The original method: for each log
 * with an active food, credit every ingredient in that food with the logged
 * trend. A 30-item list yields 30 identically-weighted signals, so this says
 * very little on its own. It is kept rather than deleted because it is the
 * only thing available to a dog that has never switched food, and because a
 * long stable period genuinely is weak evidence that the food is tolerated.
 * Consumers should prefer 'food_switch' rows where they exist —
 * correlationScoring.ts does.
 *
 * **Correlation methodology (flagged, tunable — NOT a statistically rigorous
 * correlation coefficient).** `correlation_strength` is a directional score in
 * [-1, 1]: for single-food periods, the net improvement rate
 * (better - worse) / eligible logs; for switch evidence, the mean signed
 * strength across switch observations. A true coefficient would need a
 * continuous outcome variable and a within-dog control period, which
 * baseline-relative ordinal trends do not support. This is an honest,
 * documented heuristic, consistent with the confidence-honesty principle
 * (architecture doc §9) — it is not presented as more than it is.
 *
 * **Confidence thresholds are hardcoded per the phase spec's explicit
 * permission** ("hardcode in correlation logic with a comment flagging it as
 * tunable" — no config table exists for this in Part A):
 *   sample_size < 3   -> no signal written
 *   sample_size 3-5   -> 'low_sample'
 *   sample_size 6-15  -> 'preliminary'
 *   sample_size >= 16 -> 'established'
 *
 * Note these apply to switch OBSERVATIONS for switch-derived rows, so a dog
 * needs several switches before one is written. That is deliberate: a single
 * switch is one observation however clean it looks, and "poor -> still poor"
 * once tells you very little.
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

interface SignalAccumulator {
  ingredientName: string;
  metric: OutcomeMetric;
  strengths: number[];
  lagDays: number;
}

export interface CorrelationRunResult {
  dog_id: string;
  signals_written: number;
  signals_skipped_insufficient_data: number;
  switches_analysed: number;
  suspect_set_size: number;
  failed_switch_count: number;
  narrowed_enough: boolean;
  sample_sizes: Array<{
    ingredient_name: string;
    outcome_metric: OutcomeMetric;
    sample_size: number;
    confidence_flag: string | null;
    evidence_basis: EvidenceBasis;
  }>;
}

// ---------------------------------------------------------------------------
// Persistence
// ---------------------------------------------------------------------------

async function persistSwitchAnalyses(dogId: string, analyses: SwitchAnalysis[]): Promise<void> {
  if (analyses.length === 0) return;

  const rows = analyses.map((a) => ({
    dog_id: dogId,
    from_event_id: a.fromEvent?.id ?? null,
    to_event_id: a.toEvent.id,
    from_food_id: a.fromFoodId,
    to_food_id: a.toFoodId,
    switched_at: a.switchedAt,
    added_ingredients: a.added,
    removed_ingredients: a.removed,
    retained_ingredients: a.retained,
    ingredient_sets_known: a.ingredientSetsKnown,
    metric_outcomes: a.metricOutcomes,
    treat_logging_enabled: a.treatLoggingEnabled,
    confounding_treat_ingredients: a.confoundingTreatIngredients,
    computed_at: new Date().toISOString(),
  }));

  // Keyed on to_event_id, so a re-run replaces rather than accumulates.
  const { error } = await supabaseAdmin
    .from('dog_food_switch_analyses')
    .upsert(rows, { onConflict: 'to_event_id' });
  if (error) throw error;
}

async function persistSuspects(dogId: string, result: SuspectSetResult): Promise<void> {
  const now = new Date().toISOString();

  if (result.suspects.length > 0) {
    const { error: upsertError } = await supabaseAdmin.from('dog_ingredient_suspects').upsert(
      result.suspects.map((s) => ({
        dog_id: dogId,
        ingredient_name: s.ingredientName,
        poor_food_count: s.poorFoodCount,
        implicated_metrics: s.implicatedMetrics,
        suspect_reason: s.reason,
        computed_at: now,
      })),
      { onConflict: 'dog_id,ingredient_name' }
    );
    if (upsertError) throw upsertError;
  }

  // An ingredient that has since been exonerated (it appeared in a food the
  // dog did well on) must DISAPPEAR, not linger from a previous run. Deleting
  // by "not written this run" keeps the table a true reflection of current
  // evidence rather than an append-only accumulation of old suspicions.
  const keep = result.suspects.map((s) => s.ingredientName);
  let deleteQuery = supabaseAdmin.from('dog_ingredient_suspects').delete().eq('dog_id', dogId);
  if (keep.length > 0) {
    // PostgREST `not.in` needs the list quoted; ingredient names can contain
    // commas ("meat and animal derivatives (beef, 4%)").
    const quoted = keep.map((n) => `"${n.replace(/"/g, '""')}"`).join(',');
    deleteQuery = deleteQuery.not('ingredient_name', 'in', `(${quoted})`);
  }
  const { error: deleteError } = await deleteQuery;
  if (deleteError) throw deleteError;
}

// ---------------------------------------------------------------------------
// Signal derivation
// ---------------------------------------------------------------------------

/**
 * Switch-derived signals.
 *
 * Sign convention matches the rest of the scoring layer: positive means
 * "outcomes were better with this ingredient present".
 */
function accumulateSwitchSignals(
  analyses: SwitchAnalysis[],
  lagByMetric: Map<string, number>
): Map<string, SignalAccumulator> {
  const acc = new Map<string, SignalAccumulator>();

  const add = (ingredientName: string, metric: OutcomeMetric, strength: number) => {
    const key = `${ingredientName}::${metric}`;
    const existing = acc.get(key) ?? {
      ingredientName,
      metric,
      strengths: [],
      lagDays: lagByMetric.get(metric) ?? 0,
    };
    existing.strengths.push(strength);
    acc.set(key, existing);
  };

  for (const analysis of analyses) {
    if (!analysis.ingredientSetsKnown) continue;

    for (const [metricKey, outcome] of Object.entries(analysis.metricOutcomes)) {
      const metric = metricKey as OutcomeMetric;
      if (outcome.outcome === 'insufficient_data') continue;

      const magnitude = Math.abs(outcome.net);

      if (outcome.outcome === 'improved') {
        // Things newly present coincided with improvement; things dropped were
        // present while the dog was worse.
        for (const name of analysis.added) add(name, metric, +magnitude);
        for (const name of analysis.removed) add(name, metric, -magnitude);
        continue;
      }

      if (outcome.outcome === 'worsened') {
        for (const name of analysis.added) add(name, metric, -magnitude);
        for (const name of analysis.removed) add(name, metric, +magnitude);
        continue;
      }

      // Unchanged. The differing set is exonerated — it changed and nothing
      // happened — so it gets NO signal either way. Only the retained set
      // carries meaning, and which meaning depends entirely on whether the dog
      // was unwell at the time.
      if (outcome.before_state === 'concerning') {
        for (const name of analysis.retained) {
          add(name, metric, UNCHANGED_SIGNAL_STRENGTH.retainedWhileConcerning);
        }
      } else if (outcome.before_state === 'acceptable') {
        for (const name of analysis.retained) {
          add(name, metric, UNCHANGED_SIGNAL_STRENGTH.retainedWhileAcceptable);
        }
      }
      // 'unknown' before_state: undecidable, so nothing is attributed.
    }
  }

  return acc;
}

/** The original, weak method: every ingredient in the active food, equally credited. */
async function accumulateSingleFoodPeriodSignals(
  dogId: string,
  lagByMetric: Map<string, number>
): Promise<Map<string, SignalAccumulator>> {
  const acc = new Map<string, SignalAccumulator>();

  const [{ data: logsData, error: logsError }, stoolLogs] = await Promise.all([
    supabaseAdmin
      .from('dog_log_entries')
      .select('*')
      .eq('dog_id', dogId)
      .eq('within_expected_variability_window', false)
      .not('food_id_active', 'is', null),
    loadDailyStoolObservationLogs(dogId),
  ]);

  if (logsError) throw logsError;
  const logs = [
    ...((logsData ?? []) as DogLogEntry[]).filter(
      (log) => log.metric !== 'stool_score' && log.metric !== 'stool_frequency'
    ),
    ...stoolLogs.filter(
      (log) => !log.within_expected_variability_window && log.food_id_active != null
    ),
  ];
  if (logs.length === 0) return acc;

  const activeFoodIds = Array.from(
    new Set(logs.map((l) => l.food_id_active).filter(Boolean))
  ) as string[];

  const { data: ingredientRows, error: ingredientsError } = await supabaseAdmin
    .from('food_ingredients')
    .select('food_id, ingredient_name')
    .in('food_id', activeFoodIds);

  if (ingredientsError) throw ingredientsError;

  const ingredientsByFood = new Map<string, string[]>();
  for (const row of (ingredientRows ?? []) as FoodIngredientsRow[]) {
    const name = row.ingredient_name?.trim().toLowerCase();
    if (!name) continue;
    const list = ingredientsByFood.get(row.food_id) ?? [];
    list.push(name);
    ingredientsByFood.set(row.food_id, list);
  }

  // Group logs by (ingredient, metric), then reduce to a net improvement rate.
  const groups = new Map<string, { ingredientName: string; metric: OutcomeMetric; logs: DogLogEntry[] }>();
  for (const log of logs) {
    if (!log.food_id_active || log.trend == null) continue;
    for (const ingredientName of ingredientsByFood.get(log.food_id_active) ?? []) {
      const key = `${ingredientName}::${log.metric}`;
      const group = groups.get(key) ?? {
        ingredientName,
        metric: log.metric,
        logs: [] as DogLogEntry[],
      };
      group.logs.push(log);
      groups.set(key, group);
    }
  }

  for (const [key, group] of groups.entries()) {
    const better = group.logs.filter((l) => l.trend === 'better').length;
    const worse = group.logs.filter((l) => l.trend === 'worse').length;
    // One entry per LOG, so sample_size below reflects the log count, matching
    // this basis's original semantics.
    acc.set(key, {
      ingredientName: group.ingredientName,
      metric: group.metric,
      strengths: group.logs.map(() => (better - worse) / group.logs.length),
      lagDays: lagByMetric.get(group.metric) ?? 0,
    });
  }

  return acc;
}

async function writeSignals(
  dogId: string,
  acc: Map<string, SignalAccumulator>,
  evidenceBasis: EvidenceBasis
): Promise<{ written: number; skipped: number; sampleSizes: CorrelationRunResult['sample_sizes'] }> {
  const sampleSizes: CorrelationRunResult['sample_sizes'] = [];
  const rows: Record<string, unknown>[] = [];
  let skipped = 0;

  for (const entry of acc.values()) {
    const sampleSize = entry.strengths.length;
    const confidenceFlag = confidenceFlagForSampleSize(sampleSize);

    sampleSizes.push({
      ingredient_name: entry.ingredientName,
      outcome_metric: entry.metric,
      sample_size: sampleSize,
      confidence_flag: confidenceFlag,
      evidence_basis: evidenceBasis,
    });

    if (!confidenceFlag) {
      skipped += 1;
      continue;
    }

    const mean = entry.strengths.reduce((sum, s) => sum + s, 0) / sampleSize;
    rows.push({
      dog_id: dogId,
      ingredient_name: entry.ingredientName,
      outcome_metric: entry.metric,
      lag_days: entry.lagDays,
      // Clamped: the mean of values already in [-1, 1] cannot leave it, but
      // the column is the contract the scorer rescales from, so guard it.
      correlation_strength: Math.max(-1, Math.min(1, Number(mean.toFixed(4)))),
      sample_size: sampleSize,
      confidence_flag: confidenceFlag,
      evidence_basis: evidenceBasis,
      computed_at: new Date().toISOString(),
    });
  }

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from('ingredient_outcome_signals')
      .upsert(rows, { onConflict: 'dog_id,ingredient_name,outcome_metric,evidence_basis' });
    if (error) throw error;
  }

  return { written: rows.length, skipped, sampleSizes };
}

// ---------------------------------------------------------------------------
// Entry points
// ---------------------------------------------------------------------------

export async function computeCorrelationsForDog(dogId: string): Promise<CorrelationRunResult> {
  const { data: dog, error: dogError } = await supabaseAdmin
    .from('dogs')
    .select('id, treat_logging_enabled')
    .eq('id', dogId)
    .maybeSingle();
  if (dogError) throw dogError;

  const { data: lagRows, error: lagError } = await supabaseAdmin
    .from('metric_minimum_lag_days')
    .select('outcome_metric, minimum_lag_days');
  if (lagError) throw lagError;
  const lagByMetric = new Map<string, number>(
    (lagRows ?? []).map((r) => [r.outcome_metric as string, r.minimum_lag_days as number])
  );

  const analyses = await analyseSwitchesForDog(dogId, dog?.treat_logging_enabled ?? false);
  await persistSwitchAnalyses(dogId, analyses);

  const suspectResult = deriveSuspectSet(analyses);
  await persistSuspects(dogId, suspectResult);

  const switchAcc = accumulateSwitchSignals(analyses, lagByMetric);
  const periodAcc = await accumulateSingleFoodPeriodSignals(dogId, lagByMetric);

  const switchWrite = await writeSignals(dogId, switchAcc, 'food_switch');
  const periodWrite = await writeSignals(dogId, periodAcc, 'single_food_period');

  return {
    dog_id: dogId,
    signals_written: switchWrite.written + periodWrite.written,
    signals_skipped_insufficient_data: switchWrite.skipped + periodWrite.skipped,
    switches_analysed: analyses.length,
    suspect_set_size: suspectResult.suspects.length,
    failed_switch_count: suspectResult.failedSwitchCount,
    narrowed_enough: suspectResult.narrowedEnough,
    sample_sizes: [...switchWrite.sampleSizes, ...periodWrite.sampleSizes],
  };
}

/**
 * Runs across every dog with a recorded food event or an attributable log.
 *
 * Processes dogs sequentially rather than with Promise.all — this is DB-only
 * work (no model calls), so the reason is bounding Supabase connection
 * pressure on a serverless function, not rate limits.
 */
export async function runCorrelationEngine(): Promise<{
  dogs_processed: number;
  total_signals_written: number;
  per_dog: CorrelationRunResult[];
}> {
  // Any dog with a food event is now in scope, not only those with an
  // attributed log — a dog with events but no eligible logs yet still needs
  // its (empty) analysis computed so stale rows from a previous run clear.
  const [
    { data: eventDogs, error: eventError },
    { data: logDogs, error: logError },
    { data: stoolDogs, error: stoolError },
  ] =
    await Promise.all([
      supabaseAdmin.from('dog_food_events').select('dog_id'),
      supabaseAdmin
        .from('dog_log_entries')
        .select('dog_id')
        .eq('within_expected_variability_window', false)
        .not('food_id_active', 'is', null),
      supabaseAdmin.from('dog_stool_events').select('dog_id'),
    ]);

  if (eventError) throw eventError;
  if (logError) throw logError;
  if (stoolError) throw stoolError;

  const dogIds = Array.from(
    new Set([
      ...(eventDogs ?? []).map((r) => r.dog_id as string),
      ...(logDogs ?? []).map((r) => r.dog_id as string),
      ...(stoolDogs ?? []).map((r) => r.dog_id as string),
    ])
  );

  const perDog: CorrelationRunResult[] = [];
  let totalWritten = 0;

  for (const dogId of dogIds) {
    try {
      const result = await computeCorrelationsForDog(dogId);
      perDog.push(result);
      totalWritten += result.signals_written;
      console.log(
        `[correlation-engine] dog ${dogId}: ${result.switches_analysed} switches, ${result.signals_written} signals written, ${result.signals_skipped_insufficient_data} skipped (insufficient sample), suspect set ${result.suspect_set_size} (narrowed_enough=${result.narrowed_enough}, failed switches=${result.failed_switch_count})`
      );
    } catch (err) {
      console.error(`[correlation-engine] failed for dog ${dogId}`, err);
    }
  }

  return { dogs_processed: dogIds.length, total_signals_written: totalWritten, per_dog: perDog };
}
