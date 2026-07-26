import { generateObject } from 'ai';
import { z } from 'zod';
import { supabaseAdmin } from './supabase';

/**
 * Ingredient + guaranteed-analysis backfill for existing `foods` rows.
 *
 * Why this exists: the food table was populated with brand/name/nutrient data
 * but essentially no ingredient lists — most foods have zero `food_ingredients`
 * rows, and the handful that do carry 4-item seed stubs rather than a real
 * label. That is a SAFETY gap, not a cosmetic one: `hardFilter.ts` excludes
 * foods for a dog's allergies by matching `food_ingredients.ingredient_name`,
 * so with no ingredients recorded an allergy exclusion silently matches
 * nothing. It also blocks the owner-facing "what's actually in this food"
 * display and the composition chart.
 *
 * Design (mirrors foodDiscovery.ts, deliberately):
 *   - reads each food's own `source_url` (every food that needs a backfill has
 *     one), fetches it, strips to text;
 *   - sends one Haiku extraction request per food through the **Vercel AI
 *     Gateway** with bounded concurrency. This platform holds no
 *     ANTHROPIC_API_KEY (owner decision, 2026-07-26); the Gateway has no batch
 *     endpoint, so this is a single synchronous pass rather than the old
 *     submit/process batch pair;
 *   - on processing, writes `food_ingredients` rows in label order and fills
 *     any *missing* guaranteed-analysis nutrient columns.
 *
 * Safety rules baked in:
 *   - Never invents an ingredient or a nutrient value. The model is instructed
 *     to return an empty list / nulls when the page doesn't state them, and a
 *     food with no extractable ingredients is left untouched rather than
 *     guessed at.
 *   - Existing non-null nutrient values are never overwritten (the imported
 *     values stay authoritative); only NULL columns are filled.
 *   - Replaces a food's ingredient rows transactionally-ish (delete-then-insert)
 *     only when the extraction actually produced ingredients, so a failed or
 *     empty extraction can't wipe existing data.
 */

/** Gateway model id ("provider/model"), never a raw dated Anthropic id. */
const HAIKU_MODEL = process.env.AI_GATEWAY_HAIKU_MODEL || 'anthropic/claude-haiku-4.5';
/** Parallel Gateway calls. Background job; deliberately modest. */
const BACKFILL_CONCURRENCY = 4;
const MAX_PAGE_TEXT_CHARS = 20000;
const FETCH_TIMEOUT_MS = 15000;

/** Foods whose ingredient list is missing or is a seed stub. */
const STUB_INGREDIENT_THRESHOLD = 5;

const NUTRIENT_COLUMNS = [
  'protein_pct',
  'fat_pct',
  'fibre_pct',
  'moisture_pct',
  'ash_pct',
  'phosphorus_pct',
  'sodium_pct',
  'calcium_pct',
] as const;

export interface BackfillCandidate {
  id: string;
  brand: string;
  name: string;
  source_url: string;
  ingredient_count: number;
}

const SYSTEM_PROMPT =
  'You extract dog food composition data from product pages. Report ONLY what the page actually states. ' +
  'Never guess, never infer a typical recipe, never complete a partial list from your own knowledge. ' +
  'If the page does not show an ingredient list, return an empty array. If a nutrient is not printed, return null for it.';

function stripHtmlToText(html: string): string {
  const withoutScripts = html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ');
  const withoutTags = withoutScripts.replace(/<[^>]+>/g, ' ');
  const decoded = withoutTags
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"');
  return decoded.replace(/\s+/g, ' ').trim().slice(0, MAX_PAGE_TEXT_CHARS);
}

async function fetchPageText(url: string): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    const res = await fetch(url, {
      signal: controller.signal,
      headers: { 'user-agent': 'DogFoodHelper/1.0 (+composition backfill)' },
    });
    clearTimeout(timer);
    if (!res.ok) return null;
    const html = await res.text();
    const text = stripHtmlToText(html);
    return text.length > 200 ? text : null;
  } catch {
    return null;
  }
}

/**
 * Foods needing a composition backfill: those with a source_url whose
 * ingredient list is absent or is a short seed stub.
 */
