import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { ReviewStatus } from '@/lib/types';

/**
 * Admin research-document detail + status update. Admin-gated (requireAdmin
 * — verified session + user_profiles.is_admin). VIEW/STATUS ONLY: this route
 * never touches embedding or LLM code and never selects the `embedding`
 * column on research_chunks.
 *
 * GET returns the document plus its chunks (id, chunk_index, content —
 * embedding intentionally omitted), ordered by chunk_index asc.
 *
 * PATCH is a plain status update (no LLM/embedding work): body
 * { review_status?: 'approved'|'rejected'|'pending' }. Only that one
 * whitelisted field is ever written, validated against the enum before use.
 *
 * superseded_by is intentionally NOT writable here (removed for P5, 2026-08):
 * a raw field write bypassed every P5 propagation step -- claim/cluster
 * eligibility transitions, study-family promotion, and the audit trail.
 * Retraction/supersession now goes exclusively through
 * POST /api/admin/research/[docId]/lifecycle, which calls the atomic
 * propagate_research_document_status_change RPC.
 */

const VALID_REVIEW_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

type RouteParams = { params: Promise<{ docId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { docId } = await params;

  const [docRes, chunksRes] = await Promise.all([
    supabaseAdmin
      .from('research_documents')
      .select('id, topic, title, source_url, review_status, retrieved_at, superseded_by')
      .eq('id', docId)
      .maybeSingle(),
    supabaseAdmin
      .from('research_chunks')
      .select('id, chunk_index, content')
      .eq('document_id', docId)
      .order('chunk_index', { ascending: true }),
  ]);

  if (docRes.error) {
    return NextResponse.json({ error: docRes.error.message }, { status: 500 });
  }
  if (!docRes.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (chunksRes.error) {
    return NextResponse.json({ error: chunksRes.error.message }, { status: 500 });
  }

  return NextResponse.json(
    { document: docRes.data, chunks: chunksRes.data ?? [] },
    { status: 200 },
  );
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { docId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  if ('review_status' in body) {
    const raw = body.review_status;
    if (typeof raw !== 'string' || !VALID_REVIEW_STATUSES.includes(raw as ReviewStatus)) {
      return NextResponse.json(
        { error: `Field "review_status" must be one of: ${VALID_REVIEW_STATUSES.join(', ')}` },
        { status: 400 },
      );
    }
    update.review_status = raw;
  }

  if ('superseded_by' in body) {
    return NextResponse.json(
      {
        error:
          'Field "superseded_by" is no longer writable here. Use POST /api/admin/research/[docId]/lifecycle to supersede a document.',
      },
      { status: 400 },
    );
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('research_documents')
    .update(update)
    .eq('id', docId)
    .select('id, topic, title, source_url, review_status, retrieved_at, superseded_by')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ document: data }, { status: 200 });
}
