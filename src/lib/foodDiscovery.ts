import { supabaseAdmin } from './supabase';
import { findDuplicateFood } from './foodDuplicates';
import { FoodType } from './types';
import {
  BatchRequestItem,
  createMessageBatch,
  extractToolInput,
  getBatchResults,
  getBatchStatus,
  MessageBatch,
} from './batchApiHelper';

/**
 * Weekly food discovery job (Phase 6, architecture doc §11, Tier 1 per §7).
 *
 * Two-phase design, split across two API routes because the Batch API is
 * async (processing can take up to ~24h):
 *   1. submitDiscoveryBatch() — crawl approved domains for candidate product
 *      pages, build a batch manifest, submit it to the Batch API, return the
 *      batch id + manifest.
 *   2. processDiscoveryBatch() — once the batch has ended, fetch results,
 *      dedupe-check + required-field-check each candidate, and insert
 *      directly into foods/food_ingredients (Tier 1 — no review queue, per
 *      architecture doc §7).
 *
 * **Batch tracking (previously flagged gap, now fixed):** submitDiscoveryBatch()
 * persists {batch_id, manifest, status} to `batch_submissions` immediately
 * after the batch is created; processDiscoveryBatch() reads the manifest back
 * from that table instead of requiring the caller to hold onto the submit
 * route's response body. getPendingBatchSubmissions() lets the process route
 * discover and process every outstanding batch on its own (needed because a
 * cron-triggered GET request has no body to carry a batch_id/manifest in at
 * all — the previous design could only be driven manually via POST).
 *
 * **Flagged deviation from "Haiku vision":** the spec says extraction should
 * use "Haiku vision... against web pages," mirroring Phase 5's OCR. Actually
 * rendering a web page to an image would require a headless browser
 * (Playwright/Puppeteer or a screenshot service) — a heavy native dependency
 * in the same risk category Phase 5 explicitly avoided for EXIF-stripping
 * (BUILD_PROGRESS.md Phase 5 deviation #1: prior phases repeatedly hit
 * npm-install corruption in this sandbox from native deps). Implemented as
 * text extraction instead: fetch the page HTML, strip tags to plain text,
 * and run it through the same Haiku model via tool-use structured output
 * (functionally equivalent structured extraction — the "vision" part was
 * about handling unstructured/laid-out content Haiku can't get from a raw
 * DOM query selector, and plain rendered text serves the same purpose for
 * most brand product pages). If true screenshot-based vision is required
 * (e.g. pages that render ingredients only via JS/canvas), swap in a
 * headless-browser screenshot step here and pass `type: 'image'` content
 * parts instead of text, same shape as ingredientOcr.ts's Phase 5 call.
 */

const HAIKU_MODEL = process.env.ANTHROPIC_HAIKU_MODEL || 'claude-haiku-4-5-20251001';
const MAX_PAGES_PER_DOMAIN = 5;
const MAX_PAGE_TEXT_CHARS = 6000;
const VALID_FOOD_TYPES: FoodType[] = ['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other'];

export interface DomainAllowlistEntry {
  id: string;
  domain: string;
  approved: boolean;
  robots_txt_checked_at: string | null;
  tos_reviewed_at: string | null;
  notes: string | null;
}

export async function getApprovedDomains(): Promise<DomainAllowlistEntry[]> {
  const { data, error } = await supabaseAdmin
    .from('source_domain_allowlist')
    .select('*')
    .eq('approved', true);

  if (error) throw error;
  return (data ?? []) as DomainAllowlistEntry[];
}

/**
 * Best-effort product-page discovery: fetch the domain's homepage and pull
 * out same-domain links whose path looks product-like. This is a heuristic,
 * not a real crawler (no sitemap parsing, no pagination, no JS rendering) —
 * matches the phase note: "Phase 6 focuses on the job structure, not the
 * full scraping compliance suite." robots.txt/ToS compliance checking is
 * NOT implemented here either (those are the `robots_txt_checked_at`/
 * `tos_reviewed_at` columns' job, to be filled in by a manual/legal review
 * step before a domain is marked `approved=true` in the first place — this
 * function trusts that gate rather than re-checking robots.txt itself).
 */
