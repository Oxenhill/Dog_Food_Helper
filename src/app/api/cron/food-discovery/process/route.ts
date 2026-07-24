import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { getPendingBatchSubmissions, processDiscoveryBatch } from '@/lib/foodDiscovery';

/**
 * POST /api/cron/food-discovery/process — Phase 6 weekly food discovery job,
 * phase 2 (process results). Call this once the batch submitted by
 * POST /api/cron/food-discovery has ended (poll, or trigger from a
 * follow-up cron/manual check — Batch API turnaround is async, up to ~24h).
 *
 * Two ways to call it, now that submitDiscoveryBatch() persists a
 * `batch_submissions` row per batch (see src/lib/foodDiscovery.ts):
 *   - No body (or `{}`) — processes every outstanding batch_submissions row
 *     (status 'submitted'/'in_progress'). This is what lets Vercel Cron
 *     actually drive this step: cron sends a bodyless GET, which previously
 *     had no way to supply a batch_id/manifest at all.
 *   - `{ batch_id, manifest? }` — process one specific batch manually;
 *     `manifest` is optional and only needed as a fallback if no
 *     batch_submissions row exists for that id.
 *
 * Each processed batch that hasn't ended yet is reported with its
 * `batch_status`; the overall response is 200 unless every batch is still
 * pending, in which case it's 202.
 */
export async function POST(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let body: { batch_id?: string; manifest?: Array<{ custom_id: string; domain: string; url: string }> } = {};
    try {
      body = await request.json();
    } catch {
      // No body (e.g. Vercel Cron's GET, or a bodyless POST) — process all
      // outstanding batches instead of a single named one.
    }

    if (body.batch_id) {
      const result = await processDiscoveryBatch(body.batch_id, body.manifest);
      return NextResponse.json(result, { status: result.batch_status === 'ended' ? 200 : 202 });
    }

    const pending = await getPendingBatchSubmissions();
    if (pending.length === 0) {
      return NextResponse.json({ processed: 0, results: [] }, { status: 200 });
    }

    const results = [];
    for (const submission of pending) {
      const result = await processDiscoveryBatch(submission.batch_id);
      results.push({ batch_id: submission.batch_id, ...result });
    }

    const anyEnded = results.some((r) => r.batch_status === 'ended');
    return NextResponse.json({ processed: results.length, results }, { status: anyEnded ? 200 : 202 });
  } catch (error) {
    console.error('[food-discovery] process error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Vercel Cron triggers scheduled jobs with a GET request (see vercel.json) —
// exposed as an alias for POST so this route works both as a cron target
// (bodyless GET, processes all outstanding batches) and a manual admin
// action (POST with an optional { batch_id } to target one batch).
export const GET = POST;
