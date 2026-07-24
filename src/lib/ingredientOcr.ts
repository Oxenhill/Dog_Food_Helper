import { generateObject } from 'ai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { z } from 'zod';
import { OcrExtractionResult } from './types';

/**
 * Photo/OCR ingredient extraction (Phase 5, Part B `submitIngredientPhoto`).
 *
 * Calls Claude Haiku 4.5 (vision) via the Vercel AI SDK to extract a
 * structured ingredient list from an owner-submitted packet/label photo.
 * This is Tier 2 (architecture doc §7) — the caller must always write the
 * result to `ingredient_review_queue`, never directly to `foods`/
 * `food_ingredients` (that's this file's caller's job, not this file's).
 *
 * Model id is configurable via ANTHROPIC_HAIKU_MODEL, same pattern as
 * researchScoring.ts's ANTHROPIC_SONNET_MODEL — CLAUDE.md names "Claude
 * Haiku 4.5" as a product name, not a confirmed exact API model-id string.
 * **Confirm/update the default below against the live Anthropic model list
 * before relying on this in production** (same flag as Phase 4's Sonnet
 * default — see BUILD_PROGRESS.md).
 */

const anthropic = createAnthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
const HAIKU_MODEL = process.env.ANTHROPIC_HAIKU_MODEL || 'claude-haiku-4-5-20251001';

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
      model: anthropic(HAIKU_MODEL),
      schema: OcrExtractionSchema,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `Extract dog food packaging information from this photo. This is a decision-support tool for dog owners — accuracy matters more than completeness. Only report a field if you can actually read it in the photo; use null (not a guess) for anything illegible, cropped out, or not present. List ingredients in the exact order printed, most prevalent first, exactly as written (don't normalise/rename them).`,
            },
            { type: 'image', image: imageBuffer, mimeType },
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
