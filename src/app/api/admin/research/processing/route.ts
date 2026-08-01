import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  draftDocumentIntoKnowledge,
  RESEARCH_BRAIN_DRAFT_MODEL,
} from '@/lib/researchBrainDrafting';
import {
  RESEARCH_CONTEXT_TYPES,
  RESEARCH_DOCUMENT_FINDING_KEYS,
  RESEARCH_DIRECTIONS,
  RESEARCH_LIFE_STAGE_CONTEXTS,
  RESEARCH_NUTRIENT_SUBJECTS,
  RESEARCH_OUTCOME_TYPES,
  RESEARCH_PROCESSING_METHODS,
  researchClusterIdentity,
  researchClusterLabel,
  validateResearchClusterEdit,
  type ResearchClusterEdit,
} from '@/lib/researchEvidenceReview';
import { INGREDIENT_CATEGORIES } from '@/lib/ingredientCategories';
import { RESEARCH_BRAIN_EMBEDDING_MODEL } from '@/lib/researchBrainPipeline';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';
export const maxDuration = 300;

const ClusterEditSchema = z.object({
  cluster_id: z.string().uuid(),
  expected_updated_at: z.string().min(1),
  subject_type: z.enum([
    'ingredient',
    'nutrient',
    'ingredient_class',
    'processing_method',
    'biome_marker',
  ]),
  subject_value: z.string().min(1),
  outcome_type: z.enum(RESEARCH_OUTCOME_TYPES),
  outcome_value: z.string().min(1),
  direction: z.enum(RESEARCH_DIRECTIONS),
  cautious_summary: z.string().min(1),
  applicability: z.array(
    z.object({
      context_type: z.enum(RESEARCH_CONTEXT_TYPES),
      context_key: z.string().min(1),
      context_value: z.string().nullable(),
      match_operator: z.enum(['exact', 'enum']).default('exact'),
    })
  ).max(8),
});

