import { validateScrapedGtin } from '../gtin';
import { findCompositionExcerptInHtml } from './compositionFinder';

/**
 * Tier 1 (spec §"Fetch tiers, cheapest first"): Shopify's public
 * /products.json endpoint returns the whole catalogue — SKUs, variants,
 * barcodes — no HTML parsing, no model call. Cheap identity harvest.
 *
 * Known limitation, called out explicitly in the spec (verified against
 * lilyskitchen.co.uk): body_html frequently does NOT carry the composition/
 * ingredients text. This adapter gives identity (brand, product name, pack
 * size, GTIN) cheaply; it does not assume ingredients will be present, and
 * only produces a composition candidate when one is actually found.
 */

export interface ShopifyVariant {
  id: number;
  title: string;
  sku: string | null;
  price: string | null;
  barcode: string | null;
  grams: number | null;
  available: boolean | null;
  option1: string | null;
  option2: string | null;
  option3: string | null;
}

export interface ShopifyProduct {
  id: number;
  title: string;
  handle: string;
  vendor: string | null;
  body_html: string | null;
  variants: ShopifyVariant[];
}

export interface ShopifyProductsResponse {
  products: ShopifyProduct[];
}

/** Runtime shape guard — the probe and the paginator both depend on this, not just a 200 status. */
export function isShopifyProductsResponse(json: unknown): json is ShopifyProductsResponse {
  if (!json || typeof json !== 'object') return false;
  const products = (json as { products?: unknown }).products;
  if (!Array.isArray(products)) return false;
  return products.every(
    (p) =>
      p &&
      typeof p === 'object' &&
      typeof (p as { id?: unknown }).id === 'number' &&
      typeof (p as { title?: unknown }).title === 'string' &&
      typeof (p as { handle?: unknown }).handle === 'string' &&
      Array.isArray((p as { variants?: unknown }).variants)
  );
}

/** A URL fetcher abstraction matching PolicyFetcher.fetch's shape, so this adapter is testable without a real PolicyFetcher. */
export type UrlFetcher = (url: string) => Promise<{ ok: boolean; body?: string; error?: string }>;

export function shopifyProductsUrl(domain: string, page: number, limit = 250): string {
  return `https://${domain}/products.json?limit=${limit}&page=${page}`;
}

/** True if the domain's /products.json returns a recognisably-Shopify shape. */
export async function probeIsShopify(domain: string, fetchUrl: UrlFetcher): Promise<boolean> {
  const result = await fetchUrl(shopifyProductsUrl(domain, 1, 1));
  if (!result.ok || !result.body) return false;
  try {
    const json = JSON.parse(result.body);
    return isShopifyProductsResponse(json);
  } catch {
    return false;
  }
}

export interface FetchAllShopifyProductsOptions {
  limit?: number;
  /** Hard cap on pages fetched, so a misbehaving store can't cause an unbounded crawl. */
  maxPages?: number;
}

export interface FetchAllShopifyProductsResult {
  products: ShopifyProduct[];
  pagesFetched: number;
  stoppedReason: 'empty_page' | 'short_page' | 'repeated_page' | 'max_pages_reached' | 'fetch_failed';
}

/** Stable key for a page's product-ID set, order-independent — a store that reshuffles but repeats the same IDs still counts as a loop. */
function pageIdKey(products: ShopifyProduct[]): string {
  return products
    .map((p) => p.id)
    .sort((a, b) => a - b)
    .join(',');
}

/**
 * Paginates /products.json until one of: an empty page, a short page (fewer
 * than `limit` results — the natural last-page signal), a repeated page
 * (same product-ID set as the immediately preceding page), or maxPages.
 *
 * The repeat guard exists because Shopify deprecated `page` on this
 * endpoint in favour of cursor pagination, and behaviour on stores that
 * still serve it varies — some silently return page 1's content forever
 * rather than erroring. Without this, a small store can turn into an
 * unbounded, duplicate-heavy crawl.
 */
export async function fetchAllShopifyProducts(
  domain: string,
  fetchUrl: UrlFetcher,
  options: FetchAllShopifyProductsOptions = {}
): Promise<FetchAllShopifyProductsResult> {
  const limit = options.limit ?? 250;
  const maxPages = options.maxPages ?? 10;
  const products: ShopifyProduct[] = [];
  let previousPageKey: string | null = null;

  for (let page = 1; page <= maxPages; page++) {
    const result = await fetchUrl(shopifyProductsUrl(domain, page, limit));
    if (!result.ok || !result.body) {
      return { products, pagesFetched: page - 1, stoppedReason: 'fetch_failed' };
    }

    let json: unknown;
    try {
      json = JSON.parse(result.body);
    } catch {
      return { products, pagesFetched: page - 1, stoppedReason: 'fetch_failed' };
    }
    if (!isShopifyProductsResponse(json)) {
      return { products, pagesFetched: page - 1, stoppedReason: 'fetch_failed' };
    }

    if (json.products.length === 0) {
      return { products, pagesFetched: page - 1, stoppedReason: 'empty_page' };
    }

    const currentPageKey = pageIdKey(json.products);
    if (previousPageKey !== null && currentPageKey === previousPageKey) {
      return { products, pagesFetched: page - 1, stoppedReason: 'repeated_page' };
    }

    products.push(...json.products);

    if (json.products.length < limit) {
      return { products, pagesFetched: page, stoppedReason: 'short_page' };
    }

    previousPageKey = currentPageKey;
  }

  return { products, pagesFetched: maxPages, stoppedReason: 'max_pages_reached' };
}

