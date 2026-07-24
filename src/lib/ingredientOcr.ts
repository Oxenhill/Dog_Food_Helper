import { generateObject } from 'ai';
import { z } from 'zod';
import { OcrExtractionResult } from './types';

/**
 * Photo/OCR ingredient extraction (Phase 5, Part B `submitIngredientPhoto`).
 *
 * Calls Claude Haiku 4.5 (vision) to extract a structured ingredient list
 * from an owner-submitted packet/label photo. This is Tier 2 (architecture
 * doc §7) — the caller must always write the result to
 * `ingredient_review_queue`, never directly to `foods`/`food_ingredients`
 * (that's this file's caller's job, not this file's).
 *
 * Routed through Vercel AI Gateway (owner decision, this session) rather
 * than calling Anthropic directly: passing a plain "provider/model" string
 * as `model` makes the AI SDK (v7+) route the request through the Gateway
 * automatically, authenticating via AI_GATEWAY_API_KEY if set, or via
 * Vercel's automatic OIDC token when deployed on Vercel with OIDC
 * Federation enabled for the project (no code-level fallback needed for
 * that — the SDK handles it). No more @ai-sdk/anthropic / ANTHROPIC_API_KEY
 * dependency here.
 *
 * Model id: the Gateway's own model catalog (confirmed live via
 * GET https://ai-gateway.vercel.sh/v1/models, no auth required) lists
 * `anthropic/claude-haiku-4.5` verbatim — this resolves the long-standing
 * "exact model-id string unconfirmed" flag from Phase 4/5 for Haiku, since
 * the Gateway's friendly id matches CLAUDE.md's product name exactly.
 * Configurable via AI_GATEWAY_HAIKU_MODEL — deliberately a *different* env
 * var from ANTHROPIC_HAIKU_MODEL, which foodDiscovery.ts/batchApiHelper.ts
 * still read for the *direct* (non-Gateway) Anthropic Batch API call — that
 * one needs a raw dated Anthropic model id (e.g.
 * "claude-haiku-4-5-20251001"), not this Gateway-format "provider/model" id;
 * reusing the same env var for both would silently break whichever one
 * read it second.
 */

const HAIKU_MODEL = process.env.AI_GATEWAY_HAIKU_MODEL || 'anthropic/claude-haiku-4.5';

// Nullable/optional throughout: Haiku is explicitly instructed not to guess
// a brand/product name/price it can't actually read off the photo — an
// invented value here could silently mislead an admin during review just as
// easily as an invented confidence score could mislead an owner (same
// honesty principle as Phase 3/4's confidence handling, applied to OCR).
const OcrExtractionSchema = z.object({
  brand: z
    .string()
    .nullable()
    .describe('The brand name as printed on the packet, or null if not legible/visible.'),
  product_name: z
    .string()
    .nullable()
    .describe('The specific product/variety name, or null if not legible/visible.'),
  ingredients: z
    .array(z.string())
    .describe(
      'The ingredient list in the order printed on the packet (most prevalent first). Empty array if no ingredient list is visible in the photo.'
    ),
  age_suitability: z
    .string()
    .nullable()
    .describe('Free text describing stated age suitability (e.g. "Puppy", "All life stages"), or null if not stated/visible.'),
  weight_range: z
    .string()
    .nullable()
    .describe('Free text describing stated size/weight suitability, or null if not stated/visible.'),
  price: z
    .string()
    .nullable()
    .describe('Any price shown on the packet/label/shelf tag, as free text (e.g. "£24.99"), or null if none visible.'),
  notes: z
    .string()
    .nullable()
    .describe('Anything else potentially relevant (pack size, unusual claims, poor photo quality caveats), or null.'),
});

export class IngredientOcrError extends Error {}

/**
 * Extract a structured ingredient list from an image buffer via Claude
 * Haiku's vision capability. Throws IngredientOcrError on failure — callers
 * must catch this and still write a (flagged) pending queue row rather than
 * losing the owner's upload, per the "never silently drop a submission"
 * principle.
 */
export async function extractIngredientsFromImage(
  imageBuffer: Buffer,
  mimeType: string
): Promise<OcrExtractionResult> {
  try {
    const { object } = await generateObject({
      model: HAIKU_MODEL,
      schema: OcrExtractionSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract dog food packaging information from this photo. This is a decision-support tool for dog owners — accuracy matters more than completeness. Only report a field if you can actually read it in the photo; use null (not a guess) for anything illegible, cropped out, or not present. List ingredients in the exact order printed, most prevalent first, exactly as written (don't normalise/rename them).`,
            },
            // AI SDK v7's ImagePart uses `mediaType`, not the v3-era `mimeType`.
            { type: 'image', image: imageBuffer, mediaType: mimeType },
          ],
        },
      ],
    });

    return object;
  } catch (err) {
    throw new IngredientOcrError(
      `Haiku vision OCR extraction failed: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
