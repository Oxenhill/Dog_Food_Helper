import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  getBackfillCandidates,
  submitIngredientBackfill,
  processIngredientBackfill,
  type BackfillManifestEntry,
} from '@/lib/ingredientBackfill';

/**
 * Admin control for the ingredient / guaranteed-analysis backfill.
 *
 * GET    — how many foods still need composition data (no AI cost).
 * POST   — { action: 'submit', limit? } submits a Batch API job (costs credits;
 *          Haiku via Message Batches, ~50% cheaper, async up to 24h), or
 *          { action: 'process', batch_id } writes a finished batch's results.
 *
 * Deliberately manual rather than automatic: this spends API credits, so an
 * admin triggers it explicitly. `limit` allows a small trial run before
 * committing to the full set.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const candidates = await getBackfillCandidates();

  const { data: batches } = await supabaseAdmin
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
      recent_batches: batches ?? [],
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { action?: string; limit?: number; batch_id?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (body.action === 'submit') {
    try {
      const result = await submitIngredientBackfill(
        typeof body.limit === 'number' ? body.limit : undefined,
      );
      return NextResponse.json(result, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Submit failed.' },
        { status: 500 },
      );
    }
  }

  if (body.action === 'process') {
    if (!body.batch_id) {
      return NextResponse.json({ error: 'batch_id is required.' }, { status: 400 });
    }
    const { data: row } = await supabaseAdmin
      .from('batch_submissions')
      .select('manifest')
      .eq('batch_id', body.batch_id)
      .maybeSingle();

    const manifest = (row?.manifest ?? []) as BackfillManifestEntry[];
    if (manifest.length === 0) {
      return NextResponse.json(
        { error: 'No stored manifest for that batch_id.' },
        { status: 400 },
      );
    }

    try {
      const result = await processIngredientBackfill(body.batch_id, manifest);
      return NextResponse.json(result, { status: 200 });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Process failed.' },
        { status: 500 },
      );
    }
  }

  return NextResponse.json(
    { error: "action must be 'submit' or 'process'." },
    { status: 400 },
  );
}
