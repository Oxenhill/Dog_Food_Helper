import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET|POST /api/cron/keepalive — Supabase free-plan anti-pause ping.
 *
 * Supabase pauses a Free plan project after ~7 days of low *database*
 * activity; the docs say "typically a few user requests to the database each
 * day over the previous week is enough" to stay active
 * (https://supabase.com/docs/guides/platform/free-project-pausing).
 * Deploy traffic, dashboard visits and Vercel builds do NOT count — the query
 * has to reach Postgres.
 *
 * So this does exactly one thing: the smallest possible real read. It is
 * deliberately separate from the heavier daily jobs (correlation-engine,
 * inactivity-check) because those can fail or short-circuit before touching
 * the database, and then the project quietly drifts toward a pause.
 *
 * `metric_minimum_lag_days` is the ping target: a small static reference
 * table that is never empty and never written by user traffic. Read through
 * the service-role client so a future RLS policy change on that table cannot
 * silently turn the keepalive into a no-op.
 *
 * Two callers, both authorised the same way as every other cron route
 * (Authorization: Bearer $CRON_SECRET, or an admin session token):
 *   1. .github/workflows/supabase-keepalive.yml — every 6 hours, the primary.
 *   2. Vercel Cron (vercel.json) — once daily, the backstop. Hobby plan cron
 *      jobs may only run once per day, which is why GitHub Actions carries
 *      the main schedule.
 */
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const startedAt = Date.now();

  const { data, error } = await supabaseAdmin
    .from('metric_minimum_lag_days')
    .select('outcome_metric')
    .limit(1);

  const durationMs = Date.now() - startedAt;

  if (error) {
    // Fail loudly (500) rather than pretending success: a keepalive that
    // reports OK while never reaching Postgres is worse than no keepalive,
    // because the pause warning email is the only other signal.
    console.error('[keepalive] database ping failed:', error.message);
    return NextResponse.json(
      { ok: false, error: error.message, duration_ms: durationMs },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      ok: true,
      rows: data?.length ?? 0,
      duration_ms: durationMs,
      pinged_at: new Date().toISOString(),
    },
    { status: 200 }
  );
}

export const GET = handle;
export const POST = handle;
