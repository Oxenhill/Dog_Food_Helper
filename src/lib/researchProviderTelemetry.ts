import { supabaseAdmin } from './supabase';
import {
  requireResearchModelRoute,
  type ResearchModelExecutionKind,
  type ResearchStageControlPlaneSnapshot,
} from './researchModelRouting';

const ESTIMATE_METHOD = 'character_count_divided_by_4_with_declared_output_cap';
const ESTIMATE_VERSION = 'bowl_provider_estimate_v1';

export interface ResearchProviderActualUsage {
  inputTokens?: number | null;
  outputTokens?: number | null;
  totalTokens?: number | null;
  reasoningTokens?: number | null;
  cacheReadTokens?: number | null;
  cacheWriteTokens?: number | null;
}

export interface ResearchProviderResponseMetadata {
  provider?: string | null;
  modelIdentifier?: string | null;
  requestId?: string | null;
  providerDurationMs?: number | null;
  actualCostUsd?: number | null;
  actualCostSource?: string | null;
}

export interface ResearchProviderEstimate {
  inputTokens: number;
  outputTokens: number;
  totalTokens: number;
  costUsd: number;
  method: typeof ESTIMATE_METHOD;
  version: typeof ESTIMATE_VERSION;
  rateVersionId: string;
}

interface EstimateRateRow {
  id: string;
  input_usd_per_million_tokens: number | string;
  output_usd_per_million_tokens: number | string;
}

interface ProviderCallRow extends Record<string, unknown> {
  id: string;
  status: 'started' | 'succeeded' | 'failed';
}

interface BeginProviderCallResult {
  accepted: boolean;
  replay: boolean;
  reason_code: string | null;
  call: ProviderCallRow | null;
}

interface CompleteProviderCallResult {
  replay: boolean;
  budget_halt_reason_code: string | null;
  call: ProviderCallRow;
}

export class ResearchProviderCallHaltError extends Error {
  readonly reasonCode: string;
  readonly persisted: boolean;

  constructor(reasonCode: string, persisted: boolean) {
    super(`Research provider call halted: ${reasonCode}`);
    this.name = 'ResearchProviderCallHaltError';
    this.reasonCode = reasonCode;
    this.persisted = persisted;
  }
}

function requireObject(value: unknown): Record<string, unknown> {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

function requireBeginResult(value: unknown): BeginProviderCallResult {
  const row = requireObject(value);
  const call = row.call === null ? null : requireObject(row.call);
  if (
    typeof row.accepted !== 'boolean'
    || typeof row.replay !== 'boolean'
    || (row.reason_code !== null && typeof row.reason_code !== 'string')
    || (call !== null && typeof call.id !== 'string')
  ) {
    throw new Error('Provider-call reservation returned an invalid result');
  }
  return {
    accepted: row.accepted,
    replay: row.replay,
    reason_code: row.reason_code as string | null,
    call: call as ProviderCallRow | null,
  };
}

function requireCompleteResult(value: unknown): CompleteProviderCallResult {
  const row = requireObject(value);
  const call = requireObject(row.call);
  if (
    typeof row.replay !== 'boolean'
    || (row.budget_halt_reason_code !== null
      && typeof row.budget_halt_reason_code !== 'string')
    || typeof call.id !== 'string'
  ) {
    throw new Error('Provider-call completion returned an invalid result');
  }
  return {
    replay: row.replay,
    budget_halt_reason_code: row.budget_halt_reason_code as string | null,
    call: call as ProviderCallRow,
  };
}

function nonNegativeInteger(value: unknown): number | null {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
    ? value
    : null;
}

function boundedText(value: unknown, maximum = 500): string | null {
  if (typeof value !== 'string') return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, maximum) : null;
}

function safeErrorMessage(error: unknown): string {
  const name = error instanceof Error && error.name ? error.name : 'ProviderError';
  return `The configured research provider call failed (${name}).`;
}

export function estimateInputTokensFromText(values: string[]): number {
  return Math.ceil(values.reduce((total, value) => total + value.length, 0) / 4);
}

