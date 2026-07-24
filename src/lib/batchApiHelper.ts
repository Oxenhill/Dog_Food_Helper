/**
 * Anthropic Message Batches API helper (Phase 6, weekly food discovery job).
 *
 * The Vercel AI SDK (`ai` / `@ai-sdk/anthropic`, pinned per Phase 4's
 * BUILD_PROGRESS.md deviations) has no Batch API surface, so this talks to
 * Anthropic's REST API directly with `fetch`. Batch API gives a 50% token
 * discount in exchange for async (up to ~24h) turnaround — appropriate for a
 * weekly cron job, not for anything user-facing.
 *
 * Endpoint shapes below are per Anthropic's documented Message Batches API
 * (POST /v1/messages/batches, GET /v1/messages/batches/{id}, then a
 * `results_url` returning a JSONL file once `processing_status === 'ended'`).
 * **Flag, same as Phase 4/5's model-id defaults:** this was implemented from
 * documentation knowledge, not verified end-to-end against a live batch in
 * this sandbox (no network egress / no way to wait ~24h for a real batch to
 * complete here) — confirm the exact response shape against a real batch
 * before relying on this in production.
 */

const ANTHROPIC_API_BASE = 'https://api.anthropic.com/v1';
const ANTHROPIC_VERSION = '2023-06-01';

function apiKey(): string {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is not configured');
  return key;
}

export interface BatchRequestItem {
  custom_id: string;
  params: {
    model: string;
    max_tokens: number;
    system?: string;
    messages: Array<{ role: 'user' | 'assistant'; content: unknown }>;
    tools?: unknown[];
    tool_choice?: unknown;
  };
}

export interface MessageBatch {
  id: string;
  type: string;
  processing_status: 'in_progress' | 'canceling' | 'ended';
  request_counts?: {
    processing: number;
    succeeded: number;
    errored: number;
    canceled: number;
    expired: number;
  };
  results_url?: string | null;
  created_at?: string;
  ended_at?: string | null;
}

/**
 * Submits a batch of Message-creation requests. Returns the batch object
 * (including its id) immediately — actual processing happens asynchronously
 * server-side on Anthropic's end.
 */
export async function createMessageBatch(requests: BatchRequestItem[]): Promise<MessageBatch> {
  const res = await fetch(`${ANTHROPIC_API_BASE}/messages/batches`, {
    method: 'POST',
    headers: {
      'x-api-key': apiKey(),
      'anthropic-version': ANTHROPIC_VERSION,
      'content-type': 'application/json',
    },
    body: JSON.stringify({ requests }),
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`createMessageBatch failed: ${res.status} ${text}`);
  }

  return (await res.json()) as MessageBatch;
}

export async function getBatchStatus(batchId: string): Promise<MessageBatch> {
  const res = await fetch(`${ANTHROPIC_API_BASE}/messages/batches/${batchId}`, {
    headers: {
      'x-api-key': apiKey(),
      'anthropic-version': ANTHROPIC_VERSION,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`getBatchStatus failed: ${res.status} ${text}`);
  }

  return (await res.json()) as MessageBatch;
}

export interface BatchResultLine {
  custom_id: string;
  result: {
    type: 'succeeded' | 'errored' | 'canceled' | 'expired';
    message?: {
      content: Array<
        | { type: 'text'; text: string }
        | { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> }
      >;
    };
    error?: unknown;
  };
}

/**
 * Fetches and parses the JSONL results file for an ended batch. Throws if
 * the batch hasn't ended yet — callers should poll getBatchStatus() first
 * (or rely on a webhook, not implemented here — polling is sufficient for a
 * daily/weekly cron-driven "process" step).
 */
export async function getBatchResults(batch: MessageBatch): Promise<BatchResultLine[]> {
  if (batch.processing_status !== 'ended' || !batch.results_url) {
    throw new Error(
      `Batch ${batch.id} has not ended yet (status: ${batch.processing_status}) — no results_url available`
    );
  }

  const res = await fetch(batch.results_url, {
    headers: {
      'x-api-key': apiKey(),
      'anthropic-version': ANTHROPIC_VERSION,
    },
  });

  if (!res.ok) {
    const text = await res.text().catch(() => '');
    throw new Error(`fetching batch results failed: ${res.status} ${text}`);
  }

  const text = await res.text();
  return text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => JSON.parse(line) as BatchResultLine);
}

/**
 * Convenience: pulls the first tool_use block's `input` out of a succeeded
 * batch result message, if present. Returns null for anything else
 * (errored/canceled/expired, or a succeeded result with no tool_use — e.g.
 * the model declined to call the tool because the page had no product
 * content).
 */
export function extractToolInput(line: BatchResultLine): Record<string, unknown> | null {
  if (line.result.type !== 'succeeded' || !line.result.message) return null;
  const toolUse = line.result.message.content.find(
    (c): c is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
      c.type === 'tool_use'
  );
  return toolUse?.input ?? null;
}