async function listProcessingState() {
  const [
    { data: documents, error: documentsError },
    { data: claims, error: claimsError },
    { data: clusters, error: clustersError },
  ] = await Promise.all([
    supabaseAdmin
      .from('research_documents')
      .select(
        'id, title, source_url, pmid, topic, evidence_grade, grading_inputs_complete, access_type, review_status, retracted, superseded_by, retrieved_at'
      )
      .order('retrieved_at', { ascending: false })
      .limit(200),
    supabaseAdmin.from('research_claims').select(
      'id, document_id, status, supporting_quote, subject_type, subject_value, direction, effect_summary, evidence_grade, grading_inputs_complete'
    ),
    supabaseAdmin
      .from('research_evidence_clusters')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(100),
  ]);
  if (documentsError) throw documentsError;
  if (claimsError) throw claimsError;
  if (clustersError) throw clustersError;

  const clusterIds = (clusters ?? []).map((cluster) => cluster.id);
  const [{ data: members, error: membersError }, { data: applicability, error: applicabilityError }] =
    clusterIds.length === 0
      ? [{ data: [], error: null }, { data: [], error: null }]
      : await Promise.all([
          supabaseAdmin
            .from('research_evidence_cluster_members')
            .select('*')
            .in('cluster_id', clusterIds),
          supabaseAdmin
            .from('research_cluster_applicability')
            .select('*')
            .in('cluster_id', clusterIds),
        ]);
  if (membersError) throw membersError;
  if (applicabilityError) throw applicabilityError;

  const claimById = new Map((claims ?? []).map((claim) => [claim.id, claim]));
  const documentById = new Map(
    (documents ?? []).map((document) => [document.id, document])
  );
  const claimsByDocument = new Map<string, Array<Record<string, unknown>>>();
  for (const claim of claims ?? []) {
    const rows = claimsByDocument.get(claim.document_id) ?? [];
    rows.push(claim);
    claimsByDocument.set(claim.document_id, rows);
  }
  const membersByCluster = new Map<string, Array<Record<string, unknown>>>();
  for (const member of members ?? []) {
    const rows = membersByCluster.get(member.cluster_id) ?? [];
    const memberClaim = claimById.get(member.claim_id) ?? null;
    rows.push({
      ...member,
      claim: memberClaim,
      document: memberClaim
        ? documentById.get(memberClaim.document_id) ?? null
        : null,
    });
    membersByCluster.set(member.cluster_id, rows);
  }
  const applicabilityByCluster = new Map<string, Array<Record<string, unknown>>>();
  for (const context of applicability ?? []) {
    const rows = applicabilityByCluster.get(context.cluster_id) ?? [];
    rows.push(context);
    applicabilityByCluster.set(context.cluster_id, rows);
  }

  return {
    documents: (documents ?? []).map((document) => ({
      ...document,
      claims: claimsByDocument.get(document.id) ?? [],
    })),
    clusters: (clusters ?? []).map((cluster) => ({
      ...cluster,
      members: membersByCluster.get(cluster.id) ?? [],
      applicability: applicabilityByCluster.get(cluster.id) ?? [],
    })),
    review_options: {
      subject_types: [
        'ingredient',
        'nutrient',
        'ingredient_class',
        'processing_method',
      ],
      outcome_types: RESEARCH_OUTCOME_TYPES,
      directions: RESEARCH_DIRECTIONS,
      context_types: RESEARCH_CONTEXT_TYPES,
      nutrient_subjects: RESEARCH_NUTRIENT_SUBJECTS,
      processing_methods: Object.keys(RESEARCH_PROCESSING_METHODS),
      ingredient_classes: INGREDIENT_CATEGORIES.map(({ value, label }) => ({
        value,
        label,
      })),
      document_finding_keys: RESEARCH_DOCUMENT_FINDING_KEYS,
      life_stages: RESEARCH_LIFE_STAGE_CONTEXTS,
    },
  };
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  try {
    return NextResponse.json(await listProcessingState());
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Could not load processing state' },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }
  const action = typeof body.action === 'string' ? body.action : '';

  if (action === 'draft_document') {
    const documentId = typeof body.document_id === 'string' ? body.document_id : '';
    if (!documentId) {
      return NextResponse.json({ error: 'document_id is required' }, { status: 400 });
    }
    const { data: job, error: jobError } = await supabaseAdmin
      .from('research_ingestion_jobs')
      .insert({
        job_type: 'draft_claims',
        status: 'running',
        requested_by: admin.id,
        input: { document_id: documentId },
        gateway_model: `${RESEARCH_BRAIN_DRAFT_MODEL} + ${RESEARCH_BRAIN_EMBEDDING_MODEL}`,
        started_at: new Date().toISOString(),
      })
      .select('*')
      .single();
    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message ?? 'Could not start processing' },
        { status: 500 }
      );
    }
    try {
      const result = await draftDocumentIntoKnowledge(documentId, job.id);
      const completedAt = new Date().toISOString();
      const { data: completed, error: completeError } = await supabaseAdmin
        .from('research_ingestion_jobs')
        .update({
          status: 'succeeded',
          result_summary: result,
          gateway_input_tokens:
            result.usage.inputTokens + result.embedding.inputTokens,
          gateway_output_tokens: result.usage.outputTokens,
          gateway_cost_usd: null,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq('id', job.id)
        .select('*')
        .single();
      if (completeError) throw completeError;
      return NextResponse.json({ job: completed, result });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String(error.message)
            : 'Claim drafting failed';
      const completedAt = new Date().toISOString();
      await supabaseAdmin
        .from('research_ingestion_jobs')
        .update({
          status: 'failed',
          error_message: message,
          completed_at: completedAt,
          updated_at: completedAt,
        })
        .eq('id', job.id);
      return NextResponse.json({ error: message, job_id: job.id }, { status: 500 });
    }
  }

  if (action === 'approve_cluster' || action === 'reject_cluster') {
    const clusterId = typeof body.cluster_id === 'string' ? body.cluster_id : '';
    const reviewNote =
      typeof body.review_note === 'string' && body.review_note.trim()
        ? body.review_note.trim()
        : null;
    if (!clusterId) {
      return NextResponse.json({ error: 'cluster_id is required' }, { status: 400 });
    }
    if (action === 'reject_cluster' && !reviewNote) {
      return NextResponse.json({ error: 'A rejection note is required' }, { status: 400 });
    }
    if (action === 'approve_cluster') {
      const [
        { data: cluster, error: clusterError },
        { data: applicability, error: applicabilityError },
      ] = await Promise.all([
        supabaseAdmin
          .from('research_evidence_clusters')
          .select('*')
          .eq('id', clusterId)
          .maybeSingle(),
        supabaseAdmin
          .from('research_cluster_applicability')
          .select('context_type, context_key, context_value, match_operator')
          .eq('cluster_id', clusterId),
      ]);
      if (clusterError || !cluster) {
        return NextResponse.json(
          { error: clusterError?.message ?? 'Evidence cluster not found' },
          { status: clusterError ? 500 : 404 }
        );
      }
      if (applicabilityError) {
        return NextResponse.json({ error: applicabilityError.message }, { status: 500 });
      }
      const validationErrors = validateResearchClusterEdit({
        subject_type: cluster.subject_type,
        subject_value: cluster.subject_value,
        outcome_type: cluster.outcome_type,
        outcome_value: cluster.outcome_value,
        direction: cluster.direction,
        cautious_summary: cluster.cautious_summary,
        applicability: (applicability ?? []) as ResearchClusterEdit['applicability'],
      });
      if (validationErrors.length > 0) {
        return NextResponse.json(
          {
            error: `Cluster cannot be approved: ${validationErrors.join(' ')}`,
            details: validationErrors,
          },
          { status: 400 }
        );
      }
    }
    const { data, error } = await supabaseAdmin.rpc(
      'review_research_evidence_cluster',
      {
        p_cluster_id: clusterId,
        p_action: action === 'approve_cluster' ? 'approve' : 'reject',
        p_reviewer_id: admin.id,
        p_review_note: reviewNote,
      }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ cluster: data });
  }

  if (action === 'edit_cluster') {
    const parsed = ClusterEditSchema.safeParse(body);
    if (!parsed.success) {
      const details = parsed.error.issues.map((issue) => issue.message);
      return NextResponse.json(
        {
          error: `Cluster edit is invalid: ${details.join(' ')}`,
          details,
        },
        { status: 400 }
      );
    }
    const edit: ResearchClusterEdit = {
      subject_type: parsed.data.subject_type,
      subject_value: parsed.data.subject_value.trim(),
      outcome_type: parsed.data.outcome_type,
      outcome_value: parsed.data.outcome_value.trim(),
      direction: parsed.data.direction,
      cautious_summary: parsed.data.cautious_summary.trim(),
      applicability: parsed.data.applicability.map((context) => ({
        context_type: context.context_type,
        context_key: context.context_key.trim(),
        context_value: context.context_value?.trim() || null,
        match_operator: context.match_operator,
      })),
    };
    const validationErrors = validateResearchClusterEdit(edit);
    if (validationErrors.length > 0) {
      return NextResponse.json(
        { error: validationErrors.join(' ') },
        { status: 400 }
      );
    }
    const { data, error } = await supabaseAdmin.rpc(
      'edit_research_evidence_cluster',
      {
        p_cluster_id: parsed.data.cluster_id,
        p_expected_updated_at: parsed.data.expected_updated_at,
        p_editor_id: admin.id,
        p_cluster_identity: researchClusterIdentity(edit),
        p_label: researchClusterLabel(edit),
        p_subject_type: edit.subject_type,
        p_subject_value: edit.subject_value,
        p_outcome_type: edit.outcome_type,
        p_outcome_value: edit.outcome_value,
        p_direction: edit.direction,
        p_cautious_summary: edit.cautious_summary,
        p_contexts: edit.applicability,
      }
    );
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ cluster: data });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
