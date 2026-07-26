import { generateObject } from 'ai';
import { z } from 'zod';
import { supabaseAdmin } from './supabase';
import { findDuplicateFood } from './foodDuplicates';
import { FoodType } from './types';

/**
 * Weekly food discovery job (Phase 6, architecture doc §11, Tier 1 per §7).
 *
 * ---------------------------------------------------------------------------
 * PROVIDER: Vercel AI Gateway ONLY. No ANTHROPIC_API_KEY anywhere (owner
 * decision, 2026-07-26 — the key is never needed in this platform).
 *
 * This job was previously TWO-PHASE because it used Anthropic's Message
 * Batches API, which is async (~24h): submit a batch, then process it later
 * from a second route. The Gateway has no batch endpoint — probed live across
 * six candidate paths in both Anthropic and OpenAI batch shapes, GET and POST,
 * all 404 (including /v1/files, which any OpenAI-style batch flow needs).
 *
 * So discovery is now SINGLE-PHASE: crawl, extract and insert in one run,
 * using ordinary Gateway calls with bounded concurrency. Simpler than the old
 * design — there is no in-flight batch to track, no manifest to persist and
 * reload, and no second cron route. The run is still recorded in
 * `batch_submissions` for auditability.
 *
 * Cost control: MAX_PAGES_PER_DOMAIN caps the crawl and MAX_PAGES_PER_RUN caps
 * the whole run, so a newly-approved domain list can't trigger an unbounded
 * spend. Each page is one Haiku call.
 * ---------------------------------------------------------------------------
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

/** Gateway model id ("provider/model"), never a raw dated Anthropic id. */
const HAIKU_MODEL = process.env.AI_GATEWAY_HAIKU_MODEL || 'anthropic/claude-haiku-4.5';
const MAX_PAGES_PER_DOMAIN = 5;
/** Hard cap on model calls per run — the spend control for this job. */
const MAX_PAGES_PER_RUN = 50;
/** Parallel Gateway calls. Background job; kept deliberately modest. */
const EXTRACTION_CONCURRENCY = 4;
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

/**
 * Structured-output schema for page extraction. Zod (for the AI SDK's
 * generateObject) rather than a hand-written Anthropic tool schema — the
 * Gateway path uses the SDK, not raw tool-use JSON.
 *
 * Every optional field is nullable and the model is told to use null rather
 * than guess: an invented price or calorie figure would silently become
 * "data" in the foods table.
 */
const ExtractionSchema = z.object({
  is_product_page: z
    .boolean()
    .describe('True only if this page text actually describes one specific dog food product for sale.'),
  brand: z.string().describe('Brand name, or empty string if not determinable.'),
  name: z.string().describe('Specific product/variety name, or empty string if not determinable.'),
  food_type: z
    .enum(['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other', ''])
    .describe('Best-judgement classification from the page text, or empty string if truly indeterminable.'),
  ingredients: z
    .array(z.string())
    .describe(
      'Ingredient list in the order given on the page, most prevalent first. Empty array if no ingredient list is present.'
    ),
  suitable_age_min_months: z
    .number()
    .nullable()
    .describe('Minimum suitable age in months, or null if not stated.'),
  suitable_age_max_months: z
    .number()
    .nullable()
    .describe('Maximum suitable age in months, or null if not stated.'),
  suitable_size_min: z
    .enum(['toy', 'small', 'medium', 'large', 'giant', ''])
    .describe('Minimum suitable size category, or empty string if not stated.'),
  suitable_size_max: z
    .enum(['toy', 'small', 'medium', 'large', 'giant', ''])
    .describe('Maximum suitable size category, or empty string if not stated.'),
  price_per_kg: z
    .number()
    .nullable()
    .describe('Price per kg in GBP if it can be read or computed from the page, or null.'),
  calories_per_kg: z
    .number()
    .nullable()
    .describe('Calories per kg if stated on the page, or null.'),
});

type ExtractionResult = z.infer<typeof ExtractionSchema>;

const EXTRACTION_SYSTEM =
  'You extract structured dog food product data from raw web page text for a decision-support tool. Only report fields you can actually read from the text — never guess or invent a value. If the page does not describe a specific dog food product, set is_product_page to false and leave the other fields empty.';

interface DiscoveryCandidate {
  domain: string;
  url: string;
  pageText: string;
}

export interface RunDiscoveryResult {
  run_id: string;
  domains_checked: number;
  candidate_pages_found: number;
  candidates_seen: number;
  extraction_failed: number;
  duplicates_skipped: number;
  missing_required_fields_skipped: number;
  not_product_page_skipped: number;
  inserted: number;
  inserted_food_ids: string[];
  model: string;
}

