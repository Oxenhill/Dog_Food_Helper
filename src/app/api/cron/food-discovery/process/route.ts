import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { processDiscoveryBatch } from '@/lib/foodDiscovery';

/**
 * POST /api/cron/food-discovery/process — Phase 6 weekly food discovery job,
 * phase 2 (process results). Call this once the batch submitted by
 * POST /api/cron/food-discovery has ended (poll, or trigger from a
 * follow-up cron/manual check — Batch API turnaround is async, up to ~24h).
 *
 * Body: { batch_id: string, manifest: Array<{ custom_id, domain, url }> }
 * — `manifest` must be the exact array returned by the submit route's
 * response (see that route's + src/lib/foodDiscovery.ts's header comments
 * for why no server-side tracking table exists yet to avoid this).
 *
 * If the batch hasn't ended yet, returns 202 with `batch_status` so the
 * caller knows to retry later rather than treating it as a failure.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = await request.json();
    const { batch_id, manifest } = body as {
      batch_id?: string;
      manifest?: Array<{ custom_id: string; domain: string; url: string }>;
    };

    if (!batch_id || !Array.isArray(manifest)) {
      return NextResponse.json(
        { error: 'batch_id and manifest (array) are required — see the submit route response' },
        { status: 400 }
      );
    }

    const result = await processDiscoveryBatch(batch_id, manifest);

    if (result.batch_status !== 'ended') {
      return NextResponse.json(result, { status: 202 });
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[food-discovery] process error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
