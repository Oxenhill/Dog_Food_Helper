import { z } from 'zod';
import { Dog, Food } from './types';
import { RetrievedResearchChunk } from './ragRetrieval';

/**
 * Research relevance — the SHARED PROMPT DEFINITION.
 *
 * ============================================================================
 * THIS MODULE NO LONGER CALLS A MODEL. That is the point of it.
 * ============================================================================
 *
 * Until now, `researchScoring()` fired ONE Claude Sonnet call PER CANDIDATE
 * FOOD PER RECOMMENDATION REQUEST — with ~270 foods in the dataset that is a
 * per-request cost and latency that scales with the catalogue, for a factor
 * that is only one of four weighted inputs. Owner decision: precompute scores
 * OFFLINE into a cache and have the synchronous recommendation read the
 * cached score.
 *
 * PROVIDER (owner decision, 2026-07-26): everything goes through the **Vercel
 * AI Gateway**. No `ANTHROPIC_API_KEY`, no direct api.anthropic.com calls.
 * Verified live this session that the Gateway exposes `/v1/messages` but
 * returns 404 for `/v1/messages/batches` and `/v1/batches` (both with and
 * without auth), so the Anthropic Message Batches API is NOT reachable
 * through it. The offline job therefore uses ordinary Gateway calls with
 * bounded concurrency rather than a batch submission. The cost saving comes
 * from precomputing once per (food, context) instead of on every request —
 * which is the large win — not from the batch discount.
 *
 * So the call site is gone rather than merely discouraged. What remains here
 * is the single definition of the prompt, the schema and the honest defaults,
 * imported by BOTH sides:
 *   - src/lib/researchScoreCache.ts  — reads cached scores, enqueues misses
 *   - src/lib/researchScoreWorker.ts — the offline job that fills them
 *
 * Keeping one definition matters: a cache entry is only valid if the prompt
 * that produced it is the prompt the reader believes it used.
 */

/**
 * Structured-output schema, used by the offline worker's `generateObject()`
 * call through the Vercel AI Gateway (same shape the old synchronous path
 * used).
 */
export const ResearchRelevanceSchema = z.object({
  relevance_score: z
    .number()
    .min(0)
    .max(1)
    .describe(
      'How relevant/supportive the given research snippets are to recommending this specific food for this specific dog. 0 = no meaningful connection, 1 = strong, directly applicable support. Be conservative — do not round up when the research is only tangentially related.'
    ),
  reasoning: z
    .string()
    .describe(
      'A short (1-2 sentence), plain-language explanation an owner could read, referencing the specific research finding(s) that justify the score.'
    ),
});

export const RESEARCH_SCORING_SYSTEM =
  'You are assessing how relevant a set of dog-nutrition research snippets is to recommending one specific candidate food for one specific dog. This is a decision-support tool for dog owners, not veterinary advice — be conservative and evidence-based; do not overstate a connection the research does not actually support. Never invent a research finding that is not present in the snippets you were given.';

export interface ResearchRelevanceResult {
  score: number;
  summary: string;
}

/**
 * Neutral, honest default when there is nothing to score against. Never guess
 * a non-zero relevance score when there is no research context (architecture
 * doc §9's confidence-honesty principle).
 */
export const NO_RESEARCH_RESULT: ResearchRelevanceResult = {
  score: 0,
  summary:
    "No approved research in the corpus was relevant enough to this dog's profile to retrieve, so research relevance contributes 0 for this food.",
};

/**
 * Honest default for a cache MISS: relevant research exists, but this specific
 * food has not been scored against it yet. Deliberately distinct copy from
 * NO_RESEARCH_RESULT — conflating "no research applies" with "not yet
 * assessed" would misrepresent the state of the evidence to the owner.
 */
export const NOT_YET_SCORED_RESULT: ResearchRelevanceResult = {
  score: 0,
  summary:
    'This food has not been assessed against the research library yet, so research contributes 0 to its score for now rather than a guess. It is queued for assessment and will be included next time you refresh.',
};

