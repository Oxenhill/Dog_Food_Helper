import { supabaseAdmin } from './supabase';

export type ResearchMissionType =
  | 'discovery'
  | 'source_import'
  | 'document_processing'
  | 'claim_drafting'
  | 'clustering'
  | 'review_handoff';

export type ResearchMissionStageKey =
  | 'discovery'
  | 'source_acquisition'
  | 'document_ingestion'
  | 'relevance_selection'
  | 'claim_drafting'
  | 'clustering'
  | 'review_handoff';

export type ResearchMissionJobType =
  | 'discovery'
  | 'url_import'
  | 'pdf_import'
  | 'embed'
  | 'draft_claims'
  | 'cluster_claims';

export type ResearchMissionInitialStatus = 'queued' | 'running';
export type ResearchMissionTerminalJobStatus =
  | 'awaiting_selection'
  | 'succeeded'
  | 'failed';

export interface ResearchMissionJob extends Record<string, unknown> {
  id: string;
  mission_id: string;
  mission_stage_id: string;
  job_type: ResearchMissionJobType;
  status: string;
  input: Record<string, unknown>;
}

function requireMissionJob(data: unknown): ResearchMissionJob {
  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row ||
    typeof row !== 'object' ||
    typeof (row as Record<string, unknown>).id !== 'string' ||
    typeof (row as Record<string, unknown>).mission_id !== 'string' ||
    typeof (row as Record<string, unknown>).mission_stage_id !== 'string'
  ) {
    throw new Error('Research mission lifecycle returned an invalid job');
  }
  return row as ResearchMissionJob;
}

export async function startResearchMissionJob(input: {
  missionType: ResearchMissionType;
  objective: string;
  stageKey: ResearchMissionStageKey;
  jobType: ResearchMissionJobType;
  requestedBy: string;
  jobInput?: Record<string, unknown>;
  initialStatus?: ResearchMissionInitialStatus;
  gatewayModel?: string | null;
  idempotencyKey?: string | null;
}): Promise<ResearchMissionJob> {
  const { data, error } = await supabaseAdmin.rpc('start_research_mission_job', {
    p_mission_type: input.missionType,
    p_objective: input.objective,
    p_stage_key: input.stageKey,
    p_job_type: input.jobType,
    p_requested_by: input.requestedBy,
    p_input: input.jobInput ?? {},
    p_initial_status: input.initialStatus ?? 'running',
    p_gateway_model: input.gatewayModel ?? null,
    p_idempotency_key: input.idempotencyKey ?? null,
  });
  if (error) throw error;
  return requireMissionJob(data);
}

export async function markResearchMissionJobRunning(
  jobId: string,
  payload: Record<string, unknown> = {}
): Promise<ResearchMissionJob> {
  const { data, error } = await supabaseAdmin.rpc(
    'mark_research_mission_job_running',
    {
      p_job_id: jobId,
      p_payload: payload,
    }
  );
  if (error) throw error;
  return requireMissionJob(data);
}

export async function retryResearchMissionJobStage(input: {
  failedJobId: string;
  requestedBy: string;
  idempotencyKey?: string | null;
}): Promise<ResearchMissionJob> {
  const { data, error } = await supabaseAdmin.rpc(
    'retry_research_mission_job_stage',
    {
      p_failed_job_id: input.failedJobId,
      p_requested_by: input.requestedBy,
      p_idempotency_key: input.idempotencyKey ?? null,
    }
  );
  if (error) throw error;
  return requireMissionJob(data);
}

export async function finishResearchMissionJob(input: {
  jobId: string;
  status: ResearchMissionTerminalJobStatus;
  resultSummary?: Record<string, unknown> | null;
  reasonCode?: string | null;
  errorMessage?: string | null;
  gatewayModel?: string | null;
  gatewayInputTokens?: number | null;
  gatewayOutputTokens?: number | null;
  gatewayCostUsd?: number | null;
  eventPayload?: Record<string, unknown>;
}): Promise<ResearchMissionJob> {
  const { data, error } = await supabaseAdmin.rpc(
    'finish_research_mission_job',
    {
      p_job_id: input.jobId,
      p_job_status: input.status,
      p_result_summary: input.resultSummary ?? null,
      p_reason_code: input.reasonCode ?? null,
      p_error_message: input.errorMessage ?? null,
      p_gateway_model: input.gatewayModel ?? null,
      p_gateway_input_tokens: input.gatewayInputTokens ?? null,
      p_gateway_output_tokens: input.gatewayOutputTokens ?? null,
      p_gateway_cost_usd: input.gatewayCostUsd ?? null,
      p_event_payload: input.eventPayload ?? {},
    }
  );
  if (error) throw error;
  return requireMissionJob(data);
}

export async function appendResearchMissionJobEvent(
  jobId: string,
  eventType: string,
  payload: Record<string, unknown> = {}
): Promise<number> {
  const { data, error } = await supabaseAdmin.rpc(
    'append_research_mission_job_event',
    {
      p_job_id: jobId,
      p_event_type: eventType,
      p_payload: payload,
    }
  );
  if (error) throw error;
  const eventId = typeof data === 'number' ? data : Number(data);
  if (!Number.isSafeInteger(eventId) || eventId <= 0) {
    throw new Error('Research mission lifecycle returned an invalid event id');
  }
  return eventId;
}
