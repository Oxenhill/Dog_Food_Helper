import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { runFoodDiscovery, hasGatewayAuth } from '@/lib/foodDiscovery';

/**
 * POST|GET /api/cron/food-discovery — weekly food discovery (Phase 6).
 * Scheduled Sunday 02:00 UTC in vercel.json.
 *
 * Crawls `source_domain_allowlist` (approved=true) for candidate product
 * pages, extracts each through the **Vercel AI Gateway**, and inserts new
 * foods after duplicate + required-field checks (Tier 1, architecture doc §7).
 *
 * This used to be a two-phase submit/process pair because it ran on
 * Anthropic's async Message Batches API. It no longer does: this platform uses
 * the Gateway exclusively and holds no Anthropic key, and the Gateway has no
 * batch endpoint — so discovery is a single synchronous run with bounded
 * concurrency. The companion `/process` route is gone.
 *
 * Cost is bounded by MAX_PAGES_PER_RUN (50) inside the job — one Haiku call
 * per candidate page.
 */
async function handle(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!hasGatewayAuth()) {
    return NextResponse.json(
      {
        error:
          'No AI Gateway auth configured. Set AI_GATEWAY_API_KEY, or deploy on Vercel with OIDC Federation enabled (VERCEL_OIDC_TOKEN), before running food discovery.',
      },
      { status: 503 }
    );
  }

  try {
    const result = await runFoodDiscovery();
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    console.error('[food-discovery] run error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = handle;
// Vercel Cron triggers scheduled jobs with GET (see vercel.json).
export const GET = handle;