async function discoverProductPageUrls(domain: string): Promise<string[]> {
  const homepageUrl = `https://${domain}/`;
  try {
    const res = await fetch(homepageUrl, { headers: { 'user-agent': 'DogFoodHelperBot/1.0' } });
    if (!res.ok) return [];
    const html = await res.text();

    const hrefRegex = /href=["']([^"'#]+)["']/gi;
    const found = new Set<string>();
    let match: RegExpExecArray | null;
    while ((match = hrefRegex.exec(html)) !== null) {
      let href = match[1];
      if (href.startsWith('//')) href = `https:${href}`;
      if (href.startsWith('/')) href = `https://${domain}${href}`;
      if (!href.startsWith('http')) continue;

      let url: URL;
      try {
        url = new URL(href);
      } catch {
        continue;
      }
      if (url.hostname.replace(/^www\./, '') !== domain.replace(/^www\./, '')) continue;

      const path = url.pathname.toLowerCase();
      if (/(product|dog-food|foods?|shop)/.test(path)) {
        found.add(url.toString());
      }
      if (found.size >= MAX_PAGES_PER_DOMAIN) break;
    }
    return Array.from(found).slice(0, MAX_PAGES_PER_DOMAIN);
  } catch (err) {
    console.error(`discoverProductPageUrls: failed to fetch ${homepageUrl}`, err);
    return [];
  }
}

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

const EXTRACTION_TOOL = {
  name: 'extract_food_product',
  description:
    'Extract structured dog food product data from a brand product page, if the page text describes a specific dog food product.',
  input_schema: {
    type: 'object',
    properties: {
      is_product_page: {
        type: 'boolean',
        description: 'True only if this page text actually describes one specific dog food product for sale.',
      },
      brand: { type: 'string', description: 'Brand name, or empty string if not determinable.' },
      name: { type: 'string', description: 'Specific product/variety name, or empty string if not determinable.' },
      food_type: {
        type: 'string',
        enum: ['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other', ''],
        description: 'Best-judgement classification of the food type from the page text, or empty string if truly indeterminable.',
      },
      ingredients: {
        type: 'array',
        items: { type: 'string' },
        description: 'Ingredient list in the order given on the page, most prevalent first. Empty array if no ingredient list is present.',
      },
      suitable_age_min_months: { type: ['number', 'null'], description: 'Minimum suitable age in months, or null if not stated.' },
      suitable_age_max_months: { type: ['number', 'null'], description: 'Maximum suitable age in months, or null if not stated.' },
      suitable_size_min: { type: 'string', enum: ['toy', 'small', 'medium', 'large', 'giant', ''], description: 'Minimum suitable size category, or empty string if not stated.' },
      suitable_size_max: { type: 'string', enum: ['toy', 'small', 'medium', 'large', 'giant', ''], description: 'Maximum suitable size category, or empty string if not stated.' },
      price_per_kg: { type: ['number', 'null'], description: 'Price per kg in GBP if it can be computed/read from the page, or null.' },
      calories_per_kg: { type: ['number', 'null'], description: 'Calories per kg if stated on the page, or null.' },
    },
    required: ['is_product_page', 'brand', 'name', 'food_type', 'ingredients'],
  },
};

interface DiscoveryManifestEntry {
  custom_id: string;
  domain: string;
  url: string;
}

export interface SubmitDiscoveryResult {
  batch_id: string;
  domains_checked: number;
  candidate_pages_found: number;
  manifest: DiscoveryManifestEntry[];
}

interface BatchSubmissionRow {
  id: string;
  batch_id: string;
  manifest: DiscoveryManifestEntry[];
  status: string;
  created_at: string;
  completed_at: string | null;
  result_summary: unknown;
}

/** Every batch_submissions row not yet marked processed/failed — the process
 * route uses this to discover outstanding batches without needing a caller
 * to supply batch_id/manifest (e.g. a cron-triggered GET with no body). */
export async function getPendingBatchSubmissions(): Promise<BatchSubmissionRow[]> {
  const { data, error } = await supabaseAdmin
    .from('batch_submissions')
    .select('*')
    .in('status', ['submitted', 'in_progress']);

  if (error) throw error;
  return (data ?? []) as BatchSubmissionRow[];
}

