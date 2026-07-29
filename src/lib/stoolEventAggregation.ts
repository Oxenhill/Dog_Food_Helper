export interface StoolEventForAggregation {
  id: string;
  occurred_on: string;
  occurred_at?: string | null;
  score?: number | null;
  mucus?: boolean | null;
  blood?: boolean | null;
  urgency?: boolean | null;
  straining?: boolean | null;
  undigested_food?: boolean | null;
  created_at: string;
}

export interface DailyStoolSummary {
  date: string;
  count: number;
  scored_count: number;
  unscored_count: number;
  /**
   * Highest numeric chart score: the day's worst loose-stool observation.
   * Type 1 is also abnormal, so callers must not describe this as a universal
   * clinical severity ranking.
   */
  worst_score: number | null;
  median_score: number | null;
  spread: number | null;
  flags: {
    mucus: boolean;
    blood: boolean;
    urgency: boolean;
    straining: boolean;
    undigested_food: boolean;
  };
}

function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 1) return sorted[middle];
  return (sorted[middle - 1] + sorted[middle]) / 2;
}

/**
 * Pure read-time aggregation. No daily row is stored anywhere.
 */
export function deriveDailyStoolSummaries(
  events: StoolEventForAggregation[]
): DailyStoolSummary[] {
  const byDate = new Map<string, StoolEventForAggregation[]>();

  for (const event of events) {
    const group = byDate.get(event.occurred_on) ?? [];
    group.push(event);
    byDate.set(event.occurred_on, group);
  }

  return [...byDate.entries()]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, dayEvents]) => {
      const scores = dayEvents
        .map((event) => event.score)
        .filter((score): score is number => score !== null && score !== undefined)
        .sort((a, b) => a - b);

      return {
        date,
        count: dayEvents.length,
        scored_count: scores.length,
        unscored_count: dayEvents.length - scores.length,
        worst_score: scores.length > 0 ? scores[scores.length - 1] : null,
        median_score: median(scores),
        spread: scores.length > 0 ? scores[scores.length - 1] - scores[0] : null,
        flags: {
          mucus: dayEvents.some((event) => event.mucus === true),
          blood: dayEvents.some((event) => event.blood === true),
          urgency: dayEvents.some((event) => event.urgency === true),
          straining: dayEvents.some((event) => event.straining === true),
          undigested_food: dayEvents.some((event) => event.undigested_food === true),
        },
      };
    });
}
