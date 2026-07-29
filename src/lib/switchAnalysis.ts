import { supabaseAdmin } from './supabase';
import { STOOL_SCORE_IDEAL, BCS_IDEAL } from './chartReference';
import { loadDailyStoolObservationLogs } from './stoolEvents';
import {
  BeforeState,
  DogFoodEvent,
  DogLogEntry,
  OutcomeMetric,
  SuspectReason,
  SwitchMetricOutcome,
  SwitchOutcome,
  WellnessLevel,
} from './types';

/**
 * Food-change analysis — the diagnostic core.
 *
 * A food switch is a natural experiment, and it is far better evidence than
 * logs sitting inside one long food period. The previous engine credited
 * EVERY ingredient in the active food with whatever was logged, so a 30-item
 * list produced 30 identically-weighted signals that meant very little. Here,
 * the ingredient sets either side of a switch are compared, and which set is
 * implicated depends on whether the outcome actually MOVED:
 *
 *   before poor -> improved : REMOVED are suspects for the problem;
 *                             ADDED are candidates for what helped.
 *                             Retained set is controlled for.
 *   before good -> worsened : ADDED are suspects;
 *                             REMOVED were possibly protective.
 *                             Retained set is controlled for.
 *   poor -> still poor      : the DIFFERING set is EXONERATED — it changed and
 *                             nothing happened. The RETAINED ingredients are
 *                             the prime suspects, and the next recommendation
 *                             should try to break that set.
 *   good -> still good      : weak positive only — the retained set is at
 *                             least tolerated.
 *
 * The third row is the diagnostically important one, and the most common in
 * practice: an owner switches food *because* the dog is unwell, and it does
 * not work. Note it is NOT true in general that shared ingredients are
 * "controlled for" — that only holds when the outcome changed.
 *
 * Compounding across failed switches is where the real power is:
 *
 *   ( intersection of ingredients across every food the dog did POORLY on )
 *   minus ( any ingredient present in a food the dog did WELL on )
 *
 * Each additional failed switch narrows it — elimination-diet reasoning from
 * logged data rather than guesswork.
 *
 * THREE THINGS THIS DELIBERATELY DOES NOT DO:
 *
 * 1. It does not present early results as findings. Cheap foods share the same
 *    generic staples ("cereals", "meat and animal derivatives", "beet pulp"),
 *    so after one failed switch the intersection may still be 15+ ingredients.
 *    `narrowedEnough` gates that, and the set size is always reported.
 * 2. It never becomes a hard filter. Suspects belong to the inference layer —
 *    a preference for foods that break the set — never to hardFilter.ts, which
 *    is reserved for vet-gated facts. A logged suspicion is a hypothesis.
 * 3. It never asserts intolerance. This edges toward diagnosing food
 *    intolerance, which is a veterinary matter; a real elimination diet must be
 *    vet-supervised. Copy says "worth discussing with your vet".
 */

// ---------------------------------------------------------------------------
// Tunable heuristics
// ---------------------------------------------------------------------------
// Hardcoded here with the same rationale as CONFIDENCE_THRESHOLDS in
// correlationEngine.ts: no config table exists for these in Part A, and they
// are flagged as tunable rather than presented as derived constants.

export const SWITCH_ANALYSIS_THRESHOLDS = {
  /**
   * |net| at or above this counts as a real move rather than noise.
   * net = (better - worse) / eligible logs, so 0.34 means roughly a third more
   * logs went one way than the other.
   */
  decisiveNet: 0.34,
  /** Below this many eligible post-switch logs, the metric says nothing. */
  minLogsPerMetric: 2,
  /**
   * A suspect set is only worth showing once it is genuinely small AND backed
   * by more than one failed switch. Otherwise the honest report is "not
   * narrowed enough yet", with the current size.
   */
  minFailedSwitchesToSurface: 2,
  maxUsefulSuspectSetSize: 8,
};

/**
 * Directional strength assigned when the outcome did NOT move. There is no net
 * to take a magnitude from (net ~ 0 is the whole point), so these are stated
 * constants rather than computed ones — the signal is real but its size is a
 * judgement, and pretending otherwise would be false precision.
 */
export const UNCHANGED_SIGNAL_STRENGTH = {
  /** Nothing improved while this was present, and the dog was unwell. */
  retainedWhileConcerning: -0.5,
  /** Nothing broke while this was present, and the dog was fine. */
  retainedWhileAcceptable: 0.25,
};

