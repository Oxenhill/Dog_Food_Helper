/**
 * Tier 2 (spec §"Fetch tiers"): sitemap + JSON-LD. Walks a sitemap (or
 * sitemap index) to find candidate page URLs, then reads each page's
 * schema.org Product JSON-LD for identity/price and its HTML for a
 * composition excerpt. No headless rendering — pages that only expose
 * composition via client-side JS after load are Tier 3's problem, not
 * this one's; this adapter should simply find nothing for those and move
 * on, not guess.
 */

export interface SitemapParseResult {
  /** Leaf page URLs, present only for a <urlset> (not a <sitemapindex>). */
  urls: string[];
  /** Child sitemap URLs, present only for a <sitemapindex>. */
  childSitemaps: string[];
}

const LOC_RE = /<loc>\s*([^<]+?)\s*<\/loc>/gi;

/** Parses either a <urlset> (leaf sitemap) or a <sitemapindex> (points at other sitemaps). Deliberately tolerant regex-based parsing rather than a full XML parser — sitemap XML is simple enough, and a missing dependency here isn't worth adding. */
export function parseSitemapXml(xml: string): SitemapParseResult {
  const isIndex = /<sitemapindex[\s>]/i.test(xml);
  const locs = [...xml.matchAll(LOC_RE)].map((m) => decodeXmlEntities(m[1].trim()));
  return isIndex ? { urls: [], childSitemaps: locs } : { urls: locs, childSitemaps: [] };
}

function decodeXmlEntities(s: string): string {
  return s
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'");
}

export type UrlFetcher = (url: string) => Promise<{ ok: boolean; body?: string; error?: string }>;

export interface WalkSitemapOptions {
  /** Hard cap on total leaf page URLs collected, across all child sitemaps combined. */
  maxUrls?: number;
  /** Hard cap on sitemap files fetched (index + children), independent of maxUrls, so a huge index can't cause an unbounded number of small fetches either. */
  maxSitemapFiles?: number;
  /** When a sitemap index has multiple children, prefer ones whose URL suggests products (e.g. "product-sitemap.xml") over ones that don't (e.g. "page-sitemap.xml", "blog-sitemap.xml"). Falls back to all children if none match. */
  preferPattern?: RegExp;
}

export interface WalkSitemapResult {
  urls: string[];
  sitemapFilesFetched: number;
  stoppedReason: 'max_urls_reached' | 'max_sitemap_files_reached' | 'exhausted' | 'fetch_failed';
  errors: string[];
}

const DEFAULT_PREFER_PATTERN = /product/i;

/**
 * Walks a sitemap URL (index or leaf) to a bounded list of candidate page
 * URLs. Every fetch goes through the supplied fetchUrl — callers pass
 * PolicyFetcher.fetch bound to the domain, so allowlist/per-path
 * robots.txt/rate-limit/cache all apply to every sitemap file fetched, not
 * just the product pages that come after.
 */
export async function walkSitemap(
  startUrl: string,
  fetchUrl: UrlFetcher,
  options: WalkSitemapOptions = {}
): Promise<WalkSitemapResult> {
  const maxUrls = options.maxUrls ?? 50;
  const maxSitemapFiles = options.maxSitemapFiles ?? 10;
  const preferPattern = options.preferPattern ?? DEFAULT_PREFER_PATTERN;

  const urls: string[] = [];
  const errors: string[] = [];
  let sitemapFilesFetched = 0;
  const queue: string[] = [startUrl];

  while (queue.length > 0) {
    if (urls.length >= maxUrls) return { urls: urls.slice(0, maxUrls), sitemapFilesFetched, stoppedReason: 'max_urls_reached', errors };
    if (sitemapFilesFetched >= maxSitemapFiles) {
      return { urls, sitemapFilesFetched, stoppedReason: 'max_sitemap_files_reached', errors };
    }

    const current = queue.shift()!;
    const result = await fetchUrl(current);
    sitemapFilesFetched += 1;
    if (!result.ok || !result.body) {
      errors.push(`fetch failed for ${current}: ${result.error ?? 'no body'}`);
      continue;
    }

    const parsed = parseSitemapXml(result.body);

    if (parsed.childSitemaps.length > 0) {
      const preferred = parsed.childSitemaps.filter((u) => preferPattern.test(u));
      const toQueue = preferred.length > 0 ? preferred : parsed.childSitemaps;
      queue.push(...toQueue);
      continue;
    }

    for (const u of parsed.urls) {
      if (urls.length >= maxUrls) break;
      urls.push(u);
    }
    if (urls.length >= maxUrls) {
      return { urls: urls.slice(0, maxUrls), sitemapFilesFetched, stoppedReason: 'max_urls_reached', errors };
    }
  }

  if (urls.length === 0 && errors.length > 0) {
    return { urls, sitemapFilesFetched, stoppedReason: 'fetch_failed', errors };
  }
  return { urls, sitemapFilesFetched, stoppedReason: 'exhausted', errors };
}
