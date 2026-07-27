/**
 * Run 2 (Phase 2, forthglade.com Shopify reference adapter): full
 * pagination via the repeat/short-page guards, writing to crawl_targets
 * (identity) and contributed_foods (any composition excerpt found). Never
 * writes to foods/food_ingredients.
 *
 * Usage: npx tsx --env-file=.env scripts/shopifyHarvestRun.ts <domain>
 */
import path from 'node:path';
import { buildDefaultFetcher, runShopifyIdentityHarvest } from '../src/lib/crawler/shopifyHarvest';

async function main() {
  const domain = process.argv[2];
  if (!domain) {
    console.error('Usage: npx tsx --env-file=.env scripts/shopifyHarvestRun.ts <domain>');
    process.exit(1);
  }

  const cacheDir = path.join(process.cwd(), '.crawler-cache', 'raw');
  const fetcher = buildDefaultFetcher(cacheDir);

  const result = await runShopifyIdentityHarvest(domain, fetcher, { maxPages: 10 });

  console.log(JSON.stringify(result, null, 2));
  console.log(
    `\nGTIN yield for ${result.domain}: ${result.variantsWithGtin}/${result.identityCandidates}` +
      ` (${result.identityCandidates > 0 ? ((result.variantsWithGtin / result.identityCandidates) * 100).toFixed(1) : '0.0'}%)`
  );
  console.log(
    `SKU yield for ${result.domain}: ${result.variantsWithSku}/${result.identityCandidates}` +
      ` (${result.identityCandidates > 0 ? ((result.variantsWithSku / result.identityCandidates) * 100).toFixed(1) : '0.0'}%)`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
