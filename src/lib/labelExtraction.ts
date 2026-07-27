/**
 * Packet-label extraction from owner photos (front + back), via the Vercel AI
 * Gateway. Replaces the single-image path for the owner-facing flow.
 *
 * ---------------------------------------------------------------------------
 * WHY FRONT *AND* BACK
 * A UK/EU pet food packet splits the data we need across two faces:
 *   FRONT — brand, product/variety name, life stage, pack weight
 *   BACK  — composition (the ingredient list), analytical constituents
 *           (protein/fat/fibre/moisture/ash), feeding guide, energy
 * Neither alone produces a usable `foods` row. Both are sent in ONE model call
 * rather than one call each: it is cheaper (a single prompt and a single
 * structured output instead of two), and it lets the model reconcile the two
 * faces — e.g. matching a front-of-pack "Chicken 26%" flash against the
 * back-of-pack ingredient line it refers to.
 *
 * WHY THIS BEATS SCRAPING FOR THIS PRODUCT
 * A live audit of the 272-food catalogue found only 31 rows with verified
 * ingredient data. The rest failed for reasons a website can never fix:
 * `identity_ambiguous` (134 — the product name maps to several different
 * recipes), `ambiguous_formula` (70 — the current published formula conflicts
 * with the stored one), `source_unavailable` (37 — the manufacturer page is
 * gone). A photo of the packet in the owner's hand resolves all three: it
 * identifies the exact variant, it *is* the current formula, and it does not
 * depend on a website existing.
 *
 * NO PHOTO IS EVER STORED. The image is held in memory for the duration of the
 * extraction and then discarded — it is never written to Supabase Storage. The
 * extracted text is the record. That is the owner's explicit instruction ("I
 * don't want to store hundreds of photos") and it also removes the GDPR
 * surface of holding user-supplied images, which can incidentally contain
 * faces, addresses or other personal data.
 *
 * HONESTY RULE, unchanged from the single-image path: the model is told to
 * return null / an empty list for anything it cannot actually read. An
 * invented ingredient or nutrient value would flow into the allergy hard
 * filter and the composition chart as if it were fact.
 * ---------------------------------------------------------------------------
 */

import { generateObject } from 'ai';
import { z } from 'zod';

const HAIKU_MODEL = process.env.AI_GATEWAY_HAIKU_MODEL || 'anthropic/claude-haiku-4.5';

