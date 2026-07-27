/**
 * Run 1 (Phase 2, forthglade.com Shopify reference adapter): fetch page 1
 * of /products.json ONLY, parse it, print stats. Writes nothing to the
 * database — no crawl_targets, no contributed_foods. Purpose: verify the
 * adapter's assumed Shopify response shape against the real one before
 * trusting it for a full 10-page pagination run.
 *
 * Usage: npx tsx --env-file=.env scripts/shopifyProbeRun.ts <domain>
 */
import path from 'node:path';
import { PolicyFetcher } from '../src/lib/crawler/policyFetcher';
import { isDomainCrawlable } from '../src/lib/crawler/allowlist';
import { DomainRateLimiter } from '../src/lib/crawler/rateLimiter';
import { RawResponseCache } from '../src/lib/crawler/rawCache';
import {
  probeIsShopify,
  isShopifyProductsResponse,
  shopifyProductsUrl,
  extractIdentityCandidates,
  extractCompositionCandidate,
} from '../src/lib/crawler/shopifyAdapter';

async function main() {
  const domain = process.argv[2];
  if (!domain) {
    console.error('Usage: npx tsx --env-file=.env scripts/shopifyProbeRun.ts <domain>');
    process.exit(1);
  }

  const cacheDir = path.join(process.cwd(), '.crawler-cache', 'raw');
  const fetcher = new PolicyFetcher({
    isDomainCrawlable,
    rateLimiter: new DomainRateLimiter({ defaultIntervalMs: 2000 }),
    cache: new RawResponseCache(cacheDir),
  });

  const fetchUrl = async (url: string) => {
    const r = await fetcher.fetch(url);
    return { ok: r.ok, body: r.body, error: r.error };
  };

  console.log(`Allowlist + robots + rate-limit gate: checking ${domain}...`);
  const isShopify = await probeIsShopify(domain, fetchUrl);
  console.log(`is_shopify probe (limit=1 page=1): ${isShopify}`);
  if (!isShopify) {
    console.log('Not a recognisable Shopify /products.json shape (or blocked/failed) — stopping here.');
    return;
  }

  console.log(`\nFetching page 1 only (limit=250)...`);
  const url = shopifyProductsUrl(domain, 1, 250);
  const result = await fetcher.fetch(url);
  if (!result.ok || !result.body) {
    console.log(`Fetch failed: ${result.error}`);
    return;
  }

  const json = JSON.parse(result.body);
  if (!isShopifyProductsResponse(json)) {
    console.log('Response did not match the assumed Shopify products.json shape. Raw sample:');
    console.log(result.body.slice(0, 2000));
    return;
  }

  const products = json.products;
  console.log(`\nProducts returned: ${products.length}`);

  let totalVariants = 0;
  let validGtinVariants = 0;
  let packSizeFound = 0;
  let compositionFound = 0;
  const sampleCandidates: unknown[] = [];
  const sampleCompositions: string[] = [];

  for (const product of products) {
    totalVariants += product.variants.length;
    const candidates = extractIdentityCandidates(product, domain);
    for (const c of candidates) {
      if (c.gtin) validGtinVariants += 1;
      if (c.pack_size) packSizeFound += 1;
      if (sampleCandidates.length < 8) sampleCandidates.push(c);
    }

    const composition = extractCompositionCandidate(product);
    if (composition) {
      compositionFound += 1;
      if (sampleCompositions.length < 3) sampleCompositions.push(composition.excerpt.slice(0, 300));
    }
  }

  console.log(`Total variants across these products: ${totalVariants}`);
  console.log(`Variants with a checksum-valid GTIN: ${validGtinVariants}`);
  console.log(`Variants with a pack size extracted: ${packSizeFound}`);
  console.log(`Products with a composition/ingredients block found in body_html: ${compositionFound}`);

  console.log(`\n--- Sample identity candidates (up to 8) ---`);
  for (const c of sampleCandidates) console.log(JSON.stringify(c, null, 2));

  if (sampleCompositions.length > 0) {
    console.log(`\n--- Sample composition excerpts (up to 3, 300 chars) ---`);
    for (const s of sampleCompositions) console.log(s, '\n---');
  }

  console.log('\nRun 1 complete. Nothing was written to the database.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
