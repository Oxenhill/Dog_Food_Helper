/**
 * Research-relevance score cache — the READ side, used inside user requests.
 *
 * A recommendation request must never call a language model. It reads
 * precomputed scores from `research_score_cache`; anything not cached is
 * enqueued in `research_score_queue` for the offline worker
 * (src/lib/researchScoreWorker.ts, which scores via the Vercel AI Gateway)
 * and scores an honest 0 for now.
 *
 * WHY THE KEY IS A CONTEXT HASH, NOT A VERSION NUMBER
 * A research-relevance score depends on exactly three things: the candidate
 * food, the dog-profile fields the prompt actually uses, and the specific set
 * of research chunks retrieved. So the key is
 *
 *     (food_id, sha256(profile_signature + sorted chunk ids))
 *
 * which is exact rather than merely fresh. Approve, edit or supersede research
 * and the retrieved chunk ids change, so the hash changes, so a stale score is
 * structurally unreachable — there is no version column that could drift out
 * of sync with the corpus.
 *
 * The profile signature carries the four fields buildResearchScoringPrompt()
 * reads and no others. Those two must stay in step; the prompt builder's
 * comment says so on the other side.
 */

import { createHash } from 'crypto';
import { supabaseAdmin } from './supabase';
import { Dog } from './types';
import { RetrievedResearchChunk } from './ragRetrieval';
import {
  NO_RESEARCH_RESULT,
  NOT_YET_SCORED_RESULT,
  type ResearchRelevanceResult,
} from './researchScoring';

export interface ResearchScoreContext {
  profileSignature: string;
  /** Base hash of dog profile + retrieved chunk ids, WITHOUT the food. */
  baseHash: string;
  chunkIds: string[];
  /** False when there is no approved research at all — nothing to cache or queue. */
  hasResearch: boolean;
}

/**
 * A short, stable fingerprint of the food data that goes into the prompt.
 *
 * This is why per-food hashing exists: the prompt now includes the ingredient
 * list and the guaranteed-analysis panel, and an admin can edit either at any
 * time. Without the fingerprint in the key, correcting a food's ingredients
 * would leave the old score cached and silently wrong. With it, an edit
 * changes the key, so the old entry is simply unreachable and the food is
 * rescored.
 */
export function foodFingerprint(food: {
  ingredientNames?: string[];
  nutrients?: Record<string, number | null> | null;
}): string {
  const ingredients = (food.ingredientNames ?? []).join('|');
  const nutrients = food.nutrients
    ? Object.keys(food.nutrients)
        .sort()
        .map((k) => `${k}=${food.nutrients?.[k] ?? ''}`)
        .join(',')
    : '';
  return createHash('sha256').update(`${ingredients}::${nutrients}`).digest('hex').slice(0, 16);
}

/** The dog fields that actually influence the prompt, in a stable order. */
export function buildProfileSignature(
  dog: Pick<Dog, 'life_stage' | 'size_category' | 'lifestyle_role' | 'work_type'>
): string {
  return [
    `life_stage=${dog.life_stage ?? 'unknown'}`,
    `size_category=${dog.size_category ?? 'unknown'}`,
    `lifestyle_role=${dog.lifestyle_role}`,
    `work_type=${dog.work_type}`,
  ].join('|');
}

/**
 * Build the cache context for one recommendation request. Chunk ids are sorted
 * so retrieval order (which similarity ranking can perturb without changing
 * the evidence set) doesn't fragment the cache.
 */
export function buildResearchScoreContext(
  dog: Pick<Dog, 'life_stage' | 'size_category' | 'lifestyle_role' | 'work_type'>,
  chunks: RetrievedResearchChunk[]
): ResearchScoreContext {
  const profileSignature = buildProfileSignature(dog);
  const chunkIds = chunks.map((c) => c.chunk_id).sort();
  const baseHash = createHash('sha256')
    .update(`${profileSignature}::${chunkIds.join(',')}`)
    .digest('hex');

  return { profileSignature, baseHash, chunkIds, hasResearch: chunks.length > 0 };
}

/**
 * WHY THE FINGERPRINT IS NOT FOLDED INTO context_hash.
 *
 * The obvious design is one combined hash per (food, context). It was built
 * that way first and it is WRONG at this scale: every food in a request then
 * has a distinct context_hash, so the lookup needs two IN() lists of ~270
 * values each, which overran PostgREST's URL limit and returned 400 Bad
 * Request. The fail-soft path dutifully reported "not yet scored" for every
 * food, so the cache would have silently never hit in production.
 *
 * So context_hash stays the per-request BASE hash (one value, cheap lookup)
 * and the fingerprint is its own column, compared per row.
 */