/** Metrics a food change plausibly moves, used for the tolerated/not verdict. */
const DIGESTIVE_METRICS: OutcomeMetric[] = [
  'stool_score',
  'stool_frequency',
  'stool_odor',
  'gas_frequency',
  'gas_odor',
];

// ---------------------------------------------------------------------------
// Absolute state classification
// ---------------------------------------------------------------------------

/**
 * Was this reading concerning?
 *
 * `trend` is baseline-relative ("better/worse/no_change"), so it cannot tell
 * us whether the dog was actually unwell — only whether it moved. The absolute
 * state comes from `raw_value`, which baseline and recalibration entries carry.
 *
 * This distinction is load-bearing: it is the ONLY thing separating
 * "poor -> still poor" (retained ingredients are the prime suspects) from
 * "good -> still good" (weak positive). When no absolute reading exists the
 * answer is 'unknown' and neither conclusion is drawn — guessing here would
 * invert the meaning of the result.
 */
export function classifyAbsoluteReading(
  metric: OutcomeMetric,
  rawValue: string | null | undefined
): BeforeState {
  if (rawValue === null || rawValue === undefined || rawValue === '') return 'unknown';

  switch (metric) {
    case 'stool_score': {
      const v = Number(rawValue);
      if (Number.isNaN(v)) return 'unknown';
      // Ideal is Type 2. Types 4-7 are the loose end of the scale and the
      // signal that matters for food tolerance; Type 1 (very hard and dry) is
      // also explicitly abnormal. Type 3 holds its shape and is fine.
      return v >= 4 || v <= 1 ? 'concerning' : 'acceptable';
    }
    case 'body_condition_score': {
      const v = Number(rawValue);
      if (Number.isNaN(v)) return 'unknown';
      // Ideal is 5; two points either way is under/overweight enough to matter.
      return Math.abs(v - BCS_IDEAL) >= 2 ? 'concerning' : 'acceptable';
    }
    case 'coat_condition':
    case 'stool_odor':
    case 'gas_frequency':
    case 'gas_odor': {
      const level = rawValue as WellnessLevel;
      if (level === 'poor') return 'concerning';
      // 'questionable' is deliberately NOT concerning — it is the borderline
      // bucket, and treating borderline as a problem would inflate the
      // suspect set with ingredients from periods that were merely unremarkable.
      if (level === 'good' || level === 'questionable') return 'acceptable';
      return 'unknown';
    }
    default:
      // behaviour_tag is a free-text tag list and weight_trend lives in
      // dog_weight_logs — neither has a principled absolute classification.
      return 'unknown';
  }
}

// Referenced so the ideal-point constants both stay visibly tied to this logic.
void STOOL_SCORE_IDEAL;

// ---------------------------------------------------------------------------
// Data loading
// ---------------------------------------------------------------------------

interface IngredientRow {
  food_id: string;
  ingredient_name: string;
}

/**
 * Ingredient names per food, lower-cased for comparison.
 *
 * Nested sub-ingredients are ordinary rows in `food_ingredients` with a
 * `parent_ingredient_id`, and are included here exactly like top-level ones —
 * which is how a beef-flavoured food's hidden chicken is caught.
 *
 * A food with no rows is absent from the map entirely. That is "unknown", not
 * "contains nothing", and callers must treat it as such.
 */
async function loadIngredientsByFood(foodIds: string[]): Promise<Map<string, Set<string>>> {
  const byFood = new Map<string, Set<string>>();
  if (foodIds.length === 0) return byFood;

  const { data, error } = await supabaseAdmin
    .from('food_ingredients')
    .select('food_id, ingredient_name')
    .in('food_id', foodIds);

  if (error) throw error;

  for (const row of (data ?? []) as IngredientRow[]) {
    const name = row.ingredient_name?.trim().toLowerCase();
    if (!name) continue;
    const set = byFood.get(row.food_id) ?? new Set<string>();
    set.add(name);
    byFood.set(row.food_id, set);
  }
  return byFood;
}

// ---------------------------------------------------------------------------
// Per-switch analysis
// ---------------------------------------------------------------------------

export interface SwitchAnalysis {
  dogId: string;
  fromEvent: DogFoodEvent | null;
  toEvent: DogFoodEvent;
  fromFoodId: string | null;
  toFoodId: string | null;
  switchedAt: string;
  added: string[];
  removed: string[];
  retained: string[];
  ingredientSetsKnown: boolean;
  metricOutcomes: Record<string, SwitchMetricOutcome>;
  treatLoggingEnabled: boolean;
  confoundingTreatIngredients: string[];
}

