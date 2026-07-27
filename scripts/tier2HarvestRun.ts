/**
 * Run 2 (Phase 2, Tier 2 sitemap+JSON-LD adapter): full walk + write to
 * crawl_targets/contributed_foods. Never writes to foods/food_ingredients.
 *
 * Usage: npx tsx --env-file=.env scripts/tier2HarvestRun.ts <domain> <sitemapUrl> [maxUrls]
 */
import path from 'node:path';
import { buildDefaultFetcher } from '../src/lib/crawler/shopifyHarvest';
import { runTier2Harvest } from '../src/lib/crawler/tier2Harvest';

// Same site-specific page-selection heuristic proven in Run 1 — a flat
// sitemap mixing categories/blog/legal/products with no distinguishing
// path. Purely a fetch-selection filter; wrong guesses just fetch a page
// with no JSON-LD/composition on it, nothing is written based on the guess
// itself.
const EXCLUDE_NON_PRODUCT_RE =
  /\/(shop|blog|catalog\/category|terms|privacy|cookies|delivery|returns|breeders|amasty|newsletter|reviews|faq|award-winning|homepage-products|mousse-flakes|tasty-shop)(\/|$|-)/i;

function filterProductUrls(urls: string[], requirePathSubstring?: string): string[] {
  return urls.filter((u) => {
    try {
      const path = new URL(u).pathname;
      if (path === '/' || EXCLUDE_NON_PRODUCT_RE.test(path)) return false;
      if (requirePathSubstring && !path.includes(requirePathSubstring)) return false;
      return true;
    } catch {
      return false;
    }
  });
}

async function main() {
  const domain = process.argv[2];
  const sitemapUrl = process.argv[3];
  const maxUrls = process.argv[4] ? Number(process.argv[4]) : 20;
  // e.g. "en" — restricts to one locale, so a multi-locale site (mirrors of
  // the same product under /en/, /fr-FR/, /de-DE/...) doesn't produce
  // duplicate crawl_targets/contributed_foods rows for one real product.
  // Deliberately a bare locale code, not a "/en/"-shaped arg: Git Bash's
  // MSYS path conversion silently mangles a leading-slash CLI argument into
  // a Windows path (confirmed: "/en/" arrived as "C:/Program Files/Git/en/"),
  // which would make every path.includes() check below fail silently.
  const localeArg = process.argv[5];
  const requirePathSubstring = localeArg ? `/${localeArg}/` : undefined;
  if (!domain || !sitemapUrl) {
    console.error('Usage: npx tsx --env-file=.env scripts/tier2HarvestRun.ts <domain> <sitemapUrl> [maxUrls] [locale]');
    process.exit(1);
  }

  const cacheDir = path.join(process.cwd(), '.crawler-cache', 'raw');
  const fetcher = buildDefaultFetcher(cacheDir);

  const result = await runTier2Harvest(domain, sitemapUrl, fetcher, {
    maxUrls,
    walkUrls: 100,
    filterUrls: (urls) => filterProductUrls(urls, requirePathSubstring),
  });

  console.log(JSON.stringify(result, null, 2));
  console.log(
    `\nGTIN yield for ${result.domain}: ${result.productsWithGtin}/${result.productsFoundViaJsonLd}` +
      ` (${result.productsFoundViaJsonLd > 0 ? ((result.productsWithGtin / result.productsFoundViaJsonLd) * 100).toFixed(1) : '0.0'}%)`
  );
  console.log(`Composition found: ${result.compositionFound}, contributed_foods inserted: ${result.contributedFoodsInserted}`);
  console.log(`crawl_targets inserted: ${result.crawlTargetsInserted}, skipped existing: ${result.crawlTargetsSkippedExisting}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
