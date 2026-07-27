import { supabaseAdmin } from '../supabase';
import { PolicyFetcher } from './policyFetcher';
import { normalizeDomain } from './allowlist';
import { walkSitemap, type WalkSitemapResult } from './sitemapAdapter';
import { extractProductsFromJsonLd, type JsonLdProduct } from './jsonLd';
import { findCompositionExcerptInHtml } from './compositionFinder';

/**
 * Tier 2: sitemap + JSON-LD, for non-Shopify domains (fish4dogs.com,
 * emea.acana.com, and eventually Zooplus/Viovet if permission is granted).
 * Same write boundary as Tier 1: crawl_targets for identity,
 * contributed_foods for anything with a composition excerpt. Never foods
 * or food_ingredients.
 */

export interface Tier2ProductResult {
  pageUrl: string;
  jsonLdProduct: JsonLdProduct | null;
  compositionExcerpt: string | null;
}

export interface Tier2HarvestResult {
  domain: string;
  sitemapUrl: string;
  sitemapWalk: WalkSitemapResult;
  pagesFetched: number;
  pagesFailed: number;
  productsFoundViaJsonLd: number;
  productsWithGtin: number;
  compositionFound: number;
  crawlTargetsInserted: number;
  crawlTargetsSkippedExisting: number;
  contributedFoodsInserted: number;
  errors: string[];
}

async function crawlTargetExists(domain: string, sourceUrl: string, productName: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('crawl_targets')
    .select('id')
    .eq('source_domain', domain)
    .eq('source_url', sourceUrl)
    .eq('product_name', productName)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

/** Fetches every walked page and extracts JSON-LD Product data + composition excerpt. No writes — used by both the dry-run probe (Run 1) and the real harvest (Run 2). */
export async function fetchAndParsePages(
  urls: string[],
  fetcher: PolicyFetcher
): Promise<{ results: Tier2ProductResult[]; pagesFetched: number; pagesFailed: number; errors: string[] }> {
  const results: Tier2ProductResult[] = [];
  const errors: string[] = [];
  let pagesFetched = 0;
  let pagesFailed = 0;

  for (const pageUrl of urls) {
    const res = await fetcher.fetch(pageUrl);
    if (!res.ok || !res.body) {
      pagesFailed += 1;
      errors.push(`fetch failed for ${pageUrl}: ${res.error ?? 'no body'}`);
      continue;
    }
    pagesFetched += 1;

    const products = extractProductsFromJsonLd(res.body);
    const composition = findCompositionExcerptInHtml(res.body);

    if (products.length === 0) {
      results.push({ pageUrl, jsonLdProduct: null, compositionExcerpt: composition?.excerpt ?? null });
    } else {
      for (const product of products) {
        results.push({ pageUrl, jsonLdProduct: product, compositionExcerpt: composition?.excerpt ?? null });
      }
    }
  }

  return { results, pagesFetched, pagesFailed, errors };
}

export async function runTier2Harvest(
  rawDomain: string,
  sitemapUrl: string,
  fetcher: PolicyFetcher,
  options: {
    maxUrls?: number;
    /** Walk this many candidate URLs from the sitemap before filtering/sampling — useful when a site publishes one flat sitemap mixing categories/blog/products with no distinguishing path (see fish4dogs.com). Defaults to maxUrls (no separate walk budget). */
    walkUrls?: number;
    /** Site-specific page-selection heuristic, applied after the walk and before fetching. Never affects what gets written — only which pages are worth spending a fetch on. */
    filterUrls?: (urls: string[]) => string[];
  } = {}
): Promise<Tier2HarvestResult> {
  const domain = normalizeDomain(rawDomain);
  const errors: string[] = [];
  const maxUrls = options.maxUrls ?? 20;

  const fetchUrl = async (url: string) => {
    const r = await fetcher.fetch(url);
    return { ok: r.ok, body: r.body, error: r.error };
  };

  const sitemapWalk = await walkSitemap(sitemapUrl, fetchUrl, { maxUrls: options.walkUrls ?? maxUrls });
  errors.push(...sitemapWalk.errors);

  const candidateUrls = options.filterUrls ? options.filterUrls(sitemapWalk.urls) : sitemapWalk.urls;
  const urlsToFetch = candidateUrls.slice(0, maxUrls);

  const { results, pagesFetched, pagesFailed, errors: fetchErrors } = await fetchAndParsePages(urlsToFetch, fetcher);
  errors.push(...fetchErrors);

  let productsFoundViaJsonLd = 0;
  let productsWithGtin = 0;
  let compositionFound = 0;
  let crawlTargetsInserted = 0;
  let crawlTargetsSkippedExisting = 0;
  let contributedFoodsInserted = 0;

  for (const result of results) {
    if (result.jsonLdProduct) {
      productsFoundViaJsonLd += 1;
      const p = result.jsonLdProduct;
      if (p.gtin) productsWithGtin += 1;

      const productName = p.name ?? result.pageUrl;
      try {
        if (!(await crawlTargetExists(domain, result.pageUrl, productName))) {
          const { error } = await supabaseAdmin.from('crawl_targets').insert({
            brand: p.brand,
            product_name: productName,
            pack_size: null, // Tier 2 JSON-LD Product schema has no standard pack-size field; never guessed from name text.
            gtin: p.gtin,
            sku: p.sku ?? p.mpn,
            source_domain: domain,
            source_url: result.pageUrl,
            status: 'new',
          });
          if (error) throw error;
          crawlTargetsInserted += 1;
        } else {
          crawlTargetsSkippedExisting += 1;
        }
      } catch (err) {
        errors.push(`crawl_targets insert failed for ${productName}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }

    if (result.compositionExcerpt) {
      compositionFound += 1;
      try {
        const { error } = await supabaseAdmin.from('contributed_foods').insert({
          brand: result.jsonLdProduct?.brand ?? '',
          name: result.jsonLdProduct?.name ?? result.pageUrl,
          source_url: result.pageUrl,
          composition_raw: result.compositionExcerpt,
          payload: {
            source_excerpt: result.compositionExcerpt,
            harvested_by: 'tier2_sitemap_jsonld_adapter',
            harvested_at: new Date().toISOString(),
          },
          contributor_label: 'tier2-adapter',
          status: 'pending',
        });
        if (error) throw error;
        contributedFoodsInserted += 1;
      } catch (err) {
        errors.push(`contributed_foods insert failed for ${result.pageUrl}: ${err instanceof Error ? err.message : String(err)}`);
      }
    }
  }

  return {
    domain,
    sitemapUrl,
    sitemapWalk,
    pagesFetched,
    pagesFailed,
    productsFoundViaJsonLd,
    productsWithGtin,
    compositionFound,
    crawlTargetsInserted,
    crawlTargetsSkippedExisting,
    contributedFoodsInserted,
    errors,
  };
}
