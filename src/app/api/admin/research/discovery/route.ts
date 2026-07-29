import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import {
  discoverResearchCandidates,
  uniqueCandidates,
} from '@/lib/researchDiscovery';
import { estimateResearchCosts } from '@/lib/researchCost';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const requestedJobId = request.nextUrl.searchParams.get('job_id');
  const jobsQuery = supabaseAdmin
    .from('research_ingestion_jobs')
    .select('*')
    .eq('job_type', 'discovery')
    .order('created_at', { ascending: false })
    .limit(10);
  const { data: jobs, error: jobsError } = requestedJobId
    ? await jobsQuery.eq('id', requestedJobId)
    : await jobsQuery;
  if (jobsError) {
    return NextResponse.json({ error: jobsError.message }, { status: 500 });
  }

  const jobId = requestedJobId ?? jobs?.[0]?.id;
  const { data: candidates, error: candidateError } = jobId
    ? await supabaseAdmin
        .from('research_discovery_candidates')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true })
    : { data: [], error: null };
  if (candidateError) {
    return NextResponse.json({ error: candidateError.message }, { status: 500 });
  }

  return NextResponse.json({ jobs: jobs ?? [], candidates: candidates ?? [] });
}

/**
 * Run a bounded PubMed/Europe PMC discovery scan and persist its structured
 * candidates for an explicit import decision. Discovery itself has no model
 * or embedding cost.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Empty body uses conservative defaults.
  }

  const candidatesPerTopic =
    typeof body.candidates_per_topic === 'number' ? body.candidates_per_topic : 2;
  const topicKeys = Array.isArray(body.topic_keys)
    ? body.topic_keys.filter((value): value is string => typeof value === 'string')
    : undefined;
  const documentCap =
    typeof body.document_cap === 'number' ? Math.max(1, Math.floor(body.document_cap)) : 30;

  const { data: job, error: jobError } = await supabaseAdmin
    .from('research_ingestion_jobs')
    .insert({
      job_type: 'discovery',
      status: 'running',
      requested_by: admin.id,
      input: {
        candidates_per_topic: candidatesPerTopic,
        topic_keys: topicKeys ?? null,
        document_cap: documentCap,
      },
      started_at: new Date().toISOString(),
    })
    .select('*')
    .single();
  if (jobError || !job) {
    return NextResponse.json(
      { error: jobError?.message ?? 'Could not start discovery' },
      { status: 500 }
    );
  }

  try {
    const run = await discoverResearchCandidates({
      candidatesPerTopic,
      topicKeys,
      concurrency: 3,
    });
    const costEstimate = estimateResearchCosts(run, documentCap);
    const candidates = uniqueCandidates(run).slice(0, documentCap);

    const { data: existingDocuments, error: existingError } = await supabaseAdmin
      .from('research_documents')
      .select('id, source_id, doi');
    if (existingError) throw existingError;
    const bySourceId = new Map(
      (existingDocuments ?? [])
        .filter((row) => row.source_id)
        .map((row) => [row.source_id, row.id])
    );
    const byDoi = new Map(
      (existingDocuments ?? [])
        .filter((row) => row.doi)
        .map((row) => [row.doi.toLowerCase(), row.id])
    );

    const { data: storedCandidates, error: candidateError } = await supabaseAdmin
      .from('research_discovery_candidates')
      .insert(
        candidates.map((candidate) => ({
          job_id: job.id,
          source_name: candidate.source_name,
          source_id: candidate.source_id,
          pmid: candidate.pmid,
          doi: candidate.doi,
          title: candidate.title,
          candidate,
          imported_document_id:
            bySourceId.get(candidate.source_id) ??
            (candidate.doi ? byDoi.get(candidate.doi.toLowerCase()) : null) ??
            null,
        }))
      )
      .select('*');
    if (candidateError) throw candidateError;

    const completedAt = new Date().toISOString();
    const { data: completedJob, error: completionError } = await supabaseAdmin
      .from('research_ingestion_jobs')
      .update({
        status: candidates.length > 0 ? 'awaiting_selection' : 'succeeded',
        result_summary: {
          unique_candidate_count: run.unique_candidate_count,
          stored_candidate_count: candidates.length,
          duplicate_candidate_count: run.duplicate_candidate_count,
          already_imported_count: storedCandidates?.filter(
            (candidate) => candidate.imported_document_id
          ).length ?? 0,
          discovery_model_calls: 0,
          discovery_embedding_calls: 0,
          future_import_cost_estimate: costEstimate,
        },
        completed_at: completedAt,
        updated_at: completedAt,
      })
      .eq('id', job.id)
      .select('*')
      .single();
    if (completionError) throw completionError;

    return NextResponse.json({
      job: completedJob,
      candidates: storedCandidates ?? [],
      model_calls_performed: false,
      embedding_calls_performed: false,
      run_summary: {
        generated_at: run.generated_at,
        topic_count: run.topic_count,
        unique_candidate_count: run.unique_candidate_count,
        duplicate_candidate_count: run.duplicate_candidate_count,
        grade_counts: run.grade_counts,
        access_counts: run.access_counts,
        completeness_counts: run.completeness_counts,
      },
      import_cost_estimate: costEstimate,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discovery failed';
    const failedAt = new Date().toISOString();
    await supabaseAdmin
      .from('research_ingestion_jobs')
      .update({
        status: 'failed',
        error_message: message,
        completed_at: failedAt,
        updated_at: failedAt,
      })
      .eq('id', job.id);
    return NextResponse.json({ error: message, job_id: job.id }, { status: 500 });
  }
}