export async function getBackfillCandidates(limit?: number): Promise<BackfillCandidate[]> {
  const { data: foods, error } = await supabaseAdmin
    .from('foods')
    .select('id, brand, name, source_url')
    .not('source_url', 'is', null);

  if (error) throw error;

  const { data: ingredientRows, error: ingredientError } = await supabaseAdmin
    .from('food_ingredients')
    .select('food_id');

  if (ingredientError) throw ingredientError;

  const counts = new Map<string, number>();
  for (const row of ingredientRows ?? []) {
    const id = (row as { food_id: string }).food_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const candidates = (foods ?? [])
    .map((f) => {
      const food = f as { id: string; brand: string; name: string; source_url: string };
      return {
        id: food.id,
        brand: food.brand,
        name: food.name,
        source_url: food.source_url,
        ingredient_count: counts.get(food.id) ?? 0,
      };
    })
    .filter((c) => c.ingredient_count < STUB_INGREDIENT_THRESHOLD);

  return typeof limit === 'number' ? candidates.slice(0, limit) : candidates;
}

/**
 * Structured-output schema (zod, for the AI SDK's generateObject via the
 * Gateway). Replaces the hand-written Anthropic tool schema this file used
 * when it ran on the Message Batches API.
 */
const BackfillSchema = z.object({
  ingredients: z
    .array(z.string())
    .describe(
      'The COMPLETE ingredient list exactly as printed on the page, in the order given (most prevalent first). Include every item. Do not summarise, group, truncate, or invent entries. Return an empty array if the page does not state an ingredient list.'
    ),
  protein_pct: z.number().nullable().describe('Crude protein %, or null if not stated.'),
  fat_pct: z.number().nullable().describe('Crude fat / oils %, or null if not stated.'),
  fibre_pct: z.number().nullable().describe('Crude fibre %, or null if not stated.'),
  moisture_pct: z.number().nullable().describe('Moisture %, or null if not stated.'),
  ash_pct: z.number().nullable().describe('Crude ash / inorganic matter %, or null if not stated.'),
  phosphorus_pct: z.number().nullable().describe('Phosphorus %, or null if not stated.'),
  sodium_pct: z.number().nullable().describe('Sodium %, or null if not stated.'),
  calcium_pct: z.number().nullable().describe('Calcium %, or null if not stated.'),
});

export interface RunBackfillResult {
  candidates: number;
  pages_fetched: number;
  foods_updated: number;
  ingredients_written: number;
  nutrients_filled: number;
  skipped_no_ingredients: number;
  extraction_failed: number;
  model: string;
}

/** True when Gateway auth is available (API key locally, OIDC on Vercel). */
export function hasGatewayAuth(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

/**
 * Run the backfill in one pass: fetch each candidate's page, extract through
 * the Gateway with bounded concurrency, and write the results.
 *
 * Safety rules preserved exactly from the batch version:
 *  - Ingredients replace a food's rows (delete-then-insert) ONLY when the
 *    extraction returned a non-empty list, so an empty or failed extraction
 *    can never wipe existing data.
 *  - Nutrients fill NULL columns only; imported values stay authoritative.
 *  - Nothing is ever invented — an unreadable page is skipped, not guessed.
 *
 * `limit` is the spend control: one Haiku call per candidate.
 */
export async function runIngredientBackfill(
  limit?: number,
  concurrency = BACKFILL_CONCURRENCY
): Promise<RunBackfillResult> {
  const candidates = await getBackfillCandidates(limit);

  const result: RunBackfillResult = {
    candidates: candidates.length,
    pages_fetched: 0,
    foods_updated: 0,
    ingredients_written: 0,
    nutrients_filled: 0,
    skipped_no_ingredients: 0,
    extraction_failed: 0,
    model: HAIKU_MODEL,
  };

  if (candidates.length === 0) return result;

  const pool = Math.max(1, Math.min(concurrency, 10));
  let cursor = 0;

  await Promise.all(
    Array.from({ length: Math.min(pool, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const candidate = candidates[cursor++];

        const text = await fetchPageText(candidate.source_url);
        if (!text) continue;
        result.pages_fetched += 1;

        let extracted: z.infer<typeof BackfillSchema>;
        try {
          const { object } = await generateObject({
            model: HAIKU_MODEL,
            schema: BackfillSchema,
            system: SYSTEM_PROMPT,
            prompt:
              `Product page for "${candidate.brand} ${candidate.name}" (${candidate.source_url}).\n\n` +
              `Extract the full ingredient list and any guaranteed-analysis figures.\n\n${text}`,
          });
          extracted = object;
        } catch (err) {
          result.extraction_failed += 1;
          console.error(`[ingredient-backfill] extraction failed for ${candidate.id}`, err);
          continue;
        }

        const ingredients = extracted.ingredients
          .filter((i) => typeof i === 'string' && i.trim() !== '')
          .map((i) => i.trim());

        if (ingredients.length === 0) {
          result.skipped_no_ingredients += 1;
        } else {
          await supabaseAdmin.from('food_ingredients').delete().eq('food_id', candidate.id);
          const rows = ingredients.map((ingredient_name, position) => ({
            food_id: candidate.id,
            ingredient_name,
            ingredient_category: null,
            position_in_list: position + 1,
          }));
          const { error: insertError } = await supabaseAdmin.from('food_ingredients').insert(rows);
          if (!insertError) {
            result.ingredients_written += rows.length;
            result.foods_updated += 1;
          }
        }

        // Fill only NULL nutrient columns.
        const { data: current } = await supabaseAdmin
          .from('foods')
          .select(NUTRIENT_COLUMNS.join(', '))
          .eq('id', candidate.id)
          .maybeSingle();

        if (current) {
          const currentRow = current as unknown as Record<string, number | null>;
          const extractedRow = extracted as unknown as Record<string, number | null>;
          const patch: Record<string, number> = {};
          for (const column of NUTRIENT_COLUMNS) {
            const value = extractedRow[column];
            if (currentRow[column] == null && typeof value === 'number' && Number.isFinite(value)) {
              patch[column] = value;
            }
          }
          if (Object.keys(patch).length > 0) {
            const { error: updateError } = await supabaseAdmin
              .from('foods')
              .update({ ...patch, updated_at: new Date().toISOString() })
              .eq('id', candidate.id);
            if (!updateError) result.nutrients_filled += Object.keys(patch).length;
          }
        }
      }
    })
  );

  console.log(
    `[ingredient-backfill] candidates=${result.candidates} fetched=${result.pages_fetched} ` +
      `foods_updated=${result.foods_updated} ingredients=${result.ingredients_written} ` +
      `nutrients=${result.nutrients_filled} skipped=${result.skipped_no_ingredients} failed=${result.extraction_failed}`
  );

  return result;
}
