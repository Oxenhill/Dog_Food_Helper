import { OutcomeMetric, TrendDirection, WellnessLevel } from './types';
import { STOOL_SCORE_IDEAL, BCS_IDEAL } from './chartReference';

/**
 * Derives `trend` for a logRecalibration entry by comparing a fresh raw_value
 * against the baseline reading for that metric (Part B: "computes trend
 * server-side by comparing raw_value against the baseline reading").
 *
 * - stool_score / body_condition_score: numeric charts with a defined "ideal"
 *   point (Type 2 for stool, 5 for BCS). Trend = whether the new reading is
 *   closer to or further from ideal than the baseline reading was.
 * - coat_condition / stool_odor / gas_frequency / gas_odor: ordinal
 *   good < questionable < poor scale.
 * - behaviour_tag: a free-text tag list, not orderable — there's no
 *   principled automatic "better/worse" derivation for a tag-list diff, so
 *   this returns null and the caller should require the owner to also supply
 *   a `trend` alongside the recalibration for this one metric. Flagged in
 *   BUILD_PROGRESS.md as an assumption, not silently guessed.
 * - weight_trend: tracked via dog_weight_logs, not dog_log_entries recalibration.
 */

const WELLNESS_RANK: Record<WellnessLevel, number> = {
  good: 0,
  questionable: 1,
  poor: 2,
};

export function deriveTrend(
  metric: OutcomeMetric,
  baselineRawValue: string | null | undefined,
  newRawValue: string
): TrendDirection | null {
  if (baselineRawValue === null || baselineRawValue === undefined) return null;

  switch (metric) {
    case 'stool_score':
    case 'body_condition_score': {
      const ideal = metric === 'stool_score' ? STOOL_SCORE_IDEAL : BCS_IDEAL;
      const baselineNum = Number(baselineRawValue);
      const newNum = Number(newRawValue);
      if (Number.isNaN(baselineNum) || Number.isNaN(newNum)) return null;
      const baselineDistance = Math.abs(baselineNum - ideal);
      const newDistance = Math.abs(newNum - ideal);
      if (newDistance < baselineDistance) return 'better';
      if (newDistance > baselineDistance) return 'worse';
      return 'no_change';
    }
    case 'coat_condition':
    case 'stool_odor':
    case 'gas_frequency':
    case 'gas_odor': {
      const baselineRank = WELLNESS_RANK[baselineRawValue as WellnessLevel];
      const newRank = WELLNESS_RANK[newRawValue as WellnessLevel];
      if (baselineRank === undefined || newRank === undefined) return null;
      if (newRank < baselineRank) return 'better';
      if (newRank > baselineRank) return 'worse';
      return 'no_change';
    }
    default:
      // behaviour_tag, weight_trend — no principled automatic derivation
      return null;
  }
}
