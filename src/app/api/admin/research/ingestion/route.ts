import { NextRequest, NextResponse } from 'next/server';
import {
  ingestDiscoveryCandidate,
  ingestUploadedResearchPdf,
} from '@/lib/researchBrainPipeline';
import { draftDocumentIntoKnowledge, type DraftDocumentResult } from '@/lib/researchBrainDrafting';
import { resolveResearchCandidate } from '@/lib/researchDiscovery';
import { loadLiteratureRegistrySnapshot } from '@/lib/researchLiteratureSources';
import {
  appendResearchMissionJobEvent,
  finishResearchMissionJob,
  markResearchMissionJobRunning,
  startResearchMissionJob,
  type ResearchMissionJob,
} from '@/lib/researchMissionLifecycle';
import { isPersistedResearchProviderHalt } from '@/lib/researchProviderTelemetry';
import type { ResearchStageControlPlaneSnapshot } from '@/lib/researchModelRouting';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import type { ResearchCandidate } from '@/lib/researchEvidence';
import type { ResearchTopic } from '@/lib/types';

export const runtime = 'nodejs';
export const maxDuration = 300;

const BUCKET = 'research-ingestion';
const MAX_PDF_BYTES = 20 * 1024 * 1024;
const TOPICS = new Set<ResearchTopic>([
  'gut_biome',
  'allergy',
  'health_condition',
  'general',
]);

async function failJob(
  jobId: string,
  error: unknown,
  reasonCode = 'document_ingestion_failed'
): Promise<string> {
  const message = error instanceof Error ? error.message : 'Research processing failed';
  if (isPersistedResearchProviderHalt(error)) return message;
  try {
    await finishResearchMissionJob({
      jobId,
      status: 'failed',
      reasonCode,
      errorMessage: message,
    });
  } catch {
    // Preserve the processing failure as the response if audit finalisation fails.
  }
  return message;
}

async function completeJob(
  job: ResearchMissionJob,
  result: {
    documentId: string;
    chunkCount: number;
    duplicate: boolean;
    embedding: {
      providerReportedInputTokens: number | null;
      estimatedInputTokens: number;
      estimatedCostUsd: number;
    };
    discardedChunkCount?: number;
  }
) {
  return finishResearchMissionJob({
    jobId: job.id,
    status: 'succeeded',
    resultSummary: {
        document_id: result.documentId,
        chunk_count: result.chunkCount,
        duplicate: result.duplicate,
        discarded_chunk_count: result.discardedChunkCount ?? 0,
        recommendation_runtime_model_calls: 0,
    },
    eventPayload: {
      document_id: result.documentId,
      chunk_count: result.chunkCount,
      duplicate: result.duplicate,
      discarded_chunk_count: result.discardedChunkCount ?? 0,
    },
  });
}

type AutoDraftOutcome =
  | ({ attempted: true; job_id: string } & DraftDocumentResult)
  | { attempted: false; reason: 'duplicate_document' | 'methodology_context_only' }
  | { attempted: true; job_id: string; error: string };

/**
 * Ingesting a document (uploading a PDF, importing a discovered/URL
 * candidate) is already the deliberate human action -- an admin chose this
 * exact source and clicked import. Requiring a second, separate click
 * afterward just to draft claims from it added pure toil with no additional
 * safety: drafting only proposes claims into queued_for_review clusters,
 * which still require the same human cluster-approval step before anything
 * becomes usable evidence (see review_research_evidence_cluster). So this
 * runs automatically right after ingestion succeeds, for exactly the
 * documents that were just deliberately imported -- it is NOT wired into the
 * monthly discovery cron, which only ever surfaces unimported candidates and
 * still requires an explicit per-candidate Import click before anything is
 * ingested or drafted.
 *
 * Never throws: an ingestion that just succeeded should never be turned
 * into an error response by a drafting failure. The existing "Draft
 * structured evidence" button on the Review queue page remains as a manual
 * retry path if this fails or is skipped (duplicate documents skip it,
 * since claims already exist for the original).
 */