/**
 * What the prompt knows about the candidate food.
 *
 * The ingredient list and guaranteed-analysis panel are included because
 * without them the model cannot actually connect research to a food. In live
 * testing on 2026-07-26, with only brand/name/type/calories supplied, Sonnet
 * scored a gut-biome fibre finding 0.1 and said plainly that it *"can't be
 * directly linked… no information given about this food's fiber or starch
 * content."* It was right. Real ingredient data now exists, so it is supplied.
 */
export interface ScoredFoodContext {
  brand: string;
  name: string;
  food_type: string;
  calories_per_kg?: number | null;
  /** Label-order ingredient names, top level first. Empty when unrecorded. */
  ingredientNames?: string[];
  /** Guaranteed-analysis values, including derived carbohydrate. */
  nutrients?: Record<string, number | null> | null;
}

const NUTRIENT_LABELS: [string, string][] = [
  ['protein_pct', 'protein'],
  ['fat_pct', 'fat'],
  ['fibre_pct', 'crude fibre'],
  ['moisture_pct', 'moisture'],
  ['ash_pct', 'ash'],
  ['est_digestible_carbohydrate_pct', 'estimated digestible carbohydrate'],
];

/**
 * The exact user-turn prompt.
 *
 * CACHE CONTRACT — read before editing. Everything this prompt varies on MUST
 * be part of the cache key, or a stale score gets served silently. The key
 * (see researchScoreCache.ts) covers:
 *   - the four dog fields below, via `profile_signature`;
 *   - the exact retrieved research chunk ids;
 *   - a fingerprint of the food's own ingredients + nutrients, because those
 *     are in the prompt and an admin can edit them at any time.
 * Add anything else here and you must extend the key too.
 */
export function buildResearchScoringPrompt(
  dog: Pick<Dog, 'life_stage' | 'size_category' | 'lifestyle_role' | 'work_type'>,
  food: ScoredFoodContext,
  chunks: RetrievedResearchChunk[]
): string {
  const researchContext = chunks
    .map(
      (c, i) =>
        `[${i + 1}] topic=${c.topic}, source=${c.source_url ?? c.title ?? 'unspecified'}\n${c.content}`
    )
    .join('\n\n');

  const nutrientLine = food.nutrients
    ? NUTRIENT_LABELS.map(([key, label]) => {
        const v = food.nutrients?.[key];
        return typeof v === 'number' ? `${label} ${v}%` : null;
      })
        .filter(Boolean)
        .join(', ')
    : '';

  // Absence is stated explicitly rather than left blank, so the model doesn't
  // mistake a missing list for a short one and mark the food down for it.
  const ingredientBlock =
    food.ingredientNames && food.ingredientNames.length > 0
      ? `Ingredients, in the manufacturer's own order (most to least by weight):\n${food.ingredientNames
          .map((n, i) => `${i + 1}. ${n}`)
          .join('\n')}`
      : 'Ingredients: NOT RECORDED for this food. Do not assume a recipe, and do not penalise the food for the missing list — say so in your reasoning instead.';

  const analysisBlock = nutrientLine
    ? `Guaranteed analysis: ${nutrientLine}. (Carbohydrate is estimated by difference, not a label value, and tends to run high because crude fibre understates total dietary fibre.)`
    : 'Guaranteed analysis: not recorded for this food.';

  return `Dog profile: life_stage=${dog.life_stage ?? 'unknown'}, size_category=${dog.size_category ?? 'unknown'}, lifestyle_role=${dog.lifestyle_role}, work_type=${dog.work_type}.

Candidate food: ${food.brand} ${food.name} (${food.food_type}), calories_per_kg=${food.calories_per_kg ?? 'unknown'}.

${ingredientBlock}

${analysisBlock}

Research snippets retrieved for this dog's profile:
${researchContext}

Score how relevant/supportive this research is to recommending this specific food for this specific dog (0-1), and give a short, plain-language reasoning referencing the specific research finding(s) and, where relevant, the specific ingredients or analysis figures that justify the score. Only cite an ingredient or figure that actually appears above.`;
}
