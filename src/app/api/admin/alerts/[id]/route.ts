import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Resolve a system_alerts row. Resolution is a deliberate admin action, not
 * automatic on next-good-run — the underlying assertion re-raises and
 * re-alerts on its own if the problem recurs (see run_scheduled_assertions'
 * dedupe-on-unresolved logic), so marking this resolved just clears the
 * banner for this occurrence.
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

  if (body.resolved !== true) {
    return NextResponse.json({ error: 'Provide `resolved: true`.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('system_alerts')
    .update({ resolved_at: new Date().toISOString(), resolved_by: admin.id })
    .eq('id', params.id)
    .select('id, check_name, message, detected_at, resolved_at')
    .single();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alert: data }, { status: 200 });
}
