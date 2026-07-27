import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseSitemapXml, walkSitemap } from '../../crawler/sitemapAdapter';

const URLSET = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url><loc>https://fish4dogs.com/products/salmon-dry-food</loc></url>
  <url><loc>https://fish4dogs.com/products/sea-jerky-treats</loc></url>
</urlset>`;

const SITEMAP_INDEX = `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://fish4dogs.com/product-sitemap.xml</loc></sitemap>
  <sitemap><loc>https://fish4dogs.com/page-sitemap.xml</loc></sitemap>
  <sitemap><loc>https://fish4dogs.com/blog-sitemap.xml</loc></sitemap>
</sitemapindex>`;

test('parseSitemapXml reads leaf URLs from a <urlset>', () => {
  const result = parseSitemapXml(URLSET);
  assert.deepEqual(result.urls, [
    'https://fish4dogs.com/products/salmon-dry-food',
    'https://fish4dogs.com/products/sea-jerky-treats',
  ]);
  assert.deepEqual(result.childSitemaps, []);
});

test('parseSitemapXml reads child sitemap URLs from a <sitemapindex>', () => {
  const result = parseSitemapXml(SITEMAP_INDEX);
  assert.equal(result.urls.length, 0);
  assert.equal(result.childSitemaps.length, 3);
});

test('parseSitemapXml decodes XML entities in URLs (e.g. &amp;)', () => {
  const xml = `<urlset><url><loc>https://example.com/search?a=1&amp;b=2</loc></url></urlset>`;
  assert.deepEqual(parseSitemapXml(xml).urls, ['https://example.com/search?a=1&b=2']);
});

test('walkSitemap follows a sitemap index down to leaf URLs, preferring the product sitemap', () => {
  const fetched: string[] = [];
  const fetchUrl = async (url: string) => {
    fetched.push(url);
    if (url === 'https://fish4dogs.com/sitemap.xml') return { ok: true, body: SITEMAP_INDEX };
    if (url === 'https://fish4dogs.com/product-sitemap.xml') return { ok: true, body: URLSET };
    // page-sitemap.xml / blog-sitemap.xml should never be fetched, since a product-matching child exists.
    return { ok: false, error: 'should not be fetched' };
  };

  return walkSitemap('https://fish4dogs.com/sitemap.xml', fetchUrl).then((result) => {
    assert.equal(result.urls.length, 2);
    assert.equal(result.stoppedReason, 'exhausted');
    assert.deepEqual(fetched, ['https://fish4dogs.com/sitemap.xml', 'https://fish4dogs.com/product-sitemap.xml']);
  });
});

test('walkSitemap falls back to all children when none match the preferred pattern', async () => {
  const noProductIndex = `<sitemapindex>
    <sitemap><loc>https://example.com/a-sitemap.xml</loc></sitemap>
  </sitemapindex>`;
  const fetchUrl = async (url: string) => {
    if (url === 'https://example.com/sitemap.xml') return { ok: true, body: noProductIndex };
    if (url === 'https://example.com/a-sitemap.xml') return { ok: true, body: URLSET };
    return { ok: false, error: 'unexpected' };
  };
  const result = await walkSitemap('https://example.com/sitemap.xml', fetchUrl);
  assert.equal(result.urls.length, 2);
});

test('walkSitemap stops at maxUrls', async () => {
  const bigUrlset = `<urlset>${Array.from({ length: 20 }, (_, i) => `<url><loc>https://example.com/p${i}</loc></url>`).join('')}</urlset>`;
  const fetchUrl = async () => ({ ok: true, body: bigUrlset });
  const result = await walkSitemap('https://example.com/sitemap.xml', fetchUrl, { maxUrls: 5 });
  assert.equal(result.urls.length, 5);
  assert.equal(result.stoppedReason, 'max_urls_reached');
});

test('walkSitemap stops at maxSitemapFiles on a runaway index (many children, none yielding leaf URLs alone)', async () => {
  const deepIndex = (n: number) => `<sitemapindex><sitemap><loc>https://example.com/level-${n}.xml</loc></sitemap></sitemapindex>`;
  let calls = 0;
  const fetchUrl = async (url: string) => {
    calls++;
    const n = calls; // each fetch returns another index pointing one level deeper, forever
    return { ok: true, body: deepIndex(n) };
  };
  const result = await walkSitemap('https://example.com/sitemap.xml', fetchUrl, { maxSitemapFiles: 4 });
  assert.equal(result.stoppedReason, 'max_sitemap_files_reached');
  assert.equal(calls, 4);
});

test('walkSitemap reports fetch failure without throwing, and continues with what it has', async () => {
  const fetchUrl = async () => ({ ok: false, error: 'blocked by robots.txt' });
  const result = await walkSitemap('https://example.com/sitemap.xml', fetchUrl);
  assert.equal(result.urls.length, 0);
  assert.equal(result.stoppedReason, 'fetch_failed');
  assert.ok(result.errors.length > 0);
});

test('walkSitemap handles a leaf sitemap directly (no index level at all)', async () => {
  const fetchUrl = async (url: string) => (url === 'https://fish4dogs.com/sitemap.xml' ? { ok: true, body: URLSET } : { ok: false });
  const result = await walkSitemap('https://fish4dogs.com/sitemap.xml', fetchUrl);
  assert.equal(result.urls.length, 2);
  assert.equal(result.sitemapFilesFetched, 1);
});
