import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { checkInactiveAccounts } from '@/lib/accountLifecycle';

/**
 * POST /api/cron/inactivity-check — Phase 6 inactivity auto-deletion job
 * (architecture doc §10). Intended to run daily (e.g. 1 AM UTC — see
 * vercel.json). See src/lib/accountLifecycle.ts for full semantics
 * (warn -> delete state machine, hard-delete vs anonymise).
 */
export async function POST(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const result = await checkInactiveAccounts();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[inactivity-check] error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// Vercel Cron triggers scheduled jobs with a GET request (see vercel.json).
export const GET = POST;
