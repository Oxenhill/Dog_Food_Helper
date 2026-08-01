import { NextRequest, NextResponse } from 'next/server';
import {
  ingestDiscoveryCandidate,
  ingestUploadedResearchPdf,
  RESEARCH_BRAIN_EMBEDDING_MODEL,
} from '@/lib/researchBrainPipeline';
import { resolveResearchCandidate } from '@/lib/researchDiscovery';
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

async function failJob(jobId: string, error: unknown): Promise<string> {
  const message = error instanceof Error ? error.message : 'Research processing failed';
  const completedAt = new Date().toISOString();
  await supabaseAdmin
    .from('research_ingestion_jobs')
    .update({
      status: 'failed',
      error_message: message,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq('id', jobId);
  return message;
}

async function completeJob(
  jobId: string,
  result: {
    documentId: string;
    chunkCount: number;
    duplicate: boolean;
    embedding: { inputTokens: number; estimatedCostUsd: number };
  }
) {
  const completedAt = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('research_ingestion_jobs')
    .update({
      status: 'succeeded',
      result_summary: {
        document_id: result.documentId,
        chunk_count: result.chunkCount,
        duplicate: result.duplicate,
        recommendation_runtime_model_calls: 0,
      },
      gateway_model: result.duplicate ? null : RESEARCH_BRAIN_EMBEDDING_MODEL,
      gateway_input_tokens: result.embedding.inputTokens,
      gateway_output_tokens: 0,
      gateway_cost_usd: result.embedding.estimatedCostUsd,
      completed_at: completedAt,
      updated_at: completedAt,
    })
    .eq('id', jobId)
    .select('*')
    .single();
  if (error) throw error;
  return data;
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
  return NextResponse.json({ jobs: data ?? [] });
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

    const { data: job, error: jobError } = await supabaseAdmin
      .from('research_ingestion_jobs')
      .insert({
        job_type: 'pdf_import',
        status: 'queued',
        requested_by: admin.id,
        input: { original_filename: originalFilename, title, topic, source_url: sourceUrl },
      })
      .select('*')
      .single();
    if (jobError || !job) {
      return NextResponse.json(
        { error: jobError?.message ?? 'Could not prepare upload' },
        { status: 500 }
      );
    }
    const storagePath = `${admin.id}/${job.id}.pdf`;
    const { data: upload, error: uploadError } = await supabaseAdmin.storage
      .from(BUCKET)
      .createSignedUploadUrl(storagePath, { upsert: false });
    if (uploadError || !upload) {
      await failJob(job.id, uploadError ?? new Error('Could not sign upload'));
      return NextResponse.json({ error: 'Could not prepare upload' }, { status: 500 });
    }
    await supabaseAdmin
      .from('research_ingestion_jobs')
      .update({
        input: { ...job.input, storage_path: storagePath },
        updated_at: new Date().toISOString(),
      })
      .eq('id', job.id);
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

    const startedAt = new Date().toISOString();
    await supabaseAdmin
      .from('research_ingestion_jobs')
      .update({ status: 'running', started_at: startedAt, updated_at: startedAt })
      .eq('id', job.id);
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
      });
      const completedJob = await completeJob(job.id, result);
      await supabaseAdmin.storage.from(BUCKET).remove([input.storage_path]);
      return NextResponse.json({ job: completedJob, result });
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
      try {
        candidate = await resolveResearchCandidate(identifier, topicKey);
      } catch (error) {
        return NextResponse.json(
          { error: error instanceof Error ? error.message : 'Could not resolve source' },
          { status: 400 }
        );
      }
      const { data: candidateRow, error: candidateError } = await supabaseAdmin
        .from('research_ingestion_jobs')
        .insert({
          job_type: 'url_import',
          status: 'queued',
          requested_by: admin.id,
          input: { identifier, topic_key: topicKey },
        })
        .select('*')
        .single();
      if (candidateError || !candidateRow) {
        return NextResponse.json({ error: 'Could not create import job' }, { status: 500 });
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
        await failJob(candidateRow.id, storedError ?? new Error('Could not store source'));
        return NextResponse.json({ error: 'Could not store source' }, { status: 500 });
      }
      candidateId = stored.id;
      body.processing_job_id = candidateRow.id;
    }

    let processingJobId =
      typeof body.processing_job_id === 'string' ? body.processing_job_id : '';
    if (!processingJobId) {
      const { data: job, error } = await supabaseAdmin
        .from('research_ingestion_jobs')
        .insert({
          job_type: 'url_import',
          status: 'queued',
          requested_by: admin.id,
          input: { candidate_id: candidateId, pmid: candidate.pmid },
        })
        .select('id')
        .single();
      if (error || !job) {
        return NextResponse.json({ error: 'Could not create import job' }, { status: 500 });
      }
      processingJobId = job.id;
    }

    const startedAt = new Date().toISOString();
    await supabaseAdmin
      .from('research_ingestion_jobs')
      .update({ status: 'running', started_at: startedAt, updated_at: startedAt })
      .eq('id', processingJobId);
    try {
      const result = await ingestDiscoveryCandidate({
        jobId: processingJobId,
        candidateId,
        candidate,
      });
      const completedJob = await completeJob(processingJobId, result);
      return NextResponse.json({ job: completedJob, result });
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
