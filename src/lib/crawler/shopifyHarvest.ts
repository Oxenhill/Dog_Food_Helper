import { supabaseAdmin } from '../supabase';
import { PolicyFetcher } from './policyFetcher';
import { isDomainCrawlable, normalizeDomain } from './allowlist';
import { DomainRateLimiter, ZOOPLUS_INTERVAL_MS } from './rateLimiter';
import { RawResponseCache } from './rawCache';
import { RobotsGate } from './robotsGate';
import {
  probeIsShopify,
  fetchAllShopifyProducts,
  extractIdentityCandidates,
  extractCompositionCandidate,
  type CrawlTargetCandidate,
} from './shopifyAdapter';

/**
 * Ties the fetch layer (allowlist + rate limit + cache + retry/hard-stop)
 * to the Shopify adapter and the two write paths Phase 2 is allowed:
 * `crawl_targets` for bare identity, `contributed_foods` for anything with
 * an actual composition excerpt attached. Never writes to `foods` or
 * `food_ingredients` — see the discovery-cron finding this session for why
 * that boundary is being taken seriously.
 */

export function buildDefaultFetcher(cacheDir: string): PolicyFetcher {
  return new PolicyFetcher({
    isDomainCrawlable,
    rateLimiter: new DomainRateLimiter({
      defaultIntervalMs: 2000,
      perDomainIntervalMs: { 'zooplus.co.uk': ZOOPLUS_INTERVAL_MS },
    }),
    cache: new RawResponseCache(cacheDir),
    // Live on every request from this point on, not just for Zooplus —
    // domain-level allowlist approval is a one-time human review; this is
    // the per-URL check that stays correct as a domain's robots.txt
    // changes, and becomes load-bearing once an adapter walks many paths
    // rather than one known-safe endpoint.
    robotsGate: new RobotsGate(),
  });
}

export interface ShopifyHarvestResult {
  domain: string;
  isShopify: boolean;
  pagesFetched: number;
  stoppedReason?: string;
  productsSeen: number;
  identityCandidates: number;
  /**
   * GTIN yield — logged explicitly rather than assumed. The probe run
   * against forthglade.com found 0/300 variants with a barcode, and an
   * independent check of lilyskitchen.co.uk found 0/266 too — both had a
   * SKU on every variant instead. Track this per-domain so future adapters
   * are planned around what a source actually delivers, not what the Tier 1
   * spec assumed generically.
   */
  variantsWithGtin: number;
  variantsWithSku: number;
  crawlTargetsInserted: number;
  crawlTargetsSkippedExisting: number;
  compositionCandidatesFound: number;
  contributedFoodsInserted: number;
  errors: string[];
}

async function crawlTargetExists(candidate: CrawlTargetCandidate): Promise<boolean> {
  const { data, error } = await supabaseAdmin
    .from('crawl_targets')
    .select('id')
    .eq('source_domain', candidate.source_domain)
    .eq('source_url', candidate.source_url)
    .eq('product_name', candidate.product_name)
    .limit(1);
  if (error) throw error;
  return (data?.length ?? 0) > 0;
}

export async function runShopifyIdentityHarvest(
  rawDomain: string,
  fetcher: PolicyFetcher,
  options: { maxPages?: number } = {}
): Promise<ShopifyHarvestResult> {
  const domain = normalizeDomain(rawDomain);
  const result: ShopifyHarvestResult = {
    domain,
    isShopify: false,
    pagesFetched: 0,
    productsSeen: 0,
    identityCandidates: 0,
    variantsWithGtin: 0,
    variantsWithSku: 0,
    crawlTargetsInserted: 0,
    crawlTargetsSkippedExisting: 0,
    compositionCandidatesFound: 0,
    contributedFoodsInserted: 0,
    errors: [],
  };

  const fetchUrl = async (url: string) => {
    const r = await fetcher.fetch(url);
    return { ok: r.ok, body: r.body, error: r.error };
  };

  result.isShopify = await probeIsShopify(domain, fetchUrl);
  if (!result.isShopify) {
    result.errors.push(`${domain} does not expose a Shopify /products.json — not a Tier 1 candidate.`);
    return result;
  }

  const { products, pagesFetched, stoppedReason } = await fetchAllShopifyProducts(domain, fetchUrl, {
    maxPages: options.maxPages ?? 10,
  });
  result.pagesFetched = pagesFetched;
  result.stoppedReason = stoppedReason;
  result.productsSeen = products.length;

  for (const product of products) {
    const identityCandidates = extractIdentityCandidates(product, domain);
    result.identityCandidates += identityCandidates.length;
    result.variantsWithGtin += identityCandidates.filter((c) => c.gtin !== null).length;
    result.variantsWithSku += identityCandidates.filter((c) => c.sku !== null).length;

    for (const candidate of identityCandidates) {
      try {
        if (await crawlTargetExists(candidate)) {
          result.crawlTargetsSkippedExisting += 1;
          continue;
        }
        const { error } = await supabaseAdmin.from('crawl_targets').insert({
          brand: candidate.brand,
          product_name: candidate.product_name,
          pack_size: candidate.pack_size,
          gtin: candidate.gtin,
          sku: candidate.sku,
          source_domain: candidate.source_domain,
          source_url: candidate.source_url,
          status: 'new',
        });
        if (error) throw error;
        result.crawlTargetsInserted += 1;
      } catch (err) {
        result.errors.push(
          `crawl_targets insert failed for ${candidate.product_name}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }

    const composition = extractCompositionCandidate(product);
    if (composition) {
      result.compositionCandidatesFound += 1;
      try {
        const { error } = await supabaseAdmin.from('contributed_foods').insert({
          brand: (product.vendor ?? '').trim(),
          name: product.title.trim(),
          source_url: `https://${domain}/products/${product.handle}`,
          composition_raw: composition.excerpt,
          payload: {
            source_excerpt: composition.excerpt,
            harvested_by: 'shopify_adapter',
            harvested_at: new Date().toISOString(),
          },
          contributor_label: 'shopify-adapter',
          status: 'pending',
        });
        if (error) throw error;
        result.contributedFoodsInserted += 1;
      } catch (err) {
        result.errors.push(
          `contributed_foods insert failed for ${product.title}: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    }
  }

  return result;
}
