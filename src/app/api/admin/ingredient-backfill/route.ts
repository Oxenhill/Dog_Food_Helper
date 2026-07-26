import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getBackfillCandidates,
  runIngredientBackfill,
  hasGatewayAuth,
} from '@/lib/ingredientBackfill';

/**
 * Admin control for the ingredient / guaranteed-analysis backfill.
 *
 * GET  — how many foods still need composition data (no AI cost).
 * POST — { action: 'run', limit? } fetches each candidate's product page and
 *        extracts its composition through the **Vercel AI Gateway**.
 *
 * Now a single synchronous run. It was previously a submit/process pair
 * because it used Anthropic's async Message Batches API; this platform holds
 * no Anthropic key and the Gateway has no batch endpoint, so there is no
 * in-flight batch to process later.
 *
 * Deliberately manual rather than scheduled: it spends credits, so an admin
 * triggers it explicitly. `limit` is the spend control — one Haiku call per
 * candidate — so start small before committing to the full set.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const candidates = await getBackfillCandidates();

  const { data: runs } = await supabaseAdmin
    .from('batch_submissions')
    .select('batch_id, status, created_at, completed_at, result_summary')
    .order('created_at', { ascending: false })
    .limit(5);

  return NextResponse.json(
    {
      foods_needing_composition: candidates.length,
      sample: candidates.slice(0, 5).map((c) => ({
        brand: c.brand,
        name: c.name,
        ingredient_count: c.ingredient_count,
      })),
      gateway_auth: hasGatewayAuth(),
      recent_runs: runs ?? [],
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { action?: string; limit?: number };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (body.action !== 'run') {
    return NextResponse.json({ error: "action must be 'run'." }, { status: 400 });
  }

  if (!hasGatewayAuth()) {
    return NextResponse.json(
      {
        error:
          'No AI Gateway auth configured. Set AI_GATEWAY_API_KEY, or deploy on Vercel with OIDC Federation enabled (VERCEL_OIDC_TOKEN).',
      },
      { status: 503 },
    );
  }

  try {
    const result = await runIngredientBackfill(
      typeof body.limit === 'number' ? body.limit : undefined,
    );
    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Backfill run failed.' },
      { status: 500 },
    );
  }
}
