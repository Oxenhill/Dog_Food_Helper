import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import { runFoodDiscovery, hasGatewayAuth } from '@/lib/foodDiscovery';

/**
 * POST|GET /api/cron/food-discovery — Phase 6 food discovery.
 *
 * DISABLED as of 2026-07-27: the vercel.json cron entry was removed on
 * purpose. This job writes directly to `foods`/`food_ingredients` with no
 * review queue, uses an LLM as the page extractor on every candidate (the
 * exact pattern the Phase 2 spec forbids — see docs on parse_composition and
 * the crawler in src/lib/crawler/), and shares the same `approved` flag on
 * source_domain_allowlist that Phase 2's reviewed pipeline uses. Once any
 * domain is approved for Phase 2, this job would start writing to it too if
 * it were still scheduled. Kept in the tree only as a reference until a
 * Phase 2 adapter (src/lib/crawler/) proves out end-to-end against a real
 * domain, then this route and foodDiscovery.ts should be deleted, not
 * re-enabled. Still reachable manually (same isCronAuthorized gate as
 * before) for anyone who deliberately wants the old behaviour, which is why
 * it hasn't been deleted outright yet.
 *
 * Original design, still accurate for what the code below actually does:
 * crawls `source_domain_allowlist` (approved=true) for candidate product
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
