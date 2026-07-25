import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Admin research-corpus list (Phase 4 status/management surface — VIEW ONLY,
 * no embedding/LLM code here). Admin-gated (requireAdmin — verified session +
 * user_profiles.is_admin).
 *
 * Returns research_documents (id, topic, title, source_url, review_status,
 * retrieved_at, superseded_by) plus a per-document chunk_count, ordered by
 * retrieved_at desc. The research corpus is deliberately built slowly — an
 * empty table is expected and returns an empty array, not an error.
 *
 * chunk_count is computed with a single grouped query against
 * research_chunks selecting only `document_id` (never `embedding`, never
 * `content` — this route doesn't need chunk bodies, just counts per doc) and
 * tallying client-side. This avoids N head-count queries per document while
 * still never selecting the vector column.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    // 404, not 403 — don't confirm the endpoint's existence to non-admins.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [docsRes, chunksRes] = await Promise.all([
    supabaseAdmin
      .from('research_documents')
      .select('id, topic, title, source_url, review_status, retrieved_at, superseded_by')
      .order('retrieved_at', { ascending: false }),
    supabaseAdmin.from('research_chunks').select('document_id'),
  ]);

  if (docsRes.error) {
    return NextResponse.json({ error: docsRes.error.message }, { status: 500 });
  }
  if (chunksRes.error) {
    return NextResponse.json({ error: chunksRes.error.message }, { status: 500 });
  }

  const counts = new Map<string, number>();
  for (const row of chunksRes.data ?? []) {
    counts.set(row.document_id, (counts.get(row.document_id) ?? 0) + 1);
  }

  const documents = (docsRes.data ?? []).map((doc) => ({
    ...doc,
    chunk_count: counts.get(doc.id) ?? 0,
  }));

  return NextResponse.json({ documents }, { status: 200 });
}
