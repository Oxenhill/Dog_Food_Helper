import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import {
  draftDocumentIntoKnowledge,
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
import {
  finishResearchMissionJob,
  startResearchMissionJob,
  type ResearchMissionJob,
} from '@/lib/researchMissionLifecycle';
import { isPersistedResearchProviderHalt } from '@/lib/researchProviderTelemetry';
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
    { data: automationSettings, error: automationSettingsError },
    { data: automationLog, error: automationLogError },
  ] = await Promise.all([
    supabaseAdmin
      .from('research_documents')
      .select(
        'id, title, source_url, pmid, topic, evidence_grade, grading_inputs_complete, access_type, review_status, retracted, superseded_by, duplicate_of_document_id, retrieved_at'
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
    supabaseAdmin.from('research_automation_settings').select('*').eq('id', true).maybeSingle(),
    supabaseAdmin
      .from('research_auto_activation_log')
      .select('id, cluster_id, decision, rule_version, explain, created_at')
      .order('created_at', { ascending: false })
      .limit(20),
  ]);
  if (documentsError) throw documentsError;
  if (claimsError) throw claimsError;
  if (clustersError) throw clustersError;
  if (automationSettingsError) throw automationSettingsError;
  if (automationLogError) throw automationLogError;

  /**
   * A document with zero claims is not necessarily untried -- drafting can
   * run, find nothing claim-worthy in the source, and correctly produce
   * zero claims (or fail outright for a scope reason). Without this, "Papers
   * awaiting structured processing" looked identical for a document nobody
   * has touched yet and one that's already been drafted (sometimes several
   * times) with a genuine null result, which reads as "the button doesn't
   * work" and invites spending another model call on the same outcome.
   */
  const { data: draftJobs, error: draftJobsError } = await supabaseAdmin
    .from('research_ingestion_jobs')
    .select('input, status, result_summary, completed_at')
    .eq('job_type', 'draft_claims')
    .order('completed_at', { ascending: true });
  if (draftJobsError) throw draftJobsError;
  const draftAttemptsByDocument = new Map<
    string,
    { attempts: number; lastStatus: string | null; lastRejectedCount: number | null }
  >();
  for (const job of draftJobs ?? []) {
    const documentId = (job.input as Record<string, unknown> | null)?.document_id;
    if (typeof documentId !== 'string') continue;
    const existing = draftAttemptsByDocument.get(documentId) ?? {
      attempts: 0,
      lastStatus: null,
      lastRejectedCount: null,
    };
    existing.attempts += 1;
    existing.lastStatus = job.status;
    const rejected = (job.result_summary as Record<string, unknown> | null)?.rejected;
    existing.lastRejectedCount = Array.isArray(rejected) ? rejected.length : null;
    draftAttemptsByDocument.set(documentId, existing);
  }

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

  const queuedClusterIds = (clusters ?? [])
    .filter((cluster) => cluster.status === 'draft' || cluster.status === 'queued_for_review')
    .map((cluster) => cluster.id);
  const [
    { data: eligibilityRows, error: eligibilityError },
    { count: activatedLast24h, error: activatedCountError },
  ] = await Promise.all([
    queuedClusterIds.length === 0
      ? Promise.resolve({ data: [], error: null })
      : supabaseAdmin.rpc('research_cluster_deterministic_eligibility_batch', {
          p_cluster_ids: queuedClusterIds,
        }),
    supabaseAdmin
      .from('research_auto_activation_log')
      .select('id', { count: 'exact', head: true })
      .eq('decision', 'activated')
      .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()),
  ]);
  if (eligibilityError) throw eligibilityError;
  if (activatedCountError) throw activatedCountError;
  const eligibilityByCluster = new Map(
    (eligibilityRows ?? []).map((row: { cluster_id: string; eligibility: unknown }) => [
      row.cluster_id,
      row.eligibility,
    ])
  );

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
    documents: (documents ?? []).map((document) => {
      const draftAttempts = draftAttemptsByDocument.get(document.id) ?? null;
      return {
        ...document,
        claims: claimsByDocument.get(document.id) ?? [],
        draft_attempts: draftAttempts?.attempts ?? 0,
        last_draft_status: draftAttempts?.lastStatus ?? null,
        last_draft_rejected_count: draftAttempts?.lastRejectedCount ?? null,
      };
    }),
    clusters: (clusters ?? []).map((cluster) => ({
      ...cluster,
      members: membersByCluster.get(cluster.id) ?? [],
      applicability: applicabilityByCluster.get(cluster.id) ?? [],
      auto_activation_eligibility: eligibilityByCluster.get(cluster.id) ?? null,
    })),
    automation: {
      settings: automationSettings,
      activated_last_24h: activatedLast24h ?? 0,
      recent_log: automationLog ?? [],
    },
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
    let job: ResearchMissionJob;
    try {
      job = await startResearchMissionJob({
        missionType: 'claim_drafting',
        objective: `Draft source-backed claims from research document ${documentId}`,
        stageKey: 'claim_drafting',
        jobType: 'draft_claims',
        requestedBy: admin.id,
        jobInput: { document_id: documentId },
        initialStatus: 'running',
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Could not start processing' },
        { status: 500 }
      );
    }
    try {
      const result = await draftDocumentIntoKnowledge(
        documentId,
        job.id,
        job.control_plane
      );
      const completed = await finishResearchMissionJob({
        jobId: job.id,
        status: 'succeeded',
        resultSummary: { ...result },
        eventPayload: {
          document_id: documentId,
          drafted_claim_count: result.drafted,
          rejected_draft_count: result.rejected.length,
        },
      });
      return NextResponse.json({ job: completed, result });
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : typeof error === 'object' && error && 'message' in error
            ? String(error.message)
            : 'Claim drafting failed';
      if (!isPersistedResearchProviderHalt(error)) {
        try {
          await finishResearchMissionJob({
            jobId: job.id,
            status: 'failed',
            reasonCode: 'claim_drafting_failed',
            errorMessage: message,
            eventPayload: { document_id: documentId },
          });
        } catch {
          // Preserve the drafting failure as the response if audit finalisation fails.
        }
      }
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

  if (action === 'set_automation_enabled') {
    if (typeof body.enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }
    const { data, error } = await supabaseAdmin
      .from('research_automation_settings')
      .update({ deterministic_auto_activation_enabled: body.enabled })
      .eq('id', true)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ settings: data });
  }

  if (action === 'set_automation_cap') {
    const cap = Number(body.daily_activation_cap);
    if (!Number.isInteger(cap) || cap <= 0) {
      return NextResponse.json(
        { error: 'daily_activation_cap must be a positive integer' },
        { status: 400 }
      );
    }
    const { data, error } = await supabaseAdmin
      .from('research_automation_settings')
      .update({ daily_activation_cap: cap })
      .eq('id', true)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ settings: data });
  }

  if (action === 'clear_automation_pause') {
    const { data, error } = await supabaseAdmin
      .from('research_automation_settings')
      .update({ paused: false, paused_reason: null, paused_at: null })
      .eq('id', true)
      .select()
      .maybeSingle();
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ settings: data });
  }

  if (action === 'run_automation_sweep') {
    const { data, error } = await supabaseAdmin.rpc('run_deterministic_auto_activation_sweep');
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    return NextResponse.json({ result: data });
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
