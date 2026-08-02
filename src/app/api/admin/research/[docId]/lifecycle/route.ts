import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { ResearchEvidenceLifecycleEvent } from '@/lib/types';

type RouteParams = { params: Promise<{ docId: string }> };
type LifecycleAction = 'retract' | 'supersede';

/**
 * P5: owner-initiated retraction/supersession. The sole writable path for
 * research_documents.retracted / superseded_by (the raw PATCH field write is
 * removed — see ../route.ts). Calls the atomic
 * propagate_research_document_status_change RPC, which in one transaction
 * marks the document, transitions its affected active claims and any
 * now-fully-unsupported clusters, auto-promotes a study-family replacement
 * primary when applicable, and appends an append-only audit event. A reason
 * is required — this is a one-way transition with no silent undo.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { docId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action as LifecycleAction | undefined;
  if (!action || !['retract', 'supersede'].includes(action)) {
    return NextResponse.json(
      { error: 'Field "action" must be "retract" or "supersede"' },
      { status: 400 },
    );
  }

  const reason = body.reason;
  if (typeof reason !== 'string' || reason.trim().length === 0) {
    return NextResponse.json({ error: 'Field "reason" is required' }, { status: 400 });
  }

  let replacementDocumentId: string | null = null;
  if (action === 'supersede') {
    const raw = body.replacement_document_id;
    if (typeof raw !== 'string' || raw.trim().length === 0) {
      return NextResponse.json(
        { error: 'Field "replacement_document_id" is required to supersede a document' },
        { status: 400 },
      );
    }
    replacementDocumentId = raw;
  } else if ('replacement_document_id' in body && body.replacement_document_id !== null) {
    return NextResponse.json(
      { error: 'Field "replacement_document_id" is only valid with action "supersede"' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin.rpc('propagate_research_document_status_change', {
    p_document_id: docId,
    p_action: action,
    p_replacement_document_id: replacementDocumentId,
    p_actor_id: admin.id,
    p_actor_type: 'owner',
    p_reason: reason.trim(),
  }) as { data: ResearchEvidenceLifecycleEvent | null; error: { message: string } | null };

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({ event: data }, { status: 200 });
}
