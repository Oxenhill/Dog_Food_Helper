import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { validateRule } from '@/lib/contraindications';

const SELECT =
  'id, condition, contraindicated_ingredient, nutrient, comparator, threshold, rationale, source, approved, created_by, created_at';

/**
 * Approve/unapprove, edit, or delete a single condition_contraindications row.
 *
 * PATCH accepts either:
 *   - `{ approved: boolean }` alone — the common approve/unapprove action; OR
 *   - a full rule edit (must include `condition`) — revalidated through the
 *     same validateRule() the create path uses, so an edit can never produce a
 *     malformed rule the hard filter would choke on or silently ignore.
 * Only approved = true rows affect recommendations (see hardFilter.ts).
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  // Full edit: body carries the rule fields (identified by `condition`).
  if (typeof body.condition === 'string') {
    const result = validateRule(body);
    if ('error' in result) {
      return NextResponse.json({ error: result.error }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('condition_contraindications')
      .update(result.rule)
      .eq('id', params.id)
      .select(SELECT)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data }, { status: 200 });
  }

  // Approve/unapprove only.
  if (typeof body.approved === 'boolean') {
    const { data, error } = await supabaseAdmin
      .from('condition_contraindications')
      .update({ approved: body.approved })
      .eq('id', params.id)
      .select(SELECT)
      .single();
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ row: data }, { status: 200 });
  }

  return NextResponse.json(
    { error: 'Provide `approved` (boolean) or a full rule edit including `condition`.' },
    { status: 400 },
  );
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: { id: string } },
) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { error } = await supabaseAdmin
    .from('condition_contraindications')
    .delete()
    .eq('id', params.id);

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true }, { status: 200 });
}
