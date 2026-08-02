import { NextRequest, NextResponse } from 'next/server';
import { assembleResearchGraph } from '@/lib/researchGraphReadModel';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

/**
 * Admin-only read model for the P3 research_graph_* views (P4: admin graph
 * explorer). Those views revoke anon/authenticated entirely and grant
 * service_role SELECT only, so this route -- gated by requireAdmin, querying
 * with the service-role client -- is the sole path a browser can reach them
 * through. Read-only: no action here approves, edits, or publishes anything.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const [
    documents,
    claims,
    clusters,
    conceptNodes,
    edgesDerivedFrom,
    edgesMemberOf,
    edgesDirection,
    edgesConcerns,
    edgesAppliesTo,
    edgesSameStudyFamily,
    edgesSupersedes,
    edgesRetractedBy,
    clusterMembersRaw,
  ] = await Promise.all([
    supabaseAdmin.from('research_graph_documents').select('*'),
    supabaseAdmin.from('research_graph_claims').select('*'),
    supabaseAdmin.from('research_graph_clusters').select('*'),
    supabaseAdmin.from('research_graph_concept_nodes').select('*'),
    supabaseAdmin.from('research_graph_edges_derived_from').select('*'),
    supabaseAdmin.from('research_graph_edges_member_of').select('*'),
    supabaseAdmin.from('research_graph_edges_direction').select('*'),
    supabaseAdmin.from('research_graph_edges_concerns').select('*'),
    supabaseAdmin.from('research_graph_edges_applies_to').select('*'),
    supabaseAdmin.from('research_graph_edges_same_study_family').select('*'),
    supabaseAdmin.from('research_graph_edges_supersedes').select('*'),
    supabaseAdmin.from('research_graph_edges_retracted_by').select('*'),
    supabaseAdmin.from('research_evidence_cluster_members').select('cluster_id, claim_id, semantic_similarity'),
  ]);

  const failed = [
    documents,
    claims,
    clusters,
    conceptNodes,
    edgesDerivedFrom,
    edgesMemberOf,
    edgesDirection,
    edgesConcerns,
    edgesAppliesTo,
    edgesSameStudyFamily,
    edgesSupersedes,
    edgesRetractedBy,
    clusterMembersRaw,
  ].find((result) => result.error);
  if (failed?.error) {
    return NextResponse.json({ error: failed.error.message }, { status: 500 });
  }

  const graph = assembleResearchGraph({
    documents: documents.data ?? [],
    claims: claims.data ?? [],
    clusters: clusters.data ?? [],
    conceptNodes: conceptNodes.data ?? [],
    edgesDerivedFrom: edgesDerivedFrom.data ?? [],
    edgesMemberOf: edgesMemberOf.data ?? [],
    edgesDirection: edgesDirection.data ?? [],
    edgesConcerns: edgesConcerns.data ?? [],
    edgesAppliesTo: edgesAppliesTo.data ?? [],
    edgesSameStudyFamily: edgesSameStudyFamily.data ?? [],
    edgesSupersedes: edgesSupersedes.data ?? [],
    edgesRetractedBy: edgesRetractedBy.data ?? [],
    clusterMembersRaw: clusterMembersRaw.data ?? [],
  });

  return NextResponse.json(graph, { headers: { 'Cache-Control': 'private, no-store' } });
}
