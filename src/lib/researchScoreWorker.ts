/**
 * Research-relevance scoring — the OFFLINE WRITE side (Vercel AI Gateway).
 *
 * This is the job that fills `research_score_cache`. It is never invoked from
 * a user request: recommendation requests only ever read the cache (see
 * researchScoreCache.ts), so no owner ever waits on a model call and cost no
 * longer scales with catalogue size.
 *
 * ---------------------------------------------------------------------------
 * WHY NOT THE BATCH API (checked live, 2026-07-26)
 * Everything in this project routes through the **Vercel AI Gateway** — owner
 * decision. There is no `ANTHROPIC_API_KEY` and no direct call to
 * api.anthropic.com from this file.
 *
 * The Gateway has no Message-Batches endpoint. Probed directly:
 *   GET  https://ai-gateway.vercel.sh/v1/messages/batches -> 404 not_found
 *   GET  https://ai-gateway.vercel.sh/v1/batches          -> 404 not_found
 *   POST https://ai-gateway.vercel.sh/v1/messages         -> 400 (reached,
 *                                                           validation error)
 * — the same 404 with and without auth, so it is genuinely "no such route",
 * not an auth failure. Anthropic's 50% batch discount is therefore not
 * available through the Gateway.
 *
 * That costs us the batch discount but NOT the main saving. The big win was
 * always moving from "one call per candidate food on every single request" to
 * "one call per (food, research context), once, ever" — the cache is keyed so
 * a score is computed once and reused until the underlying research actually
 * changes. This job just does those calls in the background with bounded
 * concurrency and a per-run cap.
 * ---------------------------------------------------------------------------
 */

import { generateObject } from 'ai';
import { supabaseAdmin } from './supabase';
import {
  RESEARCH_SCORING_SYSTEM,
  ResearchRelevanceSchema,
  buildResearchScoringPrompt,
} from './researchScoring';
import { fetchFoodFullMany } from './foodFull';
import { foodFingerprint } from './researchScoreCache';
import type { RetrievedResearchChunk } from './ragRetrieval';
import type { ResearchTopic } from './types';

/**
 * Gateway model id — the "provider/model" form. Must NOT be a raw dated
 * Anthropic id; that format is only for direct api.anthropic.com calls, which
 * this project no longer makes.
 */
const SONNET_MODEL = process.env.AI_GATEWAY_SONNET_MODEL || 'anthropic/claude-sonnet-5';

/** Per-run cap, so a single run can never surprise-spend on a large queue. */
const DEFAULT_LIMIT = 100;
/** Concurrent Gateway calls. Kept low — this is a background job, not a race. */
const DEFAULT_CONCURRENCY = 4;

interface QueueRow {
  id: string;
  food_id: string;
  context_hash: string;
  profile_signature: string;
  chunk_ids: string[];
}

