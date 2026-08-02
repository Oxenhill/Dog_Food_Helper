import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { runDiscoveryMission } from '@/lib/researchDiscoveryMission';
import { deriveScheduledMissionIdempotencyKey } from '@/lib/researchRecurringMissions';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

/**
 * P6 — recurring research discovery mission (see
 * docs/research-behive-architecture-review-2026-08.md's "P6 — recurring
 * missions" acceptance criteria).
 *
 * Scheduled monthly in vercel.json. Runs the exact same
 * `runDiscoveryMission` path the admin-triggered discovery route uses
 * (`requestedByActorType: 'system'` here vs `'owner'` there) -- there is no
 * separate/duplicated acquisition logic a recurring trigger could drift
 * from or bypass policy through.
 *
 * Overlap: the idempotency key is deterministic per UTC calendar month, so a
 * duplicate/overlapping trigger within the same month reuses
 * start_research_mission_job's existing idempotency mechanism (P0) and
 * returns the same mission rather than creating a second one. At a monthly
 * cadence this is not expected to occur in practice (a discovery run
 * finishes in well under this route's 300s budget); no additional
 * visible-skip signal is added for that reason.
 *
 * Cost/policy: discovery performs zero model or embedding calls (see
 * runDiscoveryMission's result_summary), so P2's budget caps do not apply to
 * it. Its real unattended failure modes are a thrown error (network/DB
 * failure) or every topic being denied by the structured-source policy gate
 * (`all_topics_blocked`) -- e.g. a source route disabled after this was
 * scheduled. Both write a deduplicated `system_alerts` row so an unattended
 * run that stops making progress is visible in /api/admin/alerts rather than
 * silently doing nothing for a month.
 */
async function writeRecurringDiscoveryAlert(checkName: string, message: string) {
  const { data: existingAlert } = await supabaseAdmin
    .from('system_alerts')
    .select('id')
    .eq('check_name', checkName)
    .is('resolved_at', null)
    .maybeSingle();
  if (!existingAlert) {
    await supabaseAdmin.from('system_alerts').insert({ check_name: checkName, message });
  }
}

async function handle(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const idempotencyKey = deriveScheduledMissionIdempotencyKey('discovery', 'monthly');

  try {
    const result = await runDiscoveryMission({
      requestedBy: null,
      requestedByActorType: 'system',
      idempotencyKey,
    });

    if (result.all_topics_blocked) {
      await writeRecurringDiscoveryAlert(
        `research_recurring_discovery:${idempotencyKey}:blocked`,
        `Scheduled research discovery (${idempotencyKey}) found every topic blocked by source policy or access failure. Mission ${result.job.mission_id}.`
      );
    }

    return NextResponse.json({ idempotency_key: idempotencyKey, ...result });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Scheduled discovery failed';
    await writeRecurringDiscoveryAlert(
      `research_recurring_discovery:${idempotencyKey}:failed`,
      `Scheduled research discovery (${idempotencyKey}) failed: ${message}`
    );
    console.error('[research-discovery] scheduled mission error:', error);
    return NextResponse.json(
      { error: message, idempotency_key: idempotencyKey },
      { status: 500 }
    );
  }
}

export const POST = handle;
// Vercel Cron triggers scheduled jobs with GET (see vercel.json).
export const GET = handle;