async function autoDraftDocument(
  documentId: string,
  adminId: string,
  controlPlane: ResearchStageControlPlaneSnapshot
): Promise<AutoDraftOutcome> {
  let job: ResearchMissionJob;
  try {
    job = await startResearchMissionJob({
      missionType: 'claim_drafting',
      objective: `Draft source-backed claims from newly ingested document ${documentId}`,
      stageKey: 'claim_drafting',
      jobType: 'draft_claims',
      requestedBy: adminId,
      jobInput: { document_id: documentId, source: 'auto_after_ingestion' },
      initialStatus: 'running',
    });
  } catch (error) {
    return {
      attempted: true,
      job_id: '',
      error: error instanceof Error ? error.message : 'Could not start claim drafting',
    };
  }
  try {
    const result = await draftDocumentIntoKnowledge(documentId, job.id, controlPlane);
    await finishResearchMissionJob({
      jobId: job.id,
      status: 'succeeded',
      resultSummary: { ...result },
      eventPayload: {
        document_id: documentId,
        drafted_claim_count: result.drafted,
        rejected_draft_count: result.rejected.length,
      },
    });
    return { attempted: true, job_id: job.id, ...result };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Claim drafting failed';
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
    return { attempted: true, job_id: job.id, error: message };
  }
}

/**
 * A raw job_type/status pair tells an operator nothing about which paper it
 * was -- pdf_import/url_import jobs carry a title/filename in `input`, but
 * draft_claims jobs only carry a document_id, and none of them carry a
 * document title for cross-referencing. Resolve a human label for every job
 * so "Recent processing jobs" is actually useful for figuring out what
 * happened to a specific upload, not just a wall of identical-looking rows.
 */
