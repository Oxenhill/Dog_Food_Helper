import { supabaseAdmin } from './supabase';
import { DogLogEntry, OutcomeMetric } from './types';

/**
 * The conditional treat-logging nudge.
 *
 * Treat logging is opt-in and stays off by default, because most owners will
 * not log every treat and a half-kept log is worse than none. But there is one
 * situation where it earns its friction: the dog's digestion is going wrong.
 * An unlogged treat is the single most common hidden variable behind exactly
 * those symptoms, and without it the correlation engine will confidently
 * attribute the problem to the food.
 *
 * So the prompt is conditional, not a nag: it fires only on a real digestive
 * trend, only when logging is off, and only until the owner answers it once
 * (dismissing or enabling both set `treat_logging_prompt_dismissed_at`).
 */

/** Digestive metrics — the ones a treat plausibly moves within days. */
const DIGESTIVE_METRICS: OutcomeMetric[] = [
  'stool_score',
  'stool_odor',
  'gas_frequency',
  'gas_odor',
];

/**
 * Tunable thresholds, flagged as heuristics in the same spirit as
 * CONFIDENCE_THRESHOLDS in correlationEngine.ts. One bad day is noise; the
 * point is to catch a pattern without waiting so long that the owner has
 * already given up.
 */
export const TREAT_PROMPT_THRESHOLDS = {
  /** How far back to look. */
  lookbackDays: 30,
  /** Minimum 'worse' digestive logs in that window before saying anything. */
  minWorseLogs: 2,
};

export interface TreatLoggingSuggestion {
  suggested: boolean;
  worseLogCount: number;
  betterLogCount: number;
  /** The digestive metrics that actually went the wrong way, for honest copy. */
  metrics: OutcomeMetric[];
}

const NO_SUGGESTION: TreatLoggingSuggestion = {
  suggested: false,
  worseLogCount: 0,
  betterLogCount: 0,
  metrics: [],
};

/**
 * Decides whether to suggest treat logging for a dog.
 *
 * `treatLoggingEnabled` / `promptDismissed` are passed in rather than
 * re-queried because the caller has already loaded the dog.
 */
export async function evaluateTreatLoggingSuggestion(
  dogId: string,
  treatLoggingEnabled: boolean,
  promptDismissed: boolean
): Promise<TreatLoggingSuggestion> {
  // Already logging, or already asked — nothing to say either way.
  if (treatLoggingEnabled || promptDismissed) return NO_SUGGESTION;

  const since = new Date();
  since.setDate(since.getDate() - TREAT_PROMPT_THRESHOLDS.lookbackDays);
  const sinceDate = since.toISOString().split('T')[0];

  const { data, error } = await supabaseAdmin
    .from('dog_log_entries')
    .select('metric, trend, log_date, within_expected_variability_window')
    .eq('dog_id', dogId)
    .in('metric', DIGESTIVE_METRICS)
    .gte('log_date', sinceDate)
    // Logs inside a post-switch settling window are expected to be unsettled,
    // so they are not evidence that something is wrong.
    .eq('within_expected_variability_window', false);

  if (error) throw error;

  const logs = (data ?? []) as Pick<DogLogEntry, 'metric' | 'trend'>[];

  const worse = logs.filter((l) => l.trend === 'worse');
  const better = logs.filter((l) => l.trend === 'better');

  const suggested =
    worse.length >= TREAT_PROMPT_THRESHOLDS.minWorseLogs && worse.length > better.length;

  return {
    suggested,
    worseLogCount: worse.length,
    betterLogCount: better.length,
    metrics: Array.from(new Set(worse.map((l) => l.metric))),
  };
}
