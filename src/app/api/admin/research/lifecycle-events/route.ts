import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { ResearchEvidenceLifecycleEvent } from '@/lib/types';

/**
 * P7 read model for the "Retraction watch" workspace: the append-only
 * research_evidence_lifecycle_events table (P5) is already the single
 * source of truth for every retraction/supersession -- this route only adds
 * admin-gated read access and resolves the ids it carries (documents,
 * affected claims/clusters) into display labels. It writes nothing; the
 * sole writable path remains POST /api/admin/research/[docId]/lifecycle.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { searchParams } = new URL(request.url);
  const limitParam = Number(searchParams.get('limit'));
  const limit = Number.isFinite(limitParam) ? Math.max(1, Math.min(Math.floor(limitParam), 100)) : 30;

  const { data: events, error } = await supabaseAdmin
    .from('research_evidence_lifecycle_events')
    .select('*')
    .order('occurred_at', { ascending: false })
    .limit(limit);
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const rows = (events ?? []) as ResearchEvidenceLifecycleEvent[];

  const documentIds = new Set<string>();
  const claimIds = new Set<string>();
  const clusterIds = new Set<string>();
  for (const row of rows) {
    documentIds.add(row.document_id);
    if (row.replacement_document_id) documentIds.add(row.replacement_document_id);
    if (row.promoted_primary_document_id) documentIds.add(row.promoted_primary_document_id);
    for (const id of row.orphaned_duplicate_document_ids ?? []) documentIds.add(id);
    for (const id of row.affected_claim_ids ?? []) claimIds.add(id);
    for (const id of row.affected_cluster_ids ?? []) clusterIds.add(id);
  }

  const [documentsRes, claimsRes, clustersRes] = await Promise.all([
    documentIds.size
      ? supabaseAdmin.from('research_documents').select('id, title').in('id', Array.from(documentIds))
      : Promise.resolve({ data: [], error: null }),
    claimIds.size
      ? supabaseAdmin.from('research_claims').select('id, subject_value, status').in('id', Array.from(claimIds))
      : Promise.resolve({ data: [], error: null }),
    clusterIds.size
      ? supabaseAdmin.from('research_evidence_clusters').select('id, label, status').in('id', Array.from(clusterIds))
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (documentsRes.error) return NextResponse.json({ error: documentsRes.error.message }, { status: 500 });
  if (claimsRes.error) return NextResponse.json({ error: claimsRes.error.message }, { status: 500 });
  if (clustersRes.error) return NextResponse.json({ error: clustersRes.error.message }, { status: 500 });

  const documentTitles = new Map((documentsRes.data ?? []).map((d) => [d.id, d.title as string | null]));
  const claimLabels = new Map((claimsRes.data ?? []).map((c) => [c.id, { label: c.subject_value as string, status: c.status as string }]));
  const clusterLabels = new Map((clustersRes.data ?? []).map((c) => [c.id, { label: c.label as string, status: c.status as string }]));

  const resolved = rows.map((row) => ({
    ...row,
    document_title: documentTitles.get(row.document_id) ?? null,
    replacement_document_title: row.replacement_document_id ? documentTitles.get(row.replacement_document_id) ?? null : null,
    promoted_primary_document_title: row.promoted_primary_document_id
      ? documentTitles.get(row.promoted_primary_document_id) ?? null
      : null,
    affected_claims: (row.affected_claim_ids ?? []).map((id) => ({ id, ...(claimLabels.get(id) ?? { label: id, status: 'unknown' }) })),
    affected_clusters: (row.affected_cluster_ids ?? []).map((id) => ({ id, ...(clusterLabels.get(id) ?? { label: id, status: 'unknown' }) })),
  }));

  return NextResponse.json({ events: resolved }, { status: 200 });
}
