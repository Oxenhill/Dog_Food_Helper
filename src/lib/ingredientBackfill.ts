import { supabaseAdmin } from './supabase';
import {
  createMessageBatch,
  getBatchStatus,
  getBatchResults,
  extractToolInput,
  type BatchRequestItem,
} from './batchApiHelper';

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
 *   - sends one Haiku extraction request per food through the **Message
 *     Batches API** (50% cheaper, async up to 24h) — the same direct-Anthropic
 *     path foodDiscovery already uses, since the AI Gateway has no batch
 *     endpoint;
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

export interface BackfillManifestEntry {
  custom_id: string;
  food_id: string;
  url: string;
}

const BACKFILL_TOOL = {
  name: 'extract_food_composition',
  description:
    "Extract a dog food's full ingredient list and guaranteed-analysis (analytical constituents) figures from its product page text.",
  input_schema: {
    type: 'object',
    properties: {
      ingredients: {
        type: 'array',
        items: { type: 'string' },
        description:
          'The COMPLETE ingredient list exactly as printed on the page, in the order given (most prevalent first). Include every item. Do not summarise, group, truncate, or invent entries. Return an empty array if the page does not state an ingredient list.',
      },
      protein_pct: { type: ['number', 'null'], description: 'Crude protein %, or null if not stated.' },
      fat_pct: { type: ['number', 'null'], description: 'Crude fat / oils %, or null if not stated.' },
      fibre_pct: { type: ['number', 'null'], description: 'Crude fibre %, or null if not stated.' },
      moisture_pct: { type: ['number', 'null'], description: 'Moisture %, or null if not stated.' },
      ash_pct: { type: ['number', 'null'], description: 'Crude ash / inorganic matter %, or null if not stated.' },
      phosphorus_pct: { type: ['number', 'null'], description: 'Phosphorus %, or null if not stated.' },
      sodium_pct: { type: ['number', 'null'], description: 'Sodium %, or null if not stated.' },
      calcium_pct: { type: ['number', 'null'], description: 'Calcium %, or null if not stated.' },
    },
    required: ['ingredients'],
  },
};

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

export interface SubmitBackfillResult {
  batch_id: string | null;
  candidates: number;
  pages_fetched: number;
  manifest: BackfillManifestEntry[];
}

/**
 * Phase 1: fetch each candidate's product page and submit one Haiku extraction
 * request per food as a single Message Batch. Returns the batch id + manifest;
 * the manifest is persisted to `batch_submissions` so the process step can run
 * from a bodyless cron call, matching foodDiscovery's pattern.
 */
export async function submitIngredientBackfill(limit?: number): Promise<SubmitBackfillResult> {
  const candidates = await getBackfillCandidates(limit);
  const requests: BatchRequestItem[] = [];
  const manifest: BackfillManifestEntry[] = [];

  const model = process.env.ANTHROPIC_HAIKU_MODEL || 'claude-haiku-4-5-20251001';

  for (const [index, candidate] of candidates.entries()) {
    const text = await fetchPageText(candidate.source_url);
    if (!text) continue;

    const customId = `backfill-${index}-${candidate.id.slice(0, 8)}`;
    manifest.push({ custom_id: customId, food_id: candidate.id, url: candidate.source_url });
    requests.push({
      custom_id: customId,
      params: {
        model,
        max_tokens: 2048,
        system: SYSTEM_PROMPT,
        messages: [
          {
            role: 'user',
            content:
              `Product page for "${candidate.brand} ${candidate.name}" (${candidate.source_url}).\n\n` +
              `Extract the full ingredient list and any guaranteed-analysis figures.\n\n${text}`,
          },
        ],
        tools: [BACKFILL_TOOL],
        tool_choice: { type: 'tool', name: BACKFILL_TOOL.name },
      },
    });
  }

  if (requests.length === 0) {
    return { batch_id: null, candidates: candidates.length, pages_fetched: 0, manifest: [] };
  }

  const batch = await createMessageBatch(requests);

  await supabaseAdmin.from('batch_submissions').insert({
    batch_id: batch.id,
    manifest,
    status: 'submitted',
  });

  return {
    batch_id: batch.id,
    candidates: candidates.length,
    pages_fetched: requests.length,
    manifest,
  };
}