/**
 * Phase 1 of the discovery job: crawl approved domains for candidate pages,
 * fetch + strip each to text, build one Batch API request per page, submit
 * the batch, and return its id + the domain/url manifest (see file header —
 * no tracking table exists yet, so the caller must retain this manifest for
 * the later process step).
 */
export async function submitDiscoveryBatch(): Promise<SubmitDiscoveryResult> {
  const domains = await getApprovedDomains();
  const manifest: DiscoveryManifestEntry[] = [];
  const requests: BatchRequestItem[] = [];

  let pageIndex = 0;
  for (const entry of domains) {
    const urls = await discoverProductPageUrls(entry.domain);
    for (const url of urls) {
      let pageText: string;
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'DogFoodHelperBot/1.0' } });
        if (!res.ok) continue;
        pageText = stripHtmlToText(await res.text());
        if (pageText.length < 50) continue; // near-empty page, not worth a batch request
      } catch (err) {
        console.error(`submitDiscoveryBatch: failed to fetch ${url}`, err);
        continue;
      }

      const customId = `req-${pageIndex}`;
      pageIndex += 1;
      manifest.push({ custom_id: customId, domain: entry.domain, url });
      requests.push({
        custom_id: customId,
        params: {
          model: HAIKU_MODEL,
          max_tokens: 1024,
          system:
            'You extract structured dog food product data from raw web page text for a decision-support tool. Only report fields you can actually read from the text — never guess or invent a value. If the page does not describe a specific dog food product, set is_product_page to false and leave other fields empty.',
          messages: [{ role: 'user', content: `Page URL: ${url}\n\nPage text:\n${pageText}` }],
          tools: [EXTRACTION_TOOL],
          tool_choice: { type: 'tool', name: 'extract_food_product' },
        },
      });
    }
  }

  console.log(
    `[food-discovery] domains checked: ${domains.length}, candidate pages found: ${manifest.length}`
  );

  if (requests.length === 0) {
    return { batch_id: '', domains_checked: domains.length, candidate_pages_found: 0, manifest: [] };
  }

  const batch = await createMessageBatch(requests);
  console.log(`[food-discovery] submitted batch ${batch.id} with ${requests.length} requests`);

  const { error: trackingError } = await supabaseAdmin.from('batch_submissions').insert({
    batch_id: batch.id,
    manifest,
    status: 'submitted',
  });
  if (trackingError) {
    // Don't fail the whole submission over a tracking-row insert failure —
    // the batch has already been created on Anthropic's side and the response
    // below still carries the manifest for a manual fallback. Log loudly so
    // it isn't silently lost.
    console.error(`[food-discovery] failed to persist batch_submissions row for ${batch.id}`, trackingError);
  }

  return {
    batch_id: batch.id,
    domains_checked: domains.length,
    candidate_pages_found: manifest.length,
    manifest,
  };
}

export interface ProcessDiscoveryResult {
  batch_status: MessageBatch['processing_status'];
  candidates_seen: number;
  duplicates_skipped: number;
  missing_required_fields_skipped: number;
  not_product_page_skipped: number;
  inserted: number;
  inserted_food_ids: string[];
}

/**
 * Phase 2 of the discovery job: given a batch id, checks whether the batch
 * has ended; if so, fetches results, and for each successfully-extracted
 * product runs duplicate detection (Phase 5's findDuplicateFood, reused as-is)
 * + required-field checks, then inserts directly into foods/food_ingredients
 * (Tier 1 — no review queue, per architecture doc §7). If the batch hasn't
 * ended yet, returns early with batch_status so the caller can retry later.
 *
 * `manifest` is optional — if omitted, it's read back from the
 * `batch_submissions` row created by submitDiscoveryBatch(). Passing it
 * explicitly still works (backward-compatible) but is no longer required.
 * Updates the tracking row's status/result_summary/completed_at as a side
 * effect so getPendingBatchSubmissions() reflects reality afterward.
 */
