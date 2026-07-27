import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { processGtinVerificationQueue } from '@/lib/gs1Verify';

/**
 * GET|POST /api/cron/gs1-verification — daily, rate-limited GS1 registry
 * check for owner-scanned GTINs. See src/lib/gs1Verify.ts for why this is
 * async (30 lookups/day free tier) and why it does nothing at all until
 * GS1_API_BASE_URL/GS1_API_KEY are actually configured (every pending row
 * is marked skipped_no_api_key rather than left silently stuck).
 */
export const dynamic = 'force-dynamic';

async function handle(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await processGtinVerificationQueue();
    return NextResponse.json({ ok: true, ...result }, { status: 200 });
  } catch (error) {
    console.error('[gs1-verification] run error:', error);
    return NextResponse.json({ ok: false, error: 'Internal server error' }, { status: 500 });
  }
}

export const GET = handle;
export const POST = handle;