/** True when Gateway auth is available (API key locally, OIDC on Vercel). */
export function hasGatewayAuth(): boolean {
  return Boolean(process.env.AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}

/** Crawl approved domains and collect candidate pages, capped for cost. */
async function collectCandidates(): Promise<{
  candidates: DiscoveryCandidate[];
  domainsChecked: number;
}> {
  const domains = await getApprovedDomains();
  const candidates: DiscoveryCandidate[] = [];

  for (const entry of domains) {
    if (candidates.length >= MAX_PAGES_PER_RUN) break;
    const urls = await discoverProductPageUrls(entry.domain);
    for (const url of urls) {
      if (candidates.length >= MAX_PAGES_PER_RUN) break;
      try {
        const res = await fetch(url, { headers: { 'user-agent': 'DogFoodHelperBot/1.0' } });
        if (!res.ok) continue;
        const pageText = stripHtmlToText(await res.text());
        if (pageText.length < 50) continue; // near-empty page, not worth a model call
        candidates.push({ domain: entry.domain, url, pageText });
      } catch (err) {
        console.error(`[food-discovery] failed to fetch ${url}`, err);
      }
    }
  }

  return { candidates, domainsChecked: domains.length };
}

/**
 * Insert one extracted product (Tier 1 — auto-merge after duplicate and
 * required-field checks, no review queue, per architecture doc §7).
 * Returns the new food id, or null when the candidate was rejected.
 */
async function insertExtractedFood(
  extracted: ExtractionResult,
  candidate: DiscoveryCandidate,
  result: RunDiscoveryResult
): Promise<string | null> {
  if (extracted.is_product_page !== true) {
    result.not_product_page_skipped += 1;
    return null;
  }

  const brand = extracted.brand.trim();
  const name = extracted.name.trim();
  const foodType = extracted.food_type.trim();

  if (!brand || !name || !VALID_FOOD_TYPES.includes(foodType as FoodType)) {
    result.missing_required_fields_skipped += 1;
    return null;
  }

  const duplicate = await findDuplicateFood(brand, name);
  if (duplicate) {
    result.duplicates_skipped += 1;
    return null;
  }

  const { data: newFood, error: foodError } = await supabaseAdmin
    .from('foods')
    .insert({
      brand,
      name,
      food_type: foodType,
      suitable_age_min_months: extracted.suitable_age_min_months,
      suitable_age_max_months: extracted.suitable_age_max_months,
      suitable_size_min: extracted.suitable_size_min || null,
      suitable_size_max: extracted.suitable_size_max || null,
      price_per_kg: extracted.price_per_kg,
      calories_per_kg: extracted.calories_per_kg,
      source_url: candidate.url,
      source_domain: candidate.domain,
      last_verified_at: new Date().toISOString(),
    })
    .select()
    .single();

  if (foodError || !newFood) {
    console.error('[food-discovery] insert failed', foodError);
    return null;
  }

  if (extracted.ingredients.length > 0) {
    const ingredientRows = extracted.ingredients
      .map((ingredient_name, index) => ({
        food_id: newFood.id,
        ingredient_name: ingredient_name.trim(),
        ingredient_category: null,
        position_in_list: index + 1,
      }))
      .filter((r) => r.ingredient_name.length > 0);

    if (ingredientRows.length > 0) {
      const { error: ingredientsError } = await supabaseAdmin
        .from('food_ingredients')
        .insert(ingredientRows);
      if (ingredientsError) {
        console.error(
          `[food-discovery] food_ingredients insert failed for ${newFood.id}`,
          ingredientsError
        );
      }
    }
  }

  return newFood.id as string;
}

/**
 * The whole discovery job in one run: crawl -> extract via the Gateway
 * (bounded concurrency) -> dedupe/validate -> insert. Replaces the old
 * submitDiscoveryBatch/processDiscoveryBatch pair, which only existed because
 * the Batch API was asynchronous.
 */
export async function runFoodDiscovery(): Promise<RunDiscoveryResult> {
  const runId = `gw-${Date.now()}`;
  const result: RunDiscoveryResult = {
    run_id: runId,
    domains_checked: 0,
    candidate_pages_found: 0,
    candidates_seen: 0,
    extraction_failed: 0,
    duplicates_skipped: 0,
    missing_required_fields_skipped: 0,
    not_product_page_skipped: 0,
    inserted: 0,
    inserted_food_ids: [],
    model: HAIKU_MODEL,
  };

  const { candidates, domainsChecked } = await collectCandidates();
  result.domains_checked = domainsChecked;
  result.candidate_pages_found = candidates.length;

  if (candidates.length === 0) {
    console.log('[food-discovery] no candidate pages found — nothing to extract');
    return result;
  }

  // Bounded concurrency: a fixed pool pulling from one cursor. Each candidate
  // is independent, and findDuplicateFood runs immediately before its own
  // insert, so two near-simultaneous extractions of the same product still
  // collapse to one row in practice.
  let cursor = 0;
  await Promise.all(
    Array.from({ length: Math.min(EXTRACTION_CONCURRENCY, candidates.length) }, async () => {
      while (cursor < candidates.length) {
        const candidate = candidates[cursor++];
        result.candidates_seen += 1;
        try {
          const { object } = await generateObject({
            model: HAIKU_MODEL,
            schema: ExtractionSchema,
            system: EXTRACTION_SYSTEM,
            prompt: `Page URL: ${candidate.url}\n\nPage text:\n${candidate.pageText}`,
          });
          const foodId = await insertExtractedFood(object, candidate, result);
          if (foodId) {
            result.inserted += 1;
            result.inserted_food_ids.push(foodId);
          }
        } catch (err) {
          // Never invent a product from a failed extraction — skip and log.
          result.extraction_failed += 1;
          console.error(`[food-discovery] extraction failed for ${candidate.url}`, err);
        }
      }
    })
  );

  console.log(
    `[food-discovery] run ${runId}: domains=${result.domains_checked} pages=${result.candidate_pages_found} ` +
      `inserted=${result.inserted} duplicates=${result.duplicates_skipped} ` +
      `missing_fields=${result.missing_required_fields_skipped} not_product=${result.not_product_page_skipped} ` +
      `failed=${result.extraction_failed}`
  );

  // Audit record. Reuses the existing batch_submissions table (no schema
  // change); `manifest` holds the pages actually considered this run.
  const { error: trackingError } = await supabaseAdmin.from('batch_submissions').insert({
    batch_id: runId,
    manifest: candidates.map((c) => ({ domain: c.domain, url: c.url })),
    status: 'processed',
    completed_at: new Date().toISOString(),
    result_summary: result,
  });
  if (trackingError) {
    console.error(`[food-discovery] failed to persist run record for ${runId}`, trackingError);
  }

  return result;
}