function classifyOutcome(net: number, sampleSize: number): SwitchOutcome {
  if (sampleSize < SWITCH_ANALYSIS_THRESHOLDS.minLogsPerMetric) return 'insufficient_data';
  if (net >= SWITCH_ANALYSIS_THRESHOLDS.decisiveNet) return 'improved';
  if (net <= -SWITCH_ANALYSIS_THRESHOLDS.decisiveNet) return 'worsened';
  return 'unchanged';
}

/**
 * The dog's absolute state for a metric immediately before a switch — the most
 * recent reading that carries a raw_value (baseline or recalibration) dated
 * before the switch.
 */
function beforeStateForMetric(
  logs: DogLogEntry[],
  metric: OutcomeMetric,
  switchedAt: Date
): BeforeState {
  const priorAbsolute = logs
    .filter(
      (l) =>
        l.metric === metric &&
        l.raw_value != null &&
        l.raw_value !== '' &&
        new Date(l.log_date) <= switchedAt
    )
    .sort((a, b) => new Date(b.log_date).getTime() - new Date(a.log_date).getTime())[0];

  return classifyAbsoluteReading(metric, priorAbsolute?.raw_value);
}

/**
 * Builds one analysis per main_food event, comparing it against its
 * predecessor.
 *
 * Nothing is written here — this is the pure computation, so it can be
 * reasoned about and tested without touching the database.
 */