async function attachJobLabels(
  jobs: Array<{ input: Record<string, unknown> | null; result_summary: Record<string, unknown> | null }>
): Promise<Array<{ label: string | null }>> {
  const documentIds = new Set<string>();
  for (const job of jobs) {
    const inputDocId = job.input?.document_id;
    if (typeof inputDocId === 'string') documentIds.add(inputDocId);
    const resultDocId = job.result_summary?.document_id;
    if (typeof resultDocId === 'string') documentIds.add(resultDocId);
  }
  const titleById = new Map<string, string | null>();
  if (documentIds.size > 0) {
    const { data } = await supabaseAdmin
      .from('research_documents')
      .select('id, title')
      .in('id', Array.from(documentIds));
    for (const row of data ?? []) {
      titleById.set(row.id as string, (row.title as string | null) ?? null);
    }
  }
  return jobs.map((job) => {
    const input = job.input ?? {};
    const title = typeof input.title === 'string' ? input.title : null;
    const originalFilename = typeof input.original_filename === 'string' ? input.original_filename : null;
    const identifier = typeof input.identifier === 'string' ? input.identifier : null;
    const inputDocId = typeof input.document_id === 'string' ? input.document_id : null;
    const resultSummaryDocId = job.result_summary?.document_id;
    const resultDocId = typeof resultSummaryDocId === 'string' ? resultSummaryDocId : null;
    const documentTitle = titleById.get(inputDocId ?? resultDocId ?? '') ?? null;
    return { label: title ?? documentTitle ?? originalFilename ?? identifier ?? null };
  });
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  const { data, error } = await supabaseAdmin
    .from('research_ingestion_jobs')
    .select('*')
    .neq('job_type', 'discovery')
    .order('created_at', { ascending: false })
    .limit(20);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  const jobs = data ?? [];
  const labels = await attachJobLabels(jobs);
  return NextResponse.json({
    jobs: jobs.map((job, index) => ({ ...job, label: labels[index].label })),
  });
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
  if (action === 'prepare_pdf') {
    const originalFilename =
      typeof body.original_filename === 'string' ? body.original_filename.trim() : '';
    const title = typeof body.title === 'string' ? body.title.trim() : '';
    const topic = typeof body.topic === 'string' ? body.topic as ResearchTopic : null;
    const fileSize = typeof body.file_size === 'number' ? body.file_size : 0;
    const sourceUrl =
      typeof body.source_url === 'string' && body.source_url.trim()
        ? body.source_url.trim()
        : null;
    if (!title) return NextResponse.json({ error: 'Title is required' }, { status: 400 });
    if (!topic || !TOPICS.has(topic)) {
      return NextResponse.json({ error: 'Valid topic is required' }, { status: 400 });
    }
    if (!originalFilename.toLowerCase().endsWith('.pdf')) {
      return NextResponse.json({ error: 'A PDF filename is required' }, { status: 400 });
    }
    if (!Number.isSafeInteger(fileSize) || fileSize <= 0 || fileSize > MAX_PDF_BYTES) {
      return NextResponse.json(
        { error: fileSize > MAX_PDF_BYTES ? 'PDF exceeds 20MB' : 'PDF is empty' },
        { status: fileSize > MAX_PDF_BYTES ? 413 : 400 }
      );
    }

    let job: ResearchMissionJob;
    try {
      job = await startResearchMissionJob({
        missionType: 'document_processing',
        objective: `Ingest owner-uploaded research PDF: ${title}`,
        stageKey: 'document_ingestion',
        jobType: 'pdf_import',
        requestedBy: admin.id,
        jobInput: { original_filename: originalFilename, title, topic, source_url: sourceUrl },
        initialStatus: 'queued',
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Could not prepare upload' },
        { status: 500 }
      );
    }
    const storagePath = `${admin.id}/${job.id}.pdf`;
    const { data: upload, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (uploadError || !upload) {
      await failJob(
        job.id,
        uploadError ?? new Error('Could not sign upload'),
        'pdf_upload_prepare_failed'
      );
      return NextResponse.json({ error: 'Could not prepare upload' }, { status: 500 });
    }
    const { error: inputUpdateError } = await supabaseAdmin
      .from('research_ingestion_jobs')
      .update({
        input: { ...job.input, storage_path: storagePath },
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
    if (inputUpdateError) {
      await failJob(job.id, inputUpdateError, 'pdf_upload_prepare_failed');
      return NextResponse.json({ error: 'Could not prepare upload' }, { status: 500 });
    }
    try {
      await appendResearchMissionJobEvent(job.id, 'document.upload_prepared', {
        storage_path: storagePath,
        file_size: fileSize,
      });
    } catch (error) {
      await failJob(job.id, error, 'audit_event_append_failed');
      return NextResponse.json({ error: 'Could not record prepared upload' }, { status: 500 });
    }
    return NextResponse.json({
      job_id: job.id,
      storage_path: storagePath,
      upload_token: upload.token,
    });
  }

  if (action === 'finalize_pdf') {
    const jobId = typeof body.job_id === 'string' ? body.job_id : '';
    const { data: job, error: jobError } = await supabaseAdmin
      .from('research_ingestion_jobs')
      .select('*')
      .eq('id', jobId)
      .eq('requested_by', admin.id)
      .eq('job_type', 'pdf_import')
      .maybeSingle();
    if (jobError || !job) {
      return NextResponse.json({ error: 'Upload job not found' }, { status: 404 });
    }
    if (job.status === 'succeeded') return NextResponse.json({ job });
    const input = job.input as {
      storage_path?: string;
      original_filename?: string;
      title?: string;
      topic?: ResearchTopic;
      source_url?: string | null;
    };
    if (!input.storage_path || !input.title || !input.topic) {
      return NextResponse.json({ error: 'Upload job is incomplete' }, { status: 400 });
    }

    let runningJob: ResearchMissionJob;
    try {
      runningJob = await markResearchMissionJobRunning(job.id, {
        source_type: 'owner_uploaded_pdf',
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Could not start PDF ingestion' },
        { status: 500 }
      );
    }
    try {
      const { data: file, error: downloadError } = await supabaseAdmin.storage
        .from(BUCKET)
        .download(input.storage_path);
      if (downloadError || !file) throw downloadError ?? new Error('Uploaded PDF not found');
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (bytes.length > MAX_PDF_BYTES) throw new Error('PDF exceeds 20MB');
      if (Buffer.from(bytes.subarray(0, 5)).toString('ascii') !== '%PDF-') {
        throw new Error('Uploaded file is not a valid PDF');
      }
      // Avoid loading the PDF worker/runtime for job listing and structured-source
      // imports. Only uploaded-PDF finalisation needs this serverless dependency.
      const { extractPdfText } = await import('@/lib/pdfText');
      const extracted = await extractPdfText(bytes);
      if (!extracted.text.trim()) {
        throw new Error('No text could be extracted from this PDF');
      }
      const result = await ingestUploadedResearchPdf({
        jobId: job.id,
        topic: input.topic,
        title: input.title,
        sourceUrl: input.source_url ?? null,
        originalFilename: input.original_filename ?? 'research.pdf',
        text: extracted.text,
        controlPlane: runningJob.control_plane,
      });
      const completedJob = await completeJob(runningJob, result);
      await supabaseAdmin.storage.from(BUCKET).remove([input.storage_path]);
      const drafting = result.duplicate
        ? ({ attempted: false, reason: 'duplicate_document' } as const)
        : await autoDraftDocument(result.documentId, admin.id, runningJob.control_plane);
      return NextResponse.json({ job: completedJob, result, drafting });
    } catch (error) {
      const message = await failJob(job.id, error);
      return NextResponse.json({ error: message, job_id: job.id }, { status: 500 });
    }
  }

  if (action === 'import_candidate' || action === 'import_url') {
    let candidate: ResearchCandidate;
    let candidateId: string;
    if (action === 'import_candidate') {
      candidateId = typeof body.candidate_id === 'string' ? body.candidate_id : '';
      const { data, error } = await supabaseAdmin
        .from('research_discovery_candidates')
        .select('*')
        .eq('id', candidateId)
        .maybeSingle();
      if (error || !data) {
        return NextResponse.json({ error: 'Candidate not found' }, { status: 404 });
      }
      if (data.imported_document_id) {
        return NextResponse.json({
          already_imported: true,
          document_id: data.imported_document_id,
        });
      }
      candidate = data.candidate as ResearchCandidate;
    } else {
      const identifier = typeof body.url === 'string' ? body.url.trim() : '';
      const topicKey = typeof body.topic_key === 'string' ? body.topic_key : '';
      let candidateRow: ResearchMissionJob;
      try {
        candidateRow = await startResearchMissionJob({
          missionType: 'source_import',
          objective: `Resolve and ingest approved research source: ${identifier}`,
          stageKey: 'document_ingestion',
          jobType: 'url_import',
          requestedBy: admin.id,
          jobInput: { identifier, topic_key: topicKey },
          initialStatus: 'queued',
        });
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Could not create import job' },
          { status: 500 }
        );
      }
      try {
        const literatureRegistry = await loadLiteratureRegistrySnapshot(
          candidateRow.control_plane.literature_registry_version_id
        );
        candidate = await resolveResearchCandidate(
          identifier,
          topicKey,
          fetch,
          literatureRegistry
        );
      } catch (error) {
        await failJob(candidateRow.id, error, 'source_resolution_failed');
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Could not resolve source' },
          { status: 400 }
        );
      }
      const { data: stored, error: storedError } = await supabaseAdmin
        .from('research_discovery_candidates')
        .insert({
          job_id: candidateRow.id,
          source_name: candidate.source_name,
          source_id: candidate.source_id,
          pmid: candidate.pmid,
          doi: candidate.doi,
          title: candidate.title,
          candidate,
          selected: true,
        })
        .select('id')
        .single();
      if (storedError || !stored) {
        await failJob(
          candidateRow.id,
          storedError ?? new Error('Could not store source'),
          'source_candidate_persist_failed'
        );
        return NextResponse.json({ error: 'Could not store source' }, { status: 500 });
      }
      candidateId = stored.id;
      body.processing_job_id = candidateRow.id;
    }

    let processingJobId =
      typeof body.processing_job_id === 'string' ? body.processing_job_id : '';
    if (!processingJobId) {
      try {
        const job = await startResearchMissionJob({
          missionType: 'source_import',
          objective: `Ingest selected research candidate: ${candidate.title}`,
          stageKey: 'document_ingestion',
          jobType: 'url_import',
          requestedBy: admin.id,
          jobInput: { candidate_id: candidateId, pmid: candidate.pmid },
          initialStatus: 'queued',
        });
        processingJobId = job.id;
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Could not create import job' },
          { status: 500 }
        );
      }
    }

    let runningJob: ResearchMissionJob;
    try {
      runningJob = await markResearchMissionJobRunning(processingJobId, {
        candidate_id: candidateId,
        source_name: candidate.source_name,
      });
    } catch (error) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Could not start source ingestion' },
        { status: 500 }
      );
    }
    try {
      const literatureRegistry = await loadLiteratureRegistrySnapshot(
        runningJob.control_plane.literature_registry_version_id
      );
      const result = await ingestDiscoveryCandidate({
        jobId: processingJobId,
        candidateId,
        candidate,
        controlPlane: runningJob.control_plane,
        literatureRegistry,
      });
      const completedJob = await completeJob(runningJob, result);
      const drafting = result.duplicate
        ? ({ attempted: false, reason: 'duplicate_document' } as const)
        : candidate.evidence_scope !== 'canine_direct'
          ? ({ attempted: false, reason: 'methodology_context_only' } as const)
          : await autoDraftDocument(result.documentId, admin.id, runningJob.control_plane);
      return NextResponse.json({ job: completedJob, result, drafting });
    } catch (error) {
      const message = await failJob(processingJobId, error);
      return NextResponse.json(
        { error: message, job_id: processingJobId },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ error: 'Unsupported action' }, { status: 400 });
}