/** True when Gateway auth is available (API key locally, OIDC on Vercel). */
export function hasGatewayAuth(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

export const LabelExtractionSchema = z.object({
  brand: z
    .string()
    .nullable()
    .describe('Brand name as printed on the packet, or null if not legible/visible.'),
  product_name: z
    .string()
    .nullable()
    .describe('Specific product/variety name (e.g. "Adult Chicken & Rice"), or null if not legible.'),
  food_type: z
    .enum(['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other', ''])
    .describe(
      'Physical form of the food, judged from the packet. Empty string if genuinely indeterminable.'
    ),
  is_treat: z
    .boolean()
    .describe(
      'True if this is a treat, chew, topper or other complementary product rather than a complete meal. Complete foods usually say "complete" or "complete and balanced".'
    ),
  ingredients: z
    .array(z.string())
    .describe(
      'The COMPLETE composition/ingredient list exactly as printed, in the printed order (most prevalent first). Copy each entry verbatim, including any bracketed percentages and qualifiers such as "(min 4%)" or "dried". ' +
        'IMPORTANT — many labels (Royal Canin and Hill\'s both do this) print the percentage for a specific ingredient in a SEPARATE declaration sentence rather than inline in the list, e.g. a "Protein sources:" or "Composition includes:" sentence elsewhere on the panel reading "Protein sources: soya protein isolate (17.6%), poultry liver (5.0%)". If such a sentence names an ingredient that also appears in the main list, append that percentage onto the matching list entry in the same bracketed format ("hydrolysed soya protein isolate (17.6%)") — do not drop it just because it was not printed inline. Do not summarise, group, reorder, translate or invent entries. Empty array if no ingredient list is visible.'
    ),
  // Analytical constituents. The single-image OCR path never captured these,
  // which made photo-sourced foods strictly less complete than scraped ones —
  // no composition chart and nothing for the nutrient hard filter.
  protein_pct: z.number().nullable().describe('Crude protein %, or null if not printed.'),
  fat_pct: z.number().nullable().describe('Crude fat / oils %, or null if not printed.'),
  fibre_pct: z.number().nullable().describe('Crude fibre %, or null if not printed.'),
  moisture_pct: z.number().nullable().describe('Moisture %, or null if not printed.'),
  ash_pct: z.number().nullable().describe('Crude ash / inorganic matter %, or null if not printed.'),
  phosphorus_pct: z.number().nullable().describe('Phosphorus %, or null if not printed.'),
  sodium_pct: z.number().nullable().describe('Sodium %, or null if not printed.'),
  calcium_pct: z.number().nullable().describe('Calcium %, or null if not printed.'),
  calories_per_kg: z
    .number()
    .nullable()
    .describe(
      'Energy per kg in kcal if printed (convert from kcal/100g by multiplying by 10). Null if not printed. ' +
        'This field is verified against composition_panel_text after extraction — if you cannot point to the exact digits printed for this on the panel, return null rather than a plausible-looking figure.'
    ),
  linoleic_acid_pct: z
    .number()
    .nullable()
    .describe('Linoleic acid (omega-6) %, as printed in the analytical constituents / nutritional additives panel. Null if not printed.'),
  epa_dha_pct: z
    .number()
    .nullable()
    .describe('EPA+DHA combined %, as printed — labels virtually always give these together as one figure, not separately. Null if not printed.'),
  omega3_pct: z
    .number()
    .nullable()
    .describe('Total omega-3 %, as printed, only when the label gives a combined figure distinct from EPA+DHA. Null if not printed.'),
  life_stage_text: z
    .string()
    .nullable()
    .describe('Life stage exactly as printed ("Puppy", "Senior 7+", "All life stages"), or null.'),
  pack_size_text: z
    .string()
    .nullable()
    .describe('Pack size as printed (e.g. "12kg", "400g"), or null.'),
  // The human-readable digit string printed beneath the barcode — not the
  // bars themselves, which a vision-language model does not reliably
  // decode. Validated against the GTIN mod-10 checksum server-side before
  // it is ever written to foods.gtin (see src/lib/gtin.ts); a misread
  // digit here is caught there, not trusted just because the model read
  // something that looked like a barcode.
  gtin_raw: z
    .string()
    .nullable()
    .describe(
      'The digit string printed beneath the barcode on the packet (typically 8, 12, 13 or 14 digits), copied exactly. Null if no barcode is visible or the digits are not legible.'
    ),
  composition_panel_text: z
    .string()
    .nullable()
    .describe(
      'Verbatim OCR transcription of everything printed in the composition/ingredients block AND the analytical constituents (guaranteed analysis) panel AND any energy statement — copied exactly, not paraphrased or reformatted, including any separate declaration sentence such as "Protein sources: ...". This is the source text every numeric field above and every ingredient name is checked against after extraction; a field that does not appear here in some form will be discarded even if you populated it above. Null only if genuinely no such text is legible in either photo.'
    ),
  notes: z
    .string()
    .nullable()
    .describe(
      'Anything that affects trust in this extraction — glare, blur, a cropped ingredient list, a second language column. Null if the photos were clear.'
    ),
  unreadable: z
    .boolean()
    .describe(
      'True if the photos are too unclear to extract reliably. Prefer this over guessing at a partly-legible list.'
    ),
});

export type LabelExtraction = z.infer<typeof LabelExtractionSchema>;

export class LabelExtractionError extends Error {}

export interface LabelImage {
  buffer: Buffer;
  mimeType: string;
  /** Which face of the packet, so the prompt can tell the model what to expect. */
  face: 'front' | 'back' | 'extra';
}

const FACE_LABEL: Record<LabelImage['face'], string> = {
  front: 'FRONT of packet (expect brand, product name, life stage, pack size)',
  back: 'BACK of packet (expect composition/ingredients, analytical constituents, and usually the barcode)',
  extra: 'ADDITIONAL photo (may show the feeding guide, energy content, or the barcode)',
};

/**
 * Run one extraction over all supplied packet faces.
 *
 * Throws LabelExtractionError on failure. The caller surfaces that to the
 * owner so they can retake the photo — nothing is written and nothing is
 * queued, because with no stored image there is no submission to recover.
 */
export async function extractFromLabelPhotos(images: LabelImage[]): Promise<LabelExtraction> {
  if (images.length === 0) {
    throw new LabelExtractionError('At least one photo is required');
  }

  const faceList = images.map((i, n) => `${n + 1}. ${FACE_LABEL[i.face]}`).join('\n');

  try {
    const { object } = await generateObject({
      model: HAIKU_MODEL,
      schema: LabelExtractionSchema,
      system:
        'You transcribe dog food packaging for a decision-support tool used by dog owners. You are a TRANSCRIBER, not an expert: report only what is actually printed in the photos. Never complete a partial ingredient list from your own knowledge of the product, never infer a typical recipe from the brand, and never estimate ANY numeric value — calories per kg included — that is not printed. A plausible-looking number you recall for this product from general knowledge is not a transcription and must not be returned. An invented ingredient or nutrient figure could cause an allergic dog to be recommended a food that harms it. If something is illegible, use null (or an empty list) and say so in notes.',
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'text',
              text: `These photos show one dog food product. Transcribe it.\n\nPhotos supplied, in order:\n${faceList}\n\nCombine the faces into a single record: identity from the front, composition and analytical constituents from the back. Copy the ingredient list verbatim and in order. If the same detail appears on both faces and they disagree, prefer the back-of-pack printed panel and mention the discrepancy in notes.\n\nAlso fill composition_panel_text with a verbatim transcription of the composition/ingredients block and the analytical constituents panel, including any separate percentage-declaration sentence (e.g. "Protein sources: ..."). Every numeric field you report (calories, protein, fat, fibre, moisture, ash, phosphorus, sodium, calcium, linoleic acid, EPA+DHA, omega-3) must be a figure you can actually point to in that transcription — if you cannot, return null for that field instead of a plausible estimate.`,
            },
            ...images.map((img) => ({
              type: 'image' as const,
              image: img.buffer,
              mediaType: img.mimeType,
            })),
          ],
        },
      ],
    });

    return object;
  } catch (err) {
    throw new LabelExtractionError(
      `Could not read the packet photos: ${err instanceof Error ? err.message : String(err)}`
    );
  }
}