/** The food data the cache key and the scoring prompt both depend on. */
export interface ScorableFood {
  id: string;
  ingredientNames?: string[];
  nutrients?: Record<string, number | null> | null;
}

/**
 * Read cached scores for a set of candidate foods, and queue the misses.
 *
 * Returns a score for EVERY requested food, so callers never have to handle a
 * missing entry:
 *   - no approved research at all -> NO_RESEARCH_RESULT (nothing is queued;
 *     there is genuinely nothing to assess against)
 *   - cached                      -> the cached score and summary
 *   - miss                        -> NOT_YET_SCORED_RESULT, and queued
 *
 * Each food has its own context_hash (dog profile + chunks + that food's own
 * ingredient/nutrient fingerprint), so editing a food's data makes its old
 * cached score unreachable rather than stale.
 *
 * Queueing failures are logged and swallowed: a recommendation must still be
 * returned if the queue write fails. Nothing here calls a model.
 */
export async function getResearchScores(
  foods: ScorableFood[],
  context: ResearchScoreContext
): Promise<Map<string, ResearchRelevanceResult>> {
  const out = new Map<string, ResearchRelevanceResult>();
  if (foods.length === 0) return out;

  if (!context.hasResearch) {
    for (const f of foods) out.set(f.id, NO_RESEARCH_RESULT);
    return out;
  }

  // One cheap lookup: a single base hash plus the candidate food ids. The
  // per-food fingerprint is compared below, not sent in the query.
  const fingerprints = new Map<string, string>();
  for (const f of foods) fingerprints.set(f.id, foodFingerprint(f));

  const { data, error } = await supabaseAdmin
    .from('research_score_cache')
    .select('food_id, food_fingerprint, score, summary')
    .eq('context_hash', context.baseHash)
    .in('food_id', Array.from(fingerprints.keys()));

  if (error) {
    // Degrade honestly rather than failing the whole request — same principle
    // as ragRetrieval's fail-soft. An unreadable cache is not a scored 0.
    console.warn('[researchScoreCache] cache read failed — treating all as not yet scored:', error);
    for (const f of foods) out.set(f.id, NOT_YET_SCORED_RESULT);
    return out;
  }

  const rows = (data ?? []) as {
    food_id: string;
    food_fingerprint: string;
    score: number;
    summary: string;
  }[];

  for (const row of rows) {
    // The food's ingredients/nutrients must be the ones the score was computed
    // from. A mismatch means the food was edited since — treat it as a miss so
    // it gets rescored, never serve the superseded score.
    if (fingerprints.get(row.food_id) !== row.food_fingerprint) continue;
    const score = Number(row.score);
    out.set(row.food_id, {
      score: Number.isFinite(score) ? score : 0,
      summary: row.summary,
    });
  }

  const misses = foods.filter((f) => !out.has(f.id));
  for (const f of misses) out.set(f.id, NOT_YET_SCORED_RESULT);

  if (misses.length > 0) {
    await enqueueResearchScoreMisses(misses, context);
  }

  return out;
}

/**
 * Record cache misses for the offline worker. Idempotent: the table has a
 * unique (food_id, context_hash), so re-requesting an already-queued pair
 * updates that row rather than creating a duplicate unit of work.
 *
 * The conflicting row is UPDATED, not skipped. That matters: reaching here at
 * all means the cache had no valid entry for this food, so the row genuinely
 * needs (re)doing — and if the food's data changed since it was queued, the
 * row must carry the CURRENT fingerprint and go back to 'pending', otherwise a
 * row left sitting at 'done' from a previous fingerprint would never be
 * rescored and the food would be stuck with no usable score.
 */
export async function enqueueResearchScoreMisses(
  foods: ScorableFood[],
  context: ResearchScoreContext
): Promise<void> {
  if (foods.length === 0) return;

  const rows = foods.map((f) => ({
    food_id: f.id,
    context_hash: context.baseHash,
    food_fingerprint: foodFingerprint(f),
    profile_signature: context.profileSignature,
    chunk_ids: context.chunkIds,
    status: 'pending',
  }));

  const { error } = await supabaseAdmin
    .from('research_score_queue')
    .upsert(rows, { onConflict: 'food_id,context_hash' });

  if (error) {
    console.warn('[researchScoreCache] failed to enqueue cache misses (non-fatal):', error);
  }
}
