import {
  discoverResearchCandidates,
  uniqueCandidates,
  type DiscoveryRunResult,
} from './researchDiscovery';
import { estimateResearchCosts } from './researchCost';
import { loadLiteratureRegistrySnapshot } from './researchLiteratureSources';
import {
  finishResearchMissionJob,
  startResearchMissionJob,
  type ResearchMissionJob,
  type ResearchMissionRequesterActorType,
} from './researchMissionLifecycle';
import { supabaseAdmin } from './supabase';

export interface RunDiscoveryMissionInput {
  requestedBy: string | null;
  requestedByActorType: ResearchMissionRequesterActorType;
  candidatesPerTopic?: number;
  topicKeys?: string[];
  documentCap?: number;
  idempotencyKey?: string | null;
}

export interface RunDiscoveryMissionResult {
  job: ResearchMissionJob;
  candidates: Record<string, unknown>[];
  model_calls_performed: false;
  embedding_calls_performed: false;
  run_summary: {
    generated_at: string;
    topic_count: number;
    unique_candidate_count: number;
    duplicate_candidate_count: number;
    grade_counts: Record<string, number>;
    access_counts: DiscoveryRunResult['access_counts'];
    completeness_counts: DiscoveryRunResult['completeness_counts'];
  };
  import_cost_estimate: ReturnType<typeof estimateResearchCosts>;
  /**
   * True when every discovery topic failed (a per-topic acquisition/policy
   * error, not "zero new candidates found"). A human clicking "run discovery"
   * can see this in the response; an unattended scheduled run cannot, so the
   * caller uses this flag to decide whether to raise a visible alert.
   */
  all_topics_blocked: boolean;
}

/**
 * Runs one discovery mission end to end: starts the mission via the shared
 * lifecycle RPC, executes the bounded PubMed/Europe PMC scan, and persists
 * candidates. Used identically by the admin-triggered manual route
 * (`requestedByActorType: 'owner'`) and the scheduled cron route
 * (`requestedByActorType: 'system'`) so there is exactly one acquisition/
 * policy code path -- a recurring trigger cannot bypass anything a manual
 * trigger wouldn't also go through.
 */
export async function runDiscoveryMission(
  input: RunDiscoveryMissionInput
): Promise<RunDiscoveryMissionResult> {
  const candidatesPerTopic = input.candidatesPerTopic ?? 2;
  const topicKeys = input.topicKeys;
  const documentCap = input.documentCap ?? 30;

  const job = await startResearchMissionJob({
    missionType: 'discovery',
    objective: 'Discover candidate canine nutrition research for owner selection',
    stageKey: 'discovery',
    jobType: 'discovery',
    requestedBy: input.requestedBy,
    requestedByActorType: input.requestedByActorType,
    jobInput: {
      candidates_per_topic: candidatesPerTopic,
      topic_keys: topicKeys ?? null,
      document_cap: documentCap,
    },
    initialStatus: 'running',
    idempotencyKey: input.idempotencyKey ?? null,
  });

  try {
    const literatureRegistry = await loadLiteratureRegistrySnapshot(
      job.control_plane.literature_registry_version_id
    );
    const run = await discoverResearchCandidates({
      candidatesPerTopic,
      topicKeys,
      concurrency: 3,
      literatureRegistry,
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

    const completedJob = await finishResearchMissionJob({
      jobId: job.id,
      status: candidates.length > 0 ? 'awaiting_selection' : 'succeeded',
      resultSummary: {
        unique_candidate_count: run.unique_candidate_count,
        stored_candidate_count: candidates.length,
        duplicate_candidate_count: run.duplicate_candidate_count,
        already_imported_count:
          storedCandidates?.filter((candidate) => candidate.imported_document_id).length ?? 0,
        discovery_model_calls: 0,
        discovery_embedding_calls: 0,
        future_import_cost_estimate: costEstimate,
      },
      eventPayload: {
        stored_candidate_count: candidates.length,
        model_calls_performed: false,
        embedding_calls_performed: false,
      },
    });

    const allTopicsBlocked =
      run.results.length > 0 && run.results.every((topicResult) => topicResult.error !== null);

    return {
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
      all_topics_blocked: allTopicsBlocked,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Discovery failed';
    try {
      await finishResearchMissionJob({
        jobId: job.id,
        status: 'failed',
        reasonCode: 'discovery_failed',
        errorMessage: message,
      });
    } catch {
      // Preserve the discovery failure as the thrown error even if audit finalisation fails.
    }
    throw error instanceof Error ? error : new Error(message);
  }
}
