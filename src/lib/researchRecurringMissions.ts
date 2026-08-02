export type RecurringMissionCadence = 'monthly';

/**
 * Deterministic idempotency key for one scheduled-mission cycle. Every
 * invocation within the same UTC calendar month collapses to the same key,
 * so repeated/overlapping cron triggers reuse
 * start_research_mission_job's existing idempotency mechanism (P0) to
 * produce exactly one mission -- no new overlap-prevention mechanism is
 * introduced here.
 */
export function deriveScheduledMissionIdempotencyKey(
  missionType: string,
  cadence: RecurringMissionCadence,
  at: Date = new Date()
): string {
  const year = at.getUTCFullYear();
  const month = String(at.getUTCMonth() + 1).padStart(2, '0');
  return `scheduled:${missionType}:${cadence}:${year}-${month}`;
}