export async function createResearchProviderEstimate(input: {
  provider: string;
  modelIdentifier: string;
  inputText: string[];
  outputTokenCap?: number;
  fixedInputTokenAllowance?: number;
}): Promise<ResearchProviderEstimate> {
  const inputTokens = estimateInputTokensFromText(input.inputText)
    + Math.max(0, Math.floor(input.fixedInputTokenAllowance ?? 0));
  const outputTokens = Math.max(0, Math.floor(input.outputTokenCap ?? 0));
  const now = new Date().toISOString();
  const { data, error } = await supabaseAdmin
    .from('research_usage_estimate_rate_versions')
    .select('id, input_usd_per_million_tokens, output_usd_per_million_tokens')
    .eq('provider', input.provider)
    .eq('model_identifier', input.modelIdentifier)
    .lte('effective_from', now)
    .or(`effective_until.is.null,effective_until.gt.${now}`)
    .order('version', { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data) {
    throw error ?? new Error(
      `No active estimate-rate version exists for ${input.modelIdentifier}`
    );
  }
  const rate = data as EstimateRateRow;
  const costUsd = (
    (inputTokens * Number(rate.input_usd_per_million_tokens))
    + (outputTokens * Number(rate.output_usd_per_million_tokens))
  ) / 1_000_000;
  return {
    inputTokens,
    outputTokens,
    totalTokens: inputTokens + outputTokens,
    costUsd: Number(costUsd.toFixed(6)),
    method: ESTIMATE_METHOD,
    version: ESTIMATE_VERSION,
    rateVersionId: rate.id,
  };
}

function usageFromError(error: unknown): ResearchProviderActualUsage | null {
  const row = requireObject(error);
  const usage = requireObject(row.usage);
  const inputDetails = requireObject(usage.inputTokenDetails);
  const outputDetails = requireObject(usage.outputTokenDetails);
  const candidate: ResearchProviderActualUsage = {
    inputTokens: nonNegativeInteger(usage.inputTokens),
    outputTokens: nonNegativeInteger(usage.outputTokens),
    totalTokens: nonNegativeInteger(usage.totalTokens ?? usage.tokens),
    reasoningTokens: nonNegativeInteger(outputDetails.reasoningTokens),
    cacheReadTokens: nonNegativeInteger(inputDetails.cacheReadTokens),
    cacheWriteTokens: nonNegativeInteger(inputDetails.cacheWriteTokens),
  };
  return Object.values(candidate).some((value) => value !== null) ? candidate : null;
}

async function completeProviderCall(input: {
  callId: string;
  status: 'succeeded' | 'failed';
  usage: ResearchProviderActualUsage | null;
  response?: ResearchProviderResponseMetadata | null;
  durationMs: number;
  error?: unknown;
}): Promise<CompleteProviderCallResult> {
  const usage = input.usage;
  const response = input.response ?? null;
  const actualCost = typeof response?.actualCostUsd === 'number'
    && Number.isFinite(response.actualCostUsd)
    && response.actualCostUsd >= 0
    ? response.actualCostUsd
    : null;
  const { data, error } = await supabaseAdmin.rpc(
    'complete_research_provider_call',
    {
      p_provider_call_id: input.callId,
      p_status: input.status,
      p_actual_usage_source: usage ? 'provider_reported' : 'not_reported',
      p_actual_input_tokens: usage?.inputTokens ?? null,
      p_actual_output_tokens: usage?.outputTokens ?? null,
      p_actual_total_tokens: usage?.totalTokens ?? null,
      p_actual_reasoning_tokens: usage?.reasoningTokens ?? null,
      p_actual_cache_read_tokens: usage?.cacheReadTokens ?? null,
      p_actual_cache_write_tokens: usage?.cacheWriteTokens ?? null,
      p_actual_cost_usd: actualCost,
      p_actual_cost_source: actualCost !== null
        ? boundedText(response?.actualCostSource) ?? 'provider_reported'
        : null,
      p_actual_provider: boundedText(response?.provider),
      p_actual_model_identifier: boundedText(response?.modelIdentifier),
      p_provider_request_id: boundedText(response?.requestId),
      p_client_duration_ms: input.durationMs,
      p_provider_duration_ms: nonNegativeInteger(response?.providerDurationMs),
      p_error_code: input.status === 'failed' ? 'provider_call_failed' : null,
      p_error_message: input.status === 'failed' ? safeErrorMessage(input.error) : null,
    }
  );
  if (error) throw error;
  return requireCompleteResult(data);
}

/**
 * Reserve under the pinned cap policy, perform exactly one external provider
 * call, then persist provider-reported actual usage and measured wall timing.
 * Estimate fields never substitute for missing provider usage.
 */
export async function executeTrackedResearchProviderCall<T>(input: {
  jobId: string;
  controlPlane: ResearchStageControlPlaneSnapshot;
  routeKey: string;
  executionKind: Extract<ResearchModelExecutionKind, 'embedding_model' | 'language_model'>;
  callKey: string;
  estimate: ResearchProviderEstimate;
  execute: () => Promise<T>;
  readUsage: (result: T) => ResearchProviderActualUsage | null;
  readResponse?: (result: T) => ResearchProviderResponseMetadata | null;
}): Promise<T> {
  const route = requireResearchModelRoute(
    input.controlPlane,
    input.routeKey,
    input.executionKind
  );
  const { data, error } = await supabaseAdmin.rpc('begin_research_provider_call', {
    p_job_id: input.jobId,
    p_model_route_id: route.id,
    p_call_key: input.callKey,
    p_estimated_input_tokens: input.estimate.inputTokens,
    p_estimated_output_tokens: input.estimate.outputTokens,
    p_estimated_total_tokens: input.estimate.totalTokens,
    p_estimated_cost_usd: input.estimate.costUsd,
    p_estimate_method: input.estimate.method,
    p_estimate_version: input.estimate.version,
    p_estimate_rate_version_id: input.estimate.rateVersionId,
  });
  if (error) throw error;
  const reservation = requireBeginResult(data);
  if (!reservation.accepted || !reservation.call) {
    throw new ResearchProviderCallHaltError(
      reservation.reason_code ?? 'provider_call_not_started',
      !reservation.replay
    );
  }

  const startedAt = performance.now();
  let result: T;
  try {
    result = await input.execute();
  } catch (error) {
    const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
    try {
      await completeProviderCall({
        callId: reservation.call.id,
        status: 'failed',
        usage: usageFromError(error),
        durationMs,
        error,
      });
    } catch {
      // The original provider failure remains authoritative. A started row is
      // deliberately left visible if completion persistence is unavailable.
    }
    throw error;
  }

  const durationMs = Math.max(0, Math.round(performance.now() - startedAt));
  const completion = await completeProviderCall({
    callId: reservation.call.id,
    status: 'succeeded',
    usage: input.readUsage(result),
    response: input.readResponse?.(result) ?? null,
    durationMs,
  });
  if (completion.budget_halt_reason_code) {
    throw new ResearchProviderCallHaltError(
      completion.budget_halt_reason_code,
      true
    );
  }
  return result;
}

export function isPersistedResearchProviderHalt(
  error: unknown
): error is ResearchProviderCallHaltError {
  return error instanceof ResearchProviderCallHaltError && error.persisted;
}