export async function processDiscoveryBatch(
  batchId: string,
  manifest?: DiscoveryManifestEntry[]
): Promise<ProcessDiscoveryResult> {
  const batch = await getBatchStatus(batchId);
  const result: ProcessDiscoveryResult = {
    batch_status: batch.processing_status,
    candidates_seen: 0,
    duplicates_skipped: 0,
    missing_required_fields_skipped: 0,
    not_product_page_skipped: 0,
    inserted: 0,
    inserted_food_ids: [],
  };

  let resolvedManifest = manifest;
  if (!resolvedManifest) {
    const { data: row, error } = await supabaseAdmin
      .from('batch_submissions')
      .select('manifest')
      .eq('batch_id', batchId)
      .maybeSingle();
    if (error) throw error;
    if (!row) {
      throw new Error(
        `No batch_submissions row found for batch ${batchId} and no manifest was supplied — cannot process`
      );
    }
    resolvedManifest = row.manifest as DiscoveryManifestEntry[];
  }

  if (batch.processing_status !== 'ended') {
    await supabaseAdmin
      .from('batch_submissions')
      .update({ status: 'in_progress' })
      .eq('batch_id', batchId);
    return result;
  }

  const manifestById = new Map(resolvedManifest.map((m) => [m.custom_id, m]));
  const lines = await getBatchResults(batch);

  for (const line of lines) {
    result.candidates_seen += 1;
    const manifestEntry = manifestById.get(line.custom_id);
    const input = extractToolInput(line);
    if (!input) {
      console.error(`[food-discovery] no tool output for ${line.custom_id} (${manifestEntry?.url})`);
      continue;
    }

    if (input.is_product_page !== true) {
      result.not_product_page_skipped += 1;
      continue;
    }

    const brand = typeof input.brand === 'string' ? input.brand.trim() : '';
    const name = typeof input.name === 'string' ? input.name.trim() : '';
    const foodType = typeof input.food_type === 'string' ? input.food_type.trim() : '';

    if (!brand || !name || !VALID_FOOD_TYPES.includes(foodType as FoodType)) {
      result.missing_required_fields_skipped += 1;
      continue;
    }

    const duplicate = await findDuplicateFood(brand, name);
    if (duplicate) {
      result.duplicates_skipped += 1;
      continue;
    }

    const ingredients = Array.isArray(input.ingredients) ? (input.ingredients as string[]) : [];
    const suitableSizeMin = typeof input.suitable_size_min === 'string' && input.suitable_size_min ? input.suitable_size_min : null;
    const suitableSizeMax = typeof input.suitable_size_max === 'string' && input.suitable_size_max ? input.suitable_size_max : null;

    const { data: newFood, error: foodError } = await supabaseAdmin
      .from('foods')
      .insert({
        brand,
        name,
        food_type: foodType,
        suitable_age_min_months: input.suitable_age_min_months ?? null,
        suitable_age_max_months: input.suitable_age_max_months ?? null,
        suitable_size_min: suitableSizeMin,
        suitable_size_max: suitableSizeMax,
        price_per_kg: input.price_per_kg ?? null,
        calories_per_kg: input.calories_per_kg ?? null,
        source_url: manifestEntry?.url ?? null,
        source_domain: manifestEntry?.domain ?? null,
        last_verified_at: new Date().toISOString(),
      })
      .select()
      .single();

    if (foodError || !newFood) {
      console.error('[food-discovery] insert failed', foodError);
      continue;
    }

    if (ingredients.length > 0) {
      const ingredientRows = ingredients.map((ingredient_name, index) => ({
        food_id: newFood.id,
        ingredient_name,
        ingredient_category: null,
        position_in_list: index + 1,
      }));
      const { error: ingredientsError } = await supabaseAdmin.from('food_ingredients').insert(ingredientRows);
      if (ingredientsError) {
        console.error(`[food-discovery] food_ingredients insert failed for ${newFood.id}`, ingredientsError);
      }
    }

    result.inserted += 1;
    result.inserted_food_ids.push(newFood.id);
  }

  console.log(
    `[food-discovery] processed batch ${batchId}: seen=${result.candidates_seen} duplicates=${result.duplicates_skipped} missing_fields=${result.missing_required_fields_skipped} not_product=${result.not_product_page_skipped} inserted=${result.inserted}`
  );

  await supabaseAdmin
    .from('batch_submissions')
    .update({
      status: 'processed',
      completed_at: new Date().toISOString(),
      result_summary: result,
    })
    .eq('batch_id', batchId);

  return result;
}
