import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { submitDiscoveryBatch } from '@/lib/foodDiscovery';

/**
 * POST /api/cron/food-discovery — Phase 6 weekly food discovery job, phase 1
 * (submit). Intended to run weekly (e.g. Sunday 2 AM UTC — see vercel.json).
 *
 * Crawls `source_domain_allowlist` (approved=true) for candidate product
 * pages, submits a Batch API request per page (50% token discount per the
 * spec's explicit instruction to use the Batch API), and returns the batch
 * id + domain/url manifest.
 *
 * **Important operational note (see src/lib/foodDiscovery.ts's header
 * comment and BUILD_PROGRESS.md):** there is no persistence table for
 * in-flight batches in Part A's schema. The response body's `manifest` MUST
 * be retained externally (cron job logs, or ideally a future
 * `food_discovery_batches` tracking table) and passed to
 * POST /api/cron/food-discovery/process once the batch has ended (Batch API
 * turnaround can be up to ~24h) — this route does not itself wait for or
 * process results.
 */
export async function POST(request: NextRequest) {
  if (!isCronAuthorized(request)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await submitDiscoveryBatch();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[food-discovery] submit error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Vercel Cron triggers scheduled jobs with a GET request (see vercel.json) —
// exposed as an alias for POST so this route works both as a cron target
// and as a manually-POSTed admin action.
export const GET = POST;
