import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
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
 * Model id is configurable via ANTHROPIC_SONNET_MODEL — CLAUDE.md names the
 * model "Claude Sonnet 5" but that's a product name, not a guaranteed exact
 * API model-id string, so this isn't hardcoded blind. Confirm/update the
 * default against the live Anthropic model list before relying on this in
 * production (flagged in BUILD_PROGRESS.md).
 */

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const SONNET_MODEL = process.env.ANTHROPIC_SONNET_MODEL || 'claude-sonnet-4-5-20250929';

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
      model: anthropic(SONNET_MODEL),
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
