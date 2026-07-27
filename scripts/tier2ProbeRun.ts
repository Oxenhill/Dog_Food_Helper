/**
 * Run 1 (Phase 2, Tier 2 sitemap+JSON-LD reference adapter): walk the
 * sitemap to a small number of URLs, fetch and parse them, and print raw
 * composition text BESIDE the parser's output — so a mismatch between the
 * hand-authored fixture corpus and a real crawled string is visible before
 * anything lands in contributed_foods. Writes nothing to the database.
 *
 * Usage: npx tsx --env-file=.env scripts/tier2ProbeRun.ts <domain> <sitemapUrl> [maxUrls]
 */
import path from 'node:path';
import { PolicyFetcher } from '../src/lib/crawler/policyFetcher';
import { isDomainCrawlable } from '../src/lib/crawler/allowlist';
import { DomainRateLimiter } from '../src/lib/crawler/rateLimiter';
import { RawResponseCache } from '../src/lib/crawler/rawCache';
import { RobotsGate } from '../src/lib/crawler/robotsGate';
import { walkSitemap } from '../src/lib/crawler/sitemapAdapter';
import { fetchAndParsePages } from '../src/lib/crawler/tier2Harvest';
import { parseComposition } from '../src/lib/compositionParser';

async function main() {
  const domain = process.argv[2];
  const sitemapUrl = process.argv[3];
  const maxUrls = process.argv[4] ? Number(process.argv[4]) : 5;
  if (!domain || !sitemapUrl) {
    console.error('Usage: npx tsx --env-file=.env scripts/tier2ProbeRun.ts <domain> <sitemapUrl> [maxUrls]');
    process.exit(1);
  }

  const cacheDir = path.join(process.cwd(), '.crawler-cache', 'raw');
  const fetcher = new PolicyFetcher({
    isDomainCrawlable,
    rateLimiter: new DomainRateLimiter({ defaultIntervalMs: 2000 }),
    cache: new RawResponseCache(cacheDir),
    robotsGate: new RobotsGate(),
  });

  const fetchUrl = async (url: string) => {
    const r = await fetcher.fetch(url);
    return { ok: r.ok, body: r.body, error: r.error };
  };

  // Walk broadly first (this site's sitemap is one flat <urlset> mixing
  // categories/blog/legal/products with no distinguishing path prefix —
  // there's no product-sitemap.xml to prefer), then apply a site-specific
  // exclude filter as a page-SELECTION heuristic only. If it's wrong for a
  // given URL, JSON-LD extraction just reports "no product found" on that
  // page — nothing is written based on this guess, it only decides what to
  // fetch.
  console.log(`Walking sitemap: ${sitemapUrl} (walking up to 100 to find candidates, then sampling ${maxUrls})`);
  const walk = await walkSitemap(sitemapUrl, fetchUrl, { maxUrls: 100 });
  console.log(`Sitemap walk: ${walk.urls.length} URL(s) found, stoppedReason=${walk.stoppedReason}, sitemapFilesFetched=${walk.sitemapFilesFetched}`);
  if (walk.errors.length) console.log('Sitemap errors:', walk.errors);
  if (walk.urls.length === 0) {
    console.log('No URLs found — stopping here.');
    return;
  }

  const EXCLUDE_RE = /\/(shop|blog|catalog\/category|terms|privacy|cookies|delivery|returns|breeders|amasty|newsletter|reviews|faq|award-winning|homepage-products|mousse-flakes|tasty-shop)(\/|$|-)/i;
  const candidates = walk.urls.filter((u) => !EXCLUDE_RE.test(new URL(u).pathname) && new URL(u).pathname !== '/');
  console.log(`Candidate product-ish URLs after excluding known non-product paths: ${candidates.length} of ${walk.urls.length}`);
  const sample = candidates.slice(0, maxUrls);
  console.log(`Sampling ${sample.length}: ${JSON.stringify(sample)}`);

  console.log(`\nFetching and parsing ${sample.length} page(s)...\n`);
  const { results, pagesFetched, pagesFailed, errors } = await fetchAndParsePages(sample, fetcher);

  console.log(`Pages fetched: ${pagesFetched}, failed: ${pagesFailed}`);
  if (errors.length) console.log('Fetch errors:', errors);

  let productsFound = 0;
  let withGtin = 0;
  let withComposition = 0;

  for (const r of results) {
    console.log('='.repeat(80));
    console.log(`URL: ${r.pageUrl}`);
    if (r.jsonLdProduct) {
      productsFound += 1;
      if (r.jsonLdProduct.gtin) withGtin += 1;
      console.log('JSON-LD Product:', JSON.stringify(r.jsonLdProduct, null, 2));
    } else {
      console.log('JSON-LD Product: none found on this page');
    }

    if (r.compositionExcerpt) {
      withComposition += 1;
      console.log('\n--- RAW composition excerpt (as found on page) ---');
      console.log(r.compositionExcerpt);
      const parsed = parseComposition(r.compositionExcerpt);
      console.log('\n--- parse_composition() output ---');
      console.log(JSON.stringify(parsed, null, 2));
      if (parsed.needsReview) {
        console.log('\n*** FLAGGED: needsReview = true — reasons:', parsed.reviewReasons);
      }
    } else {
      console.log('Composition excerpt: none found on this page');
    }
  }

  console.log('='.repeat(80));
  console.log(`\nSUMMARY for ${domain}`);
  console.log(`Pages walked: ${walk.urls.length}, fetched: ${pagesFetched}, failed: ${pagesFailed}`);
  console.log(`JSON-LD products found: ${productsFound}`);
  console.log(`GTIN yield: ${withGtin}/${productsFound} (${productsFound > 0 ? ((withGtin / productsFound) * 100).toFixed(1) : '0.0'}%)`);
  console.log(`Composition excerpts found: ${withComposition}/${results.length} page-results`);
  console.log('\nRun 1 complete. Nothing was written to the database.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
