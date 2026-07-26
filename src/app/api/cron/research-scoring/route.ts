import { NextRequest, NextResponse } from 'next/server';
import { isCronAuthorized } from '@/lib/cronAuth';
import {
  runResearchScoreWorker,
  requeueStaleRows,
  getQueueStats,
  hasGatewayAuth,
} from '@/lib/researchScoreWorker';

/**
 * POST|GET /api/cron/research-scoring — the offline research-relevance
 * scoring job (WS3 #2).
 *
 * This is the ONLY place research-relevance scores are computed. Recommendation
 * requests read `research_score_cache` and never call a model; anything not
 * cached is queued in `research_score_queue` and picked up here.
 *
 * Routed through the **Vercel AI Gateway** — no ANTHROPIC_API_KEY, no direct
 * Anthropic call. (The Gateway has no Message-Batches endpoint; verified live
 * — see researchScoreWorker.ts's header for the probe results.)
 *
 * Query params:
 *   ?limit=N       — max queue rows to score this run (default 100, cap 500).
 *                    This is the spend control: each row is one Sonnet call.
 *   ?concurrency=N — parallel Gateway calls (default 4, cap 10).
 *   ?dry=1         — report queue depth and do nothing. Costs nothing.
 *
 * A run first returns rows stranded by a previous crashed run to 'pending',
 * then scores. Safe to call repeatedly; the queue is drained incrementally.
 */
async function handle(request: NextRequest) {
  if (!(await isCronAuthorized(request))) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const params = request.nextUrl.searchParams;

  // Free introspection — lets the owner see the queue depth (and therefore the
  // cost of a full drain) before spending anything.
  if (params.get('dry') === '1') {
    return NextResponse.json(
      { dry_run: true, queue: await getQueueStats(), gateway_auth: hasGatewayAuth() },
      { status: 200 }
    );
  }

  if (!hasGatewayAuth()) {
    return NextResponse.json(
      {
        error:
          'No AI Gateway auth configured. Set AI_GATEWAY_API_KEY, or deploy on Vercel with OIDC Federation enabled (VERCEL_OIDC_TOKEN), before running research scoring.',
      },
      { status: 503 }
    );
  }

  const limitRaw = Number(params.get('limit'));
  const concurrencyRaw = Number(params.get('concurrency'));

  try {
    const requeued = await requeueStaleRows();
    const run = await runResearchScoreWorker({
      limit: Number.isFinite(limitRaw) && limitRaw > 0 ? limitRaw : undefined,
      concurrency:
        Number.isFinite(concurrencyRaw) && concurrencyRaw > 0 ? concurrencyRaw : undefined,
    });

    return NextResponse.json(
      { requeued_stale: requeued, ...run, queue: await getQueueStats() },
      { status: 200 }
    );
  } catch (error) {
    console.error('[research-scoring] job error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export const POST = handle;
// Vercel Cron triggers scheduled jobs with GET (see vercel.json).
export const GET = handle;
