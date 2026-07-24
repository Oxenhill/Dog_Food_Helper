import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { computeCorrelationsForDog, runCorrelationEngine } from '@/lib/correlationEngine';

/**
 * POST /api/cron/correlation-engine — Phase 6 correlation engine
 * (`ingredient_outcome_signals`). Intended to run daily (see vercel.json).
 *
 * Optional body: { dog_id: string } — runs for a single dog only (useful
 * for manually verifying against a specific dog's seeded data, per the
 * phase's test instruction). Without a body, runs across every dog that has
 * at least one eligible log entry.
 */
export async function POST(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    let dogId: string | undefined;
    try {
      const body = await request.json();
      dogId = body?.dog_id;
    } catch {
      // no body / not JSON — run for all dogs
    }

    if (dogId) {
      const result = await computeCorrelationsForDog(dogId);
      return NextResponse.json(result, { status: 200 });
    }

    const result = await runCorrelationEngine();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[correlation-engine] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Vercel Cron triggers scheduled jobs with a GET request (see vercel.json).
// GET always runs for all dogs (no body to read a dog_id override from).
export async function GET(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  try {
    const result = await runCorrelationEngine();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[correlation-engine] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