export async function analyseSwitchesForDog(
  dogId: string,
  treatLoggingEnabled: boolean
): Promise<SwitchAnalysis[]> {
  const { data: eventRows, error: eventsError } = await supabaseAdmin
    .from('dog_food_events')
    .select('*')
    .eq('dog_id', dogId)
    .order('started_at', { ascending: true });

  if (eventsError) throw eventsError;
  const allEvents = (eventRows ?? []) as DogFoodEvent[];
  const mainFoodEvents = allEvents.filter((e) => e.event_type === 'main_food');
  const treatEvents = allEvents.filter((e) => e.event_type === 'treat');

  if (mainFoodEvents.length === 0) return [];

  const { data: logRows, error: logsError } = await supabaseAdmin
    .from('dog_log_entries')
    .select('*')
    .eq('dog_id', dogId);

  if (logsError) throw logsError;
  const storedLogs = (logRows ?? []) as DogLogEntry[];
  // Baseline stool rows are representative profiles, not bowel movements.
  // New event data contributes exactly one derived sample per observed day.
  const nonStoolLogs = storedLogs.filter(
    (log) => log.metric !== 'stool_score' && log.metric !== 'stool_frequency'
  );
  const allDailyStoolLogs = await loadDailyStoolObservationLogs(dogId);
  const logsForBeforeState = [...nonStoolLogs, ...allDailyStoolLogs];

  const { data: monitoringRows, error: monitoringError } = await supabaseAdmin
    .from('dog_stool_monitoring_windows')
    .select('id, food_event_id')
    .eq('dog_id', dogId);
  if (monitoringError) throw monitoringError;
  const monitoringByFoodEvent = new Map<string, string>(
    (monitoringRows ?? []).map((row) => [row.food_event_id as string, row.id as string])
  );

  const { data: lagRows, error: lagError } = await supabaseAdmin
    .from('metric_minimum_lag_days')
    .select('outcome_metric, minimum_lag_days');
  if (lagError) throw lagError;
  const lagByMetric = new Map<string, number>(
    (lagRows ?? []).map((r) => [r.outcome_metric as string, r.minimum_lag_days as number])
  );

  const foodIds = Array.from(
    new Set(
      [...mainFoodEvents, ...treatEvents]
        .map((e) => e.food_or_treat_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  const ingredientsByFood = await loadIngredientsByFood(foodIds);

  const analyses: SwitchAnalysis[] = [];

  for (let i = 0; i < mainFoodEvents.length; i++) {
    const toEvent = mainFoodEvents[i];
    const fromEvent = i > 0 ? mainFoodEvents[i - 1] : null;

    const switchedAt = new Date(toEvent.started_at);
    const periodEnd = toEvent.ended_at ? new Date(toEvent.ended_at) : new Date();

    // Logs inside the transition are confounded by BOTH foods — a phased
    // switch means the dog is literally eating a mixture — so they are not
    // clean evidence for the new food.
    const transitionEnd = toEvent.in_transition_until
      ? new Date(toEvent.in_transition_until)
      : switchedAt;

    const metricOutcomes: Record<string, SwitchMetricOutcome> = {};
    const monitoringWindowId = monitoringByFoodEvent.get(toEvent.id);
    const windowStoolLogs = monitoringWindowId
      ? await loadDailyStoolObservationLogs(dogId, monitoringWindowId)
      : [];
    const analysisLogs = [...nonStoolLogs, ...windowStoolLogs];
    const metricsPresent = Array.from(new Set(analysisLogs.map((log) => log.metric)));

    for (const metric of metricsPresent) {
      const lagDays = lagByMetric.get(metric) ?? 0;
      // The metric's own settling window: digestive ~10d, energy/weight ~21d,
      // coat/skin ~56d. A coat reading taken 12 days after a switch says
      // nothing about the new food.
      const eligibleFrom = new Date(
        Math.max(
          transitionEnd.getTime(),
          switchedAt.getTime() + lagDays * 24 * 60 * 60 * 1000
        )
      );

      const eligible = analysisLogs.filter((l) => {
        if (l.metric !== metric) return false;
        if (l.trend == null) return false; // baseline rows carry no trend
        if (l.within_expected_variability_window) return false;
        const d = new Date(l.log_date);
        return d >= eligibleFrom && d <= periodEnd;
      });

      const sampleSize = eligible.length;
      const better = eligible.filter((l) => l.trend === 'better').length;
      const worse = eligible.filter((l) => l.trend === 'worse').length;
      const net = sampleSize > 0 ? (better - worse) / sampleSize : 0;

      metricOutcomes[metric] = {
        outcome: classifyOutcome(net, sampleSize),
        before_state: beforeStateForMetric(
          logsForBeforeState,
          metric as OutcomeMetric,
          switchedAt
        ),
        sample_size: sampleSize,
        net: Number(net.toFixed(4)),
        lag_days: lagDays,
      };
    }

    // Ingredient sets — only meaningful when BOTH sides are known.
    const fromFoodId = fromEvent?.food_or_treat_id ?? null;
    const toFoodId = toEvent.food_or_treat_id ?? null;
    const fromIngredients = fromFoodId ? ingredientsByFood.get(fromFoodId) : undefined;
    const toIngredients = toFoodId ? ingredientsByFood.get(toFoodId) : undefined;

    let added: string[] = [];
    let removed: string[] = [];
    let retained: string[] = [];
    let ingredientSetsKnown = false;

    if (fromIngredients && toIngredients) {
      added = [...toIngredients].filter((n) => !fromIngredients.has(n)).sort();
      removed = [...fromIngredients].filter((n) => !toIngredients.has(n)).sort();
      retained = [...toIngredients].filter((n) => fromIngredients.has(n)).sort();
      ingredientSetsKnown = true;
    } else if (!fromEvent && toIngredients) {
      // The dog's first recorded food has no predecessor, so there is no
      // switch and no differing set — but its ingredient list is known, and
      // the period still counts as a tolerated/not-tolerated observation.
      retained = [...toIngredients].sort();
      ingredientSetsKnown = true;
    }

    // Treats given inside the analysed window are alternative explanations for
    // whatever changed. With treat logging OFF they are invisible, which the
    // confidence output must say rather than assume there were none.
    const confoundingTreatIngredients = treatLoggingEnabled
      ? Array.from(
          new Set(
            treatEvents
              .filter((t) => {
                const at = new Date(t.started_at);
                return at >= switchedAt && at <= periodEnd;
              })
              .flatMap((t) =>
                t.food_or_treat_id ? [...(ingredientsByFood.get(t.food_or_treat_id) ?? [])] : []
              )
          )
        ).sort()
      : [];

    analyses.push({
      dogId,
      fromEvent,
      toEvent,
      fromFoodId,
      toFoodId,
      switchedAt: toEvent.started_at,
      added,
      removed,
      retained,
      ingredientSetsKnown,
      metricOutcomes,
      treatLoggingEnabled,
      confoundingTreatIngredients,
    });
  }

  return analyses;
}

// ---------------------------------------------------------------------------
// Food-period verdicts and the rolling suspect set
// ---------------------------------------------------------------------------

export type PeriodVerdict = 'poorly_tolerated' | 'well_tolerated' | 'no_verdict';

/**
 * Did the dog do badly on this food?
 *
 * Read off the digestive metrics only — those are what a food change plausibly
 * moves on a timescale the logs capture. Any single digestive metric going
 * wrong is enough for a "poorly tolerated" verdict; a well-tolerated verdict
 * needs no metric to have gone wrong.
 */
export function verdictForPeriod(analysis: SwitchAnalysis): PeriodVerdict {
  let sawPoor = false;
  let sawGood = false;

  for (const metric of DIGESTIVE_METRICS) {
    const outcome = analysis.metricOutcomes[metric];
    if (!outcome || outcome.outcome === 'insufficient_data') continue;

    if (outcome.outcome === 'worsened') {
      sawPoor = true;
    } else if (outcome.outcome === 'improved') {
      sawGood = true;
    } else if (outcome.outcome === 'unchanged') {
      // The decisive distinction. Nothing moved — but was the dog unwell
      // while nothing moved, or fine while nothing moved?
      if (outcome.before_state === 'concerning') sawPoor = true;
      else if (outcome.before_state === 'acceptable') sawGood = true;
      // 'unknown' contributes nothing: undecidable, and not guessed.
    }
  }

  if (sawPoor) return 'poorly_tolerated';
  if (sawGood) return 'well_tolerated';
  return 'no_verdict';
}

export interface SuspectCandidate {
  ingredientName: string;
  poorFoodCount: number;
  implicatedMetrics: string[];
  reason: SuspectReason;
}

export interface SuspectSetResult {
  suspects: SuspectCandidate[];
  /** Poorly-tolerated food periods with known ingredients — what narrows the set. */
  failedSwitchCount: number;
  wellToleratedCount: number;
  /**
   * False when there is too little to say. The set size is reported either
   * way, so the UI can be honest about how far it has narrowed rather than
   * presenting a long list as a finding.
   */
  narrowedEnough: boolean;
  /** True when any analysed switch had an unknown ingredient set. */
  hasUnknownIngredientData: boolean;
  /** True when treat logging was off, so unlogged treats are an open confounder. */
  treatConfounderUnmeasured: boolean;
}

/**
 * Derives the rolling suspect set:
 *
 *   ( intersection of ingredients across every POORLY tolerated food )
 *   minus ( any ingredient present in a WELL tolerated food )
 *
 * plus the narrower per-switch signals, where the differing set is implicated
 * because the outcome actually moved.
 */
export function deriveSuspectSet(analyses: SwitchAnalysis[]): SuspectSetResult {
  const usable = analyses.filter((a) => a.ingredientSetsKnown);

  const poorPeriods: SwitchAnalysis[] = [];
  const goodPeriods: SwitchAnalysis[] = [];

  for (const analysis of usable) {
    const verdict = verdictForPeriod(analysis);
    if (verdict === 'poorly_tolerated') poorPeriods.push(analysis);
    else if (verdict === 'well_tolerated') goodPeriods.push(analysis);
  }

  // Everything the dog demonstrably did WELL on is exonerated, whichever route
  // put it under suspicion.
  const exonerated = new Set<string>();
  for (const good of goodPeriods) {
    for (const name of [...good.added, ...good.retained]) exonerated.add(name);
  }

  const candidates = new Map<string, SuspectCandidate>();

  // --- Rule 1: retained across failed switches -----------------------------
  // The ingredients present in EVERY poorly-tolerated food. Each additional
  // failed switch shrinks this intersection.
  if (poorPeriods.length > 0) {
    const ingredientSetsPerPoorFood = poorPeriods.map(
      (a) => new Set([...a.added, ...a.retained])
    );
    let intersection = new Set(ingredientSetsPerPoorFood[0]);
    for (const set of ingredientSetsPerPoorFood.slice(1)) {
      intersection = new Set([...intersection].filter((n) => set.has(n)));
    }

    const implicatedMetrics = new Set<string>();
    for (const period of poorPeriods) {
      for (const metric of DIGESTIVE_METRICS) {
        const outcome = period.metricOutcomes[metric];
        if (!outcome) continue;
        if (
          outcome.outcome === 'worsened' ||
          (outcome.outcome === 'unchanged' && outcome.before_state === 'concerning')
        ) {
          implicatedMetrics.add(metric);
        }
      }
    }

    for (const name of intersection) {
      if (exonerated.has(name)) continue;
      candidates.set(name, {
        ingredientName: name,
        poorFoodCount: poorPeriods.length,
        implicatedMetrics: [...implicatedMetrics].sort(),
        reason: 'retained_across_failed_switches',
      });
    }
  }

  // --- Rule 2: the differing set, when the outcome actually moved ----------
  // Narrow BY CONSTRUCTION — only what changed — so worth recording even from
  // a single switch, as the one observation it is.
  //
  // But "only what changed" is not automatically small. Switching between two
  // unrelated recipes can swap 25 ingredients at once, and "one of these 25
  // things helped" is not a finding, it is a list. The same "too broad to mean
  // anything" rule that gates the intersection therefore gates this too:
  // beyond maxUsefulSuspectSetSize the switch is recorded in
  // dog_food_switch_analyses (the evidence trail is kept) but contributes no
  // suspects.
  //
  // Found by exercising this against real data: a dog with a clean 2-ingredient
  // set backed by 3 failed switches switched to a food it did well on, and the
  // ~25 ingredients dropped by that one switch buried the strong finding under
  // weak single-observation ones.
  const withinUsefulSize = (set: string[]) =>
    set.length > 0 && set.length <= SWITCH_ANALYSIS_THRESHOLDS.maxUsefulSuspectSetSize;

  for (const analysis of usable) {
    if (!analysis.fromEvent) continue; // no predecessor, so nothing differs

    for (const metric of DIGESTIVE_METRICS) {
      const outcome = analysis.metricOutcomes[metric];
      if (!outcome) continue;

      // Improved: dropping something coincided with getting better, so the
      // REMOVED set holds the suspects for the original problem.
      if (outcome.outcome === 'improved' && withinUsefulSize(analysis.removed)) {
        for (const name of analysis.removed) {
          if (exonerated.has(name) || candidates.has(name)) continue;
          candidates.set(name, {
            ingredientName: name,
            poorFoodCount: 1,
            implicatedMetrics: [metric],
            reason: 'removed_on_improvement',
          });
        }
      }

      // Worsened: adding something coincided with getting worse.
      if (outcome.outcome === 'worsened' && withinUsefulSize(analysis.added)) {
        for (const name of analysis.added) {
          if (exonerated.has(name) || candidates.has(name)) continue;
          candidates.set(name, {
            ingredientName: name,
            poorFoodCount: 1,
            implicatedMetrics: [metric],
            reason: 'added_on_worsening',
          });
        }
      }

      // Unchanged while the dog was unwell: the differing set is EXONERATED —
      // it changed and nothing happened — and the retained set is already
      // covered by Rule 1. Deliberately no attribution here.
    }
  }

  const suspects = [...candidates.values()].sort(
    (a, b) => b.poorFoodCount - a.poorFoodCount || a.ingredientName.localeCompare(b.ingredientName)
  );

  const narrowedEnough =
    poorPeriods.length >= SWITCH_ANALYSIS_THRESHOLDS.minFailedSwitchesToSurface &&
    suspects.length > 0 &&
    suspects.length <= SWITCH_ANALYSIS_THRESHOLDS.maxUsefulSuspectSetSize;

  return {
    suspects,
    failedSwitchCount: poorPeriods.length,
    wellToleratedCount: goodPeriods.length,
    narrowedEnough,
    hasUnknownIngredientData: analyses.some((a) => !a.ingredientSetsKnown),
    treatConfounderUnmeasured: analyses.some((a) => !a.treatLoggingEnabled),
  };
}

/**
 * Whether a persisted suspect set is worth acting on.
 *
 * The single definition of "narrowed enough", shared by the engine that
 * derives the set and by every consumer that reads it back, so the rule can't
 * drift between the two. `poorFoodCount` on a retained-across-failed-switches
 * suspect IS the number of poorly-tolerated periods it survived, so the
 * failed-switch count can be recovered from the rows alone.
 *
 * Below this bar the honest report is "not narrowed enough yet" with the
 * current size — cheap foods share the same generic staples ("cereals", "meat
 * and animal derivatives", "beet pulp"), so an early intersection can still be
 * 15+ ingredients, and presenting that as a finding would be misleading.
 */
export function isSuspectSetNarrowedEnough(
  suspects: Array<{ poorFoodCount: number }>
): boolean {
  if (suspects.length === 0) return false;
  if (suspects.length > SWITCH_ANALYSIS_THRESHOLDS.maxUsefulSuspectSetSize) return false;
  const failedSwitchCount = Math.max(...suspects.map((s) => s.poorFoodCount));
  return failedSwitchCount >= SWITCH_ANALYSIS_THRESHOLDS.minFailedSwitchesToSurface;
}