/** True when Gateway auth is available (an API key locally, OIDC on Vercel). */
export function hasGatewayAuth(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

/**
 * Rebuild the dog-profile fields from the stored signature. The signature is
 * the authoritative record of what the original prompt used — reading the
 * dog's CURRENT profile instead would produce a score that doesn't match the
 * key it gets filed under.
 */
function parseProfileSignature(signature: string) {
  const parts = new Map(
    signature.split('|').map((kv) => {
      const i = kv.indexOf('=');
      return [kv.slice(0, i), kv.slice(i + 1)] as [string, string];
    })
  );
  const get = (k: string) => parts.get(k) ?? 'unknown';
  return {
    life_stage: get('life_stage') === 'unknown' ? undefined : (get('life_stage') as never),
    size_category: get('size_category') === 'unknown' ? undefined : (get('size_category') as never),
    lifestyle_role: get('lifestyle_role') as never,
    work_type: get('work_type') as never,
  };
}

/** Fetch chunk text + source metadata for the exact chunk ids a queue row names. */
async function fetchChunksByIds(chunkIds: string[]): Promise<RetrievedResearchChunk[]> {
  if (chunkIds.length === 0) return [];

  const { data, error } = await supabaseAdmin
    .from('research_chunks')
    .select(
      'id, document_id, content, chunk_index, research_documents(topic, source_url, title, review_status, superseded_by)'
    )
    .in('id', chunkIds);

  if (error) {
    console.error('[research-scoring] failed to fetch chunks', error);
    return [];
  }

  type Row = {
    id: string;
    document_id: string;
    content: string;
    chunk_index: number;
    research_documents: {
      topic: ResearchTopic;
      source_url: string | null;
      title: string | null;
      review_status: string;
      superseded_by: string | null;
    } | null;
  };

  return ((data ?? []) as unknown as Row[])
    // Re-assert approved-only here too. A chunk that has since been rejected
    // or superseded must not be scored against, even though it was approved
    // when the cache miss was queued.
    .filter(
      (r) => r.research_documents?.review_status === 'approved' && !r.research_documents?.superseded_by
    )
    .map((r) => ({
      chunk_id: r.id,
      document_id: r.document_id,
      content: r.content,
      chunk_index: r.chunk_index,
      similarity: 0, // not part of the prompt; the evidence set is what matters
      topic: r.research_documents!.topic,
      source_url: r.research_documents!.source_url,
      title: r.research_documents!.title,
    }));
}

export interface RunResearchScoreWorkerOptions {
  limit?: number;
  concurrency?: number;
}

export interface RunResearchScoreWorkerResult {
  queue_rows_claimed: number;
  scores_written: number;
  skipped: number;
  failed: number;
  model: string;
}

/**
 * Drain up to `limit` pending queue rows, scoring each through the Gateway and
 * writing `research_score_cache`.
 *
 * Honesty rules, same as every other scoring path here: a failed or
 * out-of-range result marks the row failed and writes NOTHING. A guessed score
 * is worse than an absent one, because the absent case already has honest copy
 * in front of the owner ("not assessed yet").
 */
export async function runResearchScoreWorker(
  options: RunResearchScoreWorkerOptions = {}
): Promise<RunResearchScoreWorkerResult> {
  const limit = Math.max(1, Math.min(options.limit ?? DEFAULT_LIMIT, 500));
  const concurrency = Math.max(1, Math.min(options.concurrency ?? DEFAULT_CONCURRENCY, 10));

  const result: RunResearchScoreWorkerResult = {
    queue_rows_claimed: 0,
    scores_written: 0,
    skipped: 0,
    failed: 0,
    model: SONNET_MODEL,
  };

  const { data, error } = await supabaseAdmin
    .from('research_score_queue')
    .select('id, food_id, context_hash, profile_signature, chunk_ids')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(limit);

  if (error) throw error;
  const rows = (data ?? []) as QueueRow[];
  if (rows.length === 0) return result;

  // Claim the rows up front so a concurrent/overlapping run can't score them
  // twice. A crash after this leaves them 'submitted'; requeueStaleRows()
  // below is the deliberate recovery path.
  const claimedIds = rows.map((r) => r.id);
  const { error: claimError } = await supabaseAdmin
    .from('research_score_queue')
    .update({ status: 'submitted', submitted_at: new Date().toISOString() })
    .in('id', claimedIds)
    .eq('status', 'pending');
  if (claimError) throw claimError;
  result.queue_rows_claimed = rows.length;

  // Full detail, because the prompt includes the ingredient list and the
  // guaranteed-analysis panel (see buildResearchScoringPrompt). The same data
  // is fingerprinted into the row's context_hash by the reader, so what is
  // scored here and what the key claims was scored stay in agreement.
  const foodIds = Array.from(new Set(rows.map((r) => r.food_id)));
  const foods = await fetchFoodFullMany(foodIds);

  // Chunk sets repeat heavily across rows (every food in one request shares
  // one context), so fetch each distinct set once.
  const chunkCache = new Map<string, RetrievedResearchChunk[]>();
  async function chunksFor(row: QueueRow): Promise<RetrievedResearchChunk[]> {
    const key = row.chunk_ids.join(',');
    if (!chunkCache.has(key)) chunkCache.set(key, await fetchChunksByIds(row.chunk_ids));
    return chunkCache.get(key)!;
  }

  const nowIso = () => new Date().toISOString();

  async function processRow(row: QueueRow): Promise<void> {
    const food = foods.get(row.food_id);
    const chunks = food ? await chunksFor(row) : [];

    if (!food || chunks.length === 0) {
      // The food or the evidence behind this miss is gone (deleted, rejected
      // or superseded). Scoring it would be scoring against nothing.
      result.skipped += 1;
      await supabaseAdmin
        .from('research_score_queue')
        .update({
          status: 'failed',
          completed_at: nowIso(),
          error: 'Food or approved research chunks no longer available for this context',
        })
        .eq('id', row.id);
      return;
    }

    try {
      const { object } = await generateObject({
        model: SONNET_MODEL,
        schema: ResearchRelevanceSchema,
        system: RESEARCH_SCORING_SYSTEM,
        prompt: buildResearchScoringPrompt(
          parseProfileSignature(row.profile_signature),
          {
            brand: food.brand,
            name: food.name,
            food_type: food.food_type,
            calories_per_kg: food.calories_per_kg,
            ingredientNames: food.ingredients.map((i) => i.name),
            nutrients: food.nutrients as unknown as Record<string, number | null>,
          },
          chunks
        ),
      });

      const score = Number(object.relevance_score);
      const summary = (object.reasoning ?? '').trim();
      if (!Number.isFinite(score) || score < 0 || score > 1 || !summary) {
        throw new Error('Model returned an out-of-range or empty result');
      }

      const { error: upsertError } = await supabaseAdmin.from('research_score_cache').upsert(
        {
          food_id: row.food_id,
          context_hash: row.context_hash,
          // The fingerprint of the food data ACTUALLY scored just now, not the
          // one captured when the miss was queued — if the food changed in
          // between, this records what the score really reflects, and the
          // reader's comparison then correctly treats the older request as a
          // miss instead of serving a score for data that no longer applies.
          food_fingerprint: foodFingerprint({
            ingredientNames: food.ingredients.map((i) => i.name),
            nutrients: food.nutrients as unknown as Record<string, number | null>,
          }),
          profile_signature: row.profile_signature,
          chunk_ids: row.chunk_ids,
          score,
          summary,
          model: SONNET_MODEL,
          computed_at: nowIso(),
        },
        { onConflict: 'food_id,context_hash' }
      );
      if (upsertError) throw upsertError;

      result.scores_written += 1;
      await supabaseAdmin
        .from('research_score_queue')
        .update({ status: 'done', completed_at: nowIso(), error: null })
        .eq('id', row.id);
    } catch (err) {
      result.failed += 1;
      console.error(`[research-scoring] scoring failed for queue row ${row.id}`, err);
      await supabaseAdmin
        .from('research_score_queue')
        .update({
          status: 'failed',
          completed_at: nowIso(),
          error: `Scoring failed — no score written rather than a guessed one: ${
            err instanceof Error ? err.message : String(err)
          }`.slice(0, 500),
        })
        .eq('id', row.id);
    }
  }

  // Bounded concurrency: a fixed pool of workers pulling from one cursor.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, rows.length) }, async () => {
      while (cursor < rows.length) {
        const row = rows[cursor++];
        await processRow(row);
      }
    })
  );

  console.log(
    `[research-scoring] claimed ${result.queue_rows_claimed}, wrote ${result.scores_written}, skipped ${result.skipped}, failed ${result.failed} (model ${SONNET_MODEL})`
  );

  return result;
}

/**
 * Recovery path: return rows stuck in 'submitted' (claimed by a run that
 * crashed or timed out) to 'pending' so a later run picks them up. Without
 * this, a killed run would strand its claimed rows forever.
 */
export async function requeueStaleRows(olderThanMinutes = 30): Promise<number> {
  const cutoff = new Date(Date.now() - olderThanMinutes * 60_000).toISOString();
  const { data, error } = await supabaseAdmin
    .from('research_score_queue')
    .update({ status: 'pending', submitted_at: null })
    .eq('status', 'submitted')
    .lt('submitted_at', cutoff)
    .select('id');

  if (error) {
    console.error('[research-scoring] requeueStaleRows failed', error);
    return 0;
  }
  return (data ?? []).length;
}

/** Queue depth by status — used by the cron route to report progress. */
export async function getQueueStats(): Promise<Record<string, number>> {
  const { data, error } = await supabaseAdmin.from('research_score_queue').select('status');
  if (error) return {};
  const counts: Record<string, number> = {};
  for (const row of (data ?? []) as { status: string }[]) {
    counts[row.status] = (counts[row.status] ?? 0) + 1;
  }
  return counts;
}
