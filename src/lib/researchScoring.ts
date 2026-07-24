import { generateObject } from 'ai';
import { z } from 'zod';
import { Dog, Food } from './types';
import { RetrievedResearchChunk } from './ragRetrieval';

/**
 * Research relevance scoring (Phase 4)
 *
 * Takes retrieved research chunks + a candidate food, uses Claude Sonnet to
 * synthesize a 0-1 relevance score + a plain-language reasoning summary
 * ("This food has high-quality protein, which supports [research finding X]").
 *
 * Routed through Vercel AI Gateway (owner decision, this session) — see
 * ingredientOcr.ts's header comment for the general rationale (plain
 * "provider/model" string routes automatically via the AI SDK v7+, no more
 * @ai-sdk/anthropic / ANTHROPIC_API_KEY dependency here).
 *
 * Model id: confirmed live against the Gateway's own model catalog
 * (GET https://ai-gateway.vercel.sh/v1/models) — `anthropic/claude-sonnet-5`
 * is listed verbatim, matching CLAUDE.md's product name exactly. This
 * resolves the "exact model-id string unconfirmed" flag from Phase 4.
 * Configurable via AI_GATEWAY_SONNET_MODEL (renamed from the old
 * ANTHROPIC_SONNET_MODEL, which held a raw dated Anthropic API id — nothing
 * else in this codebase reads the old name, so this is a clean rename, not
 * a shared-var conflict like the Haiku one).
 */

const SONNET_MODEL = process.env.AI_GATEWAY_SONNET_MODEL || 'anthropic/claude-sonnet-5';

const ResearchRelevanceSchema = z.object({
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

export interface ResearchRelevanceResult {
  score: number;
  summary: string;
}

/** Neutral, honest default when there's nothing to score against — never
 * guess a non-zero relevance score when there is no research context, per
 * architecture doc §9's confidence-honesty principle. */
const NO_RESEARCH_RESULT: ResearchRelevanceResult = {
  score: 0,
  summary:
    "No approved research in the corpus was relevant enough to this dog's profile to retrieve, so research relevance contributes 0 for this food.",
};

export async function researchScoring(
  dog: Dog,
  food: Food,
  chunks: RetrievedResearchChunk[]
): Promise<ResearchRelevanceResult> {
  if (chunks.length === 0) return NO_RESEARCH_RESULT;

  const researchContext = chunks
    .map(
      (c, i) =>
        `[${i + 1}] topic=${c.topic}, source=${c.source_url ?? c.title ?? 'unspecified'}\n${c.content}`
    )
    .join('\n\n');

  try {
    const { object } = await generateObject({
      model: SONNET_MODEL,
      schema: ResearchRelevanceSchema,
      prompt: `You are assessing how relevant a set of dog-nutrition research snippets is to recommending one specific candidate food for one specific dog. This is a decision-support tool for dog owners, not veterinary advice — be conservative and evidence-based; do not overstate a connection the research doesn't actually support.

Dog profile: life_stage=${dog.life_stage ?? 'unknown'}, size_category=${dog.size_category ?? 'unknown'}, lifestyle_role=${dog.lifestyle_role}, work_type=${dog.work_type}.

Candidate food: ${food.brand} ${food.name} (${food.food_type}), calories_per_kg=${food.calories_per_kg ?? 'unknown'}.

Research snippets retrieved for this dog's profile:
${researchContext}

Score how relevant/supportive this research is to recommending this specific food for this specific dog (0-1), and give a short, plain-language reasoning referencing the specific research finding(s) that justify the score.`,
    });

    return { score: object.relevance_score, summary: object.reasoning };
  } catch (err) {
    // Confidence honesty (architecture doc §9): if the LLM call fails, never
    // guess a score — fall back to the same honest 0 used when there's no
    // research context at all, and log the actual failure for visibility.
    console.error('researchScoring: generateObject failed, defaulting to 0', err);
    return {
      score: 0,
      summary: 'Research relevance could not be computed for this food due to a scoring error — treated as 0, not guessed.',
    };
  }
}
