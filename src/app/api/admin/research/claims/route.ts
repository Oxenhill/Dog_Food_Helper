import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { ResearchClaim, ResearchDocument } from '@/lib/types';

const CLAIM_FIELDS = [
  'id',
  'claim_identity',
  'document_id',
  'chunk_id',
  'supporting_quote',
  'subject_type',
  'subject_value',
  'applies_to_condition',
  'applies_to_life_stage',
  'direction',
  'effect_summary',
  'study_design',
  'species',
  'sample_size',
  'funding_independent',
  'is_preprint',
  'evidence_grade',
  'evidence_scope',
  'missing_grading_inputs',
  'grading_inputs_complete',
  'corroborating_claim_ids',
  'status',
  'reviewed_by',
  'reviewed_at',
  'review_note',
  'created_at',
  'updated_at',
].join(',');

const DOCUMENT_FIELDS = [
  'id',
  'title',
  'source_url',
  'doi',
  'journal',
  'publication_year',
  'study_design',
  'species',
  'sample_size',
  'funding_declaration',
  'competing_interests_declaration',
  'funding_independent',
  'grading_input_sources',
  'missing_grading_inputs',
  'grading_inputs_complete',
  'is_preprint',
  'open_access',
  'abstract_only',
  'retracted',
  'retraction_checked_at',
  'evidence_grade',
  'evidence_scope',
].join(',');

/**
 * Admin-only claim review queue. Metadata is returned from the source document
 * as well as the claim so the reviewer can see exactly what produced the
 * generated grade. Embedding vectors are never selected.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const requestedStatus = request.nextUrl.searchParams.get('status');
  let query = supabaseAdmin
    .from('research_claims')
    .select(CLAIM_FIELDS)
    .order('created_at', { ascending: false });

  if (requestedStatus && requestedStatus !== 'all') {
    query = query.eq('status', requestedStatus);
  }

  const [claimsRes, clusteredRes] = await Promise.all([
    query,
    supabaseAdmin.from('research_evidence_cluster_members').select('claim_id'),
  ]);
  if (claimsRes.error) {
    return NextResponse.json({ error: claimsRes.error.message }, { status: 500 });
  }
  if (clusteredRes.error) {
    return NextResponse.json({ error: clusteredRes.error.message }, { status: 500 });
  }

  // The project does not have generated Supabase Database types, so dynamic
  // column lists otherwise resolve to GenericStringError at build time.
  const clusteredClaimIds = new Set(
    (clusteredRes.data ?? []).map((member) => member.claim_id)
  );
  const claims = ((claimsRes.data ?? []) as unknown as ResearchClaim[]).filter(
    (claim) => !clusteredClaimIds.has(claim.id)
  );
  if (claims.length === 0) return NextResponse.json({ claims: [] });

  const documentIds = [...new Set(claims.map((claim) => claim.document_id))];
  const chunkIds = [...new Set(claims.map((claim) => claim.chunk_id))];
  const [documentsRes, chunksRes] = await Promise.all([
    supabaseAdmin.from('research_documents').select(DOCUMENT_FIELDS).in('id', documentIds),
    supabaseAdmin.from('research_chunks').select('id, content, chunk_index').in('id', chunkIds),
  ]);

  if (documentsRes.error) {
    return NextResponse.json({ error: documentsRes.error.message }, { status: 500 });
  }
  if (chunksRes.error) {
    return NextResponse.json({ error: chunksRes.error.message }, { status: 500 });
  }

  const documentRows = (documentsRes.data ?? []) as unknown as ResearchDocument[];
  const chunkRows = (chunksRes.data ?? []) as unknown as Array<{
    id: string;
    content: string;
    chunk_index: number;
  }>;
  const documents = new Map(documentRows.map((row) => [row.id, row]));
  const chunks = new Map(chunkRows.map((row) => [row.id, row]));

  return NextResponse.json({
    claims: claims.map((claim) => ({
      ...claim,
      document: documents.get(claim.document_id) ?? null,
      chunk: chunks.get(claim.chunk_id) ?? null,
    })),
  });
}
