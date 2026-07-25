import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { validateRule, type RuleInput } from '@/lib/contraindications';

/**
 * Admin CRUD for condition_contraindications — the vet/owner-entered clinical
 * mappings the deterministic hard filter (src/lib/hardFilter.ts) uses to
 * exclude foods for a dog's health conditions.
 *
 * Safety invariants:
 *   - The app NEVER generates clinical mappings. Rows come only from human data
 *     entry through this admin surface.
 *   - A row is EITHER an ingredient rule OR a nutrient-threshold rule — never
 *     both, never neither (enforced by validateRule in @/lib/contraindications,
 *     which also restricts `nutrient` to the eight real foods.*_pct columns and
 *     `comparator` to hardFilter's supported operators).
 *   - New rows default to approved = false; only approved rows affect
 *     recommendations. Approval is a separate deliberate action (PATCH).
 */

const SELECT =
  'id, condition, contraindicated_ingredient, nutrient, comparator, threshold, rationale, source, approved, created_by, created_at';

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('condition_contraindications')
    .select(SELECT)
    .order('condition', { ascending: true })
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ rows: data ?? [] }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: RuleInput;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const result = validateRule(body);
  if ('error' in result) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('condition_contraindications')
    .insert({ ...result.rule, created_by: admin.id })
    .select(SELECT)
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ row: data }, { status: 201 });
}