export interface ProcessBackfillResult {
  batch_id: string;
  status: string;
  foods_updated: number;
  ingredients_written: number;
  nutrients_filled: number;
  skipped_no_ingredients: number;
}

/**
 * Phase 2: read a completed batch's results and write them.
 *
 * - Ingredients replace the food's existing rows (delete-then-insert) ONLY when
 *   the extraction returned a non-empty list, so an empty/failed extraction
 *   never destroys data.
 * - Nutrients fill NULL columns only; existing values are left alone.
 */
export async function processIngredientBackfill(
  batchId: string,
  manifest: BackfillManifestEntry[],
): Promise<ProcessBackfillResult> {
  const batch = await getBatchStatus(batchId);
  if (batch.processing_status !== 'ended') {
    return {
      batch_id: batchId,
      status: batch.processing_status,
      foods_updated: 0,
      ingredients_written: 0,
      nutrients_filled: 0,
      skipped_no_ingredients: 0,
    };
  }

  const results = await getBatchResults(batch);
  const byCustomId = new Map(manifest.map((m) => [m.custom_id, m]));

  let foodsUpdated = 0;
  let ingredientsWritten = 0;
  let nutrientsFilled = 0;
  let skipped = 0;

  for (const line of results) {
    const entry = byCustomId.get(line.custom_id);
    if (!entry) continue;

    const input = extractToolInput(line);
    if (!input) {
      skipped += 1;
      continue;
    }

    const ingredients = Array.isArray(input.ingredients)
      ? (input.ingredients as unknown[])
          .filter((i): i is string => typeof i === 'string' && i.trim() !== '')
          .map((i) => i.trim())
      : [];

    if (ingredients.length === 0) {
      skipped += 1;
    } else {
      await supabaseAdmin.from('food_ingredients').delete().eq('food_id', entry.food_id);
      const rows = ingredients.map((ingredient_name, position) => ({
        food_id: entry.food_id,
        ingredient_name,
        ingredient_category: null,
        position_in_list: position + 1,
      }));
      const { error: insertError } = await supabaseAdmin.from('food_ingredients').insert(rows);
      if (!insertError) {
        ingredientsWritten += rows.length;
        foodsUpdated += 1;
      }
    }

    // Fill only NULL nutrient columns.
    const { data: current } = await supabaseAdmin
      .from('foods')
      .select(NUTRIENT_COLUMNS.join(', '))
      .eq('id', entry.food_id)
      .maybeSingle();

    if (current) {
      const currentRow = current as unknown as Record<string, number | null>;
      const patch: Record<string, number> = {};
      for (const column of NUTRIENT_COLUMNS) {
        const extracted = input[column];
        if (currentRow[column] == null && typeof extracted === 'number' && Number.isFinite(extracted)) {
          patch[column] = extracted;
        }
      }
      if (Object.keys(patch).length > 0) {
        const { error: updateError } = await supabaseAdmin
          .from('foods')
          .update({ ...patch, updated_at: new Date().toISOString() })
          .eq('id', entry.food_id);
        if (!updateError) nutrientsFilled += Object.keys(patch).length;
      }
    }
  }

  await supabaseAdmin
    .from('batch_submissions')
    .update({
      status: 'processed',
      completed_at: new Date().toISOString(),
      result_summary: {
        foods_updated: foodsUpdated,
        ingredients_written: ingredientsWritten,
        nutrients_filled: nutrientsFilled,
        skipped_no_ingredients: skipped,
      },
    })
    .eq('batch_id', batchId);

  return {
    batch_id: batchId,
    status: 'ended',
    foods_updated: foodsUpdated,
    ingredients_written: ingredientsWritten,
    nutrients_filled: nutrientsFilled,
    skipped_no_ingredients: skipped,
  };
}