// Multipack must be checked FIRST and matched as one unit. "6 x 180g" is not
// "180g" — reporting the per-unit weight alone states a real number that is
// wrong for the pack (180g instead of 1,080g), which is worse than reporting
// nothing. Same rule as inclusion_pct: never record a number that wasn't
// printed as such.
const MULTIPACK_RE = /\b(\d+)\s?[x×]\s?(\d+(?:\.\d+)?)\s?(kg|g|lb|oz|ml|l)\b/i;
const SINGLE_SIZE_RE = /\b(\d+(?:\.\d+)?)\s?(kg|g|lb|oz|ml|l)\b/i;

/**
 * Best-effort pack size from a variant's title/options — verbatim from the
 * printed text, never inferred or computed. A multipack ("6 x 180g") is
 * captured whole as "6x180g"; if a multiplier is present but this pattern
 * doesn't confidently match both the count and the per-unit size, this
 * returns null rather than falling back to a bare per-unit reading that
 * would misstate the pack.
 */
export function extractPackSize(variant: ShopifyVariant): string | null {
  const candidates = [variant.title, variant.option1, variant.option2, variant.option3].filter(
    (v): v is string => typeof v === 'string' && v.trim() !== '' && v.trim().toLowerCase() !== 'default title'
  );

  for (const candidate of candidates) {
    const multipack = candidate.match(MULTIPACK_RE);
    if (multipack) return `${multipack[1]}x${multipack[2]}${multipack[3].toLowerCase()}`;
  }

  // Only fall back to a single-size reading on a candidate that doesn't
  // ALSO contain an unmatched multiplier token (e.g. "Pack of 6, 180g each"
  // — MULTIPACK_RE's specific "N x SIZE" shape didn't match, but a bare
  // "180g" here would still misstate the total). A loose "\d+\s*(pack|x)\b"
  // check catches that without trying to parse it.
  const MULTIPLIER_HINT_RE = /\d+\s*[x×]\b|\bpack\s+of\s+\d+\b|\d+\s*-?pack\b/i;
  for (const candidate of candidates) {
    if (MULTIPLIER_HINT_RE.test(candidate)) continue;
    const single = candidate.match(SINGLE_SIZE_RE);
    if (single) return `${single[1]}${single[2].toLowerCase()}`;
  }
  return null;
}

export interface CrawlTargetCandidate {
  brand: string;
  product_name: string;
  pack_size: string | null;
  gtin: string | null;
  /** Manufacturer/retailer SKU — the secondary identity anchor where GTIN is absent (see shopifyHarvest.ts docblock). */
  sku: string | null;
  source_domain: string;
  source_url: string;
}

/**
 * Builds the display name, dropping a variant title suffix that's already
 * present in the base product title — e.g. product "2kg Lightly Baked Lamb
 * Dry Dog Food" + variant title "2kg" should read as "2kg Lightly Baked
 * Lamb Dry Dog Food", not "...— 2kg" repeating the size a second time.
 */
function buildProductName(productTitle: string, variantTitle: string | null): string {
  const title = productTitle.trim();
  if (!variantTitle) return title;
  const isRedundant = title.toLowerCase().includes(variantTitle.toLowerCase());
  return isRedundant ? title : `${title} — ${variantTitle}`;
}

/** One identity candidate per variant — a pack size or recipe is a distinct real-world product, not a duplicate of its siblings. */
export function extractIdentityCandidates(product: ShopifyProduct, domain: string): CrawlTargetCandidate[] {
  const brand = (product.vendor ?? '').trim();
  const sourceUrl = `https://${domain}/products/${product.handle}`;

  if (product.variants.length === 0) {
    return [
      {
        brand,
        product_name: product.title.trim(),
        pack_size: null,
        gtin: null,
        sku: null,
        source_domain: domain,
        source_url: sourceUrl,
      },
    ];
  }

  return product.variants.map((variant) => {
    const packSize = extractPackSize(variant);
    const variantTitle =
      variant.title && variant.title.trim().toLowerCase() !== 'default title' ? variant.title.trim() : null;
    const sku = variant.sku && variant.sku.trim() !== '' ? variant.sku.trim() : null;
    return {
      brand,
      product_name: buildProductName(product.title, variantTitle),
      pack_size: packSize,
      gtin: validateScrapedGtin(variant.barcode),
      sku,
      source_domain: domain,
      source_url: sourceUrl,
    };
  });
}

/**
 * Looks for a composition/ingredients block in body_html. Returns null far
 * more often than not — Tier 1 is an identity source, not an ingredients
 * source (see the module docblock). When found, the excerpt is the verbatim
 * text from the heading onward, capped, for a reviewer to diff against —
 * never pre-parsed here, that's parse_composition's job downstream.
 */
export function extractCompositionCandidate(product: ShopifyProduct): { excerpt: string } | null {
  if (!product.body_html) return null;
  return findCompositionExcerptInHtml(product.body_html);
}
