import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  isShopifyProductsResponse,
  probeIsShopify,
  fetchAllShopifyProducts,
  extractPackSize,
  extractIdentityCandidates,
  extractCompositionCandidate,
  shopifyProductsUrl,
  type ShopifyProduct,
  type ShopifyProductsResponse,
} from '../../crawler/shopifyAdapter';

function product(overrides: Partial<ShopifyProduct> = {}): ShopifyProduct {
  return {
    id: 1,
    title: 'Cold Pressed Chicken with Vegetables',
    handle: 'cold-pressed-chicken-with-vegetables',
    vendor: 'Forthglade',
    body_html: null,
    variants: [
      { id: 11, title: '2kg', sku: 'FG-CP-CHK-2KG', price: '14.99', barcode: '5063334025939', grams: 2000, available: true, option1: '2kg', option2: null, option3: null },
      { id: 12, title: '10kg', sku: 'FG-CP-CHK-10KG', price: '44.99', barcode: '8717249776390', grams: 10000, available: true, option1: '10kg', option2: null, option3: null },
    ],
    ...overrides,
  };
}

function jsonResponse(body: unknown) {
  return { ok: true, body: JSON.stringify(body) };
}

test('shopifyProductsUrl builds the standard paginated endpoint', () => {
  assert.equal(
    shopifyProductsUrl('forthglade.com', 2, 250),
    'https://forthglade.com/products.json?limit=250&page=2'
  );
});

test('isShopifyProductsResponse accepts a well-formed response', () => {
  const response: ShopifyProductsResponse = { products: [product()] };
  assert.equal(isShopifyProductsResponse(response), true);
});

test('isShopifyProductsResponse rejects a non-Shopify JSON shape', () => {
  assert.equal(isShopifyProductsResponse({ foo: 'bar' }), false);
  assert.equal(isShopifyProductsResponse(null), false);
  assert.equal(isShopifyProductsResponse({ products: 'not-an-array' }), false);
  assert.equal(isShopifyProductsResponse({ products: [{ id: 1 }] }), false); // missing title/handle/variants
});

test('probeIsShopify returns true for a real Shopify shape', async () => {
  const fetchUrl = async () => jsonResponse({ products: [product()] });
  assert.equal(await probeIsShopify('forthglade.com', fetchUrl), true);
});

test('probeIsShopify returns false for a non-Shopify site (e.g. a 404 or an HTML error page)', async () => {
  const fetchUrl = async () => ({ ok: false, error: 'HTTP 404' });
  assert.equal(await probeIsShopify('not-shopify.example.com', fetchUrl), false);
});

test('probeIsShopify returns false when the body is not JSON at all', async () => {
  const fetchUrl = async () => ({ ok: true, body: '<html>not shopify</html>' });
  assert.equal(await probeIsShopify('not-shopify.example.com', fetchUrl), false);
});

test('fetchAllShopifyProducts stops on the first short page (fewer than limit results) — the normal last-page case', async () => {
  // limit=2: page 1 full (2), page 2 short (1) -> stop, page 3 never fetched.
  const pages: Record<number, ShopifyProduct[]> = {
    1: [product({ id: 1, handle: 'a' }), product({ id: 2, handle: 'b' })],
    2: [product({ id: 3, handle: 'c' })],
    3: [product({ id: 99, handle: 'never-reached' })],
  };
  let calls = 0;
  const fetchUrl = async (url: string) => {
    calls++;
    const page = Number(new URL(url).searchParams.get('page'));
    return jsonResponse({ products: pages[page] ?? [] });
  };

  const result = await fetchAllShopifyProducts('forthglade.com', fetchUrl, { limit: 2, maxPages: 10 });
  assert.equal(result.products.length, 3);
  assert.equal(result.stoppedReason, 'short_page');
  assert.equal(result.pagesFetched, 2);
  assert.equal(calls, 2);
});

test('fetchAllShopifyProducts stops on an empty page when it directly follows a full page', async () => {
  const pages: Record<number, ShopifyProduct[]> = {
    1: [product({ id: 1, handle: 'a' }), product({ id: 2, handle: 'b' })],
    2: [],
  };
  const fetchUrl = async (url: string) => {
    const page = Number(new URL(url).searchParams.get('page'));
    return jsonResponse({ products: pages[page] ?? [] });
  };
  const result = await fetchAllShopifyProducts('forthglade.com', fetchUrl, { limit: 2, maxPages: 10 });
  assert.equal(result.stoppedReason, 'empty_page');
  assert.equal(result.pagesFetched, 1);
  assert.equal(result.products.length, 2);
});

test('fetchAllShopifyProducts stops at maxPages if a store keeps returning full, non-repeating pages forever', async () => {
  let nextId = 1;
  const fetchUrl = async () => {
    // Always a full page of 2 NEW ids, so neither short-page nor repeat-guard fires.
    const batch = [product({ id: nextId++, handle: `p${nextId}` }), product({ id: nextId++, handle: `p${nextId}` })];
    return jsonResponse({ products: batch });
  };
  const result = await fetchAllShopifyProducts('endless.example.com', fetchUrl, { limit: 2, maxPages: 3 });
  assert.equal(result.stoppedReason, 'max_pages_reached');
  assert.equal(result.pagesFetched, 3);
  assert.equal(result.products.length, 6);
});

test('repeat guard: a store that ignores the page param and re-serves the same page is stopped, not looped 10x', async () => {
  // Every page request returns the SAME two product IDs — a store silently
  // ignoring ?page=N. Must stop after detecting the repeat, not run to maxPages.
  let calls = 0;
  const fetchUrl = async () => {
    calls++;
    return jsonResponse({ products: [product({ id: 1, handle: 'a' }), product({ id: 2, handle: 'b' })] });
  };
  const result = await fetchAllShopifyProducts('loops-forever.example.com', fetchUrl, { limit: 2, maxPages: 10 });
  assert.equal(result.stoppedReason, 'repeated_page');
  assert.equal(result.products.length, 2); // only page 1's products kept, page 2's duplicate discarded
  assert.equal(calls, 2, 'should fetch page 1, then page 2 to detect the repeat, then stop — not all 10 pages');
});

test('repeat guard is order-independent: same IDs in a different order still counts as a repeat', async () => {
  let call = 0;
  const fetchUrl = async () => {
    call++;
    const products =
      call === 1
        ? [product({ id: 1, handle: 'a' }), product({ id: 2, handle: 'b' })]
        : [product({ id: 2, handle: 'b' }), product({ id: 1, handle: 'a' })]; // reshuffled, same IDs
    return jsonResponse({ products });
  };
  const result = await fetchAllShopifyProducts('reshuffled.example.com', fetchUrl, { limit: 2, maxPages: 10 });
  assert.equal(result.stoppedReason, 'repeated_page');
});

test('fetchAllShopifyProducts stops cleanly on a fetch failure mid-pagination', async () => {
  let calls = 0;
  const fetchUrl = async () => {
    calls++;
    // Full page (== limit) so pagination continues rather than short-page-stopping.
    if (calls === 1) return jsonResponse({ products: [product({ id: 1 }), product({ id: 2 })] });
    return { ok: false, error: 'blocked by allowlist: hard stop' };
  };
  const result = await fetchAllShopifyProducts('flaky.example.com', fetchUrl, { limit: 2, maxPages: 10 });
  assert.equal(result.stoppedReason, 'fetch_failed');
  assert.equal(result.products.length, 2);
  assert.equal(result.pagesFetched, 1);
});

test('extractPackSize reads the variant title', () => {
  const p = product();
  assert.equal(extractPackSize(p.variants[0]), '2kg');
  assert.equal(extractPackSize(p.variants[1]), '10kg');
});

test('extractPackSize ignores Shopify\'s "Default Title" placeholder', () => {
  const variant = { id: 1, title: 'Default Title', sku: null, price: null, barcode: null, grams: null, available: true, option1: 'Default Title', option2: null, option3: null };
  assert.equal(extractPackSize(variant), null);
});

test('extractPackSize returns null when no size pattern is present', () => {
  const variant = { id: 1, title: 'Chicken Recipe', sku: null, price: null, barcode: null, grams: null, available: true, option1: null, option2: null, option3: null };
  assert.equal(extractPackSize(variant), null);
});

test('extractPackSize captures a multipack as one unit — "6 x 180g" is a real 1,080g pack, not "180g"', () => {
  const variant = { id: 1, title: '6 x 180g', sku: null, price: null, barcode: null, grams: null, available: true, option1: '6 x 180g', option2: null, option3: null };
  assert.equal(extractPackSize(variant), '6x180g');
});

test('extractPackSize handles the × character too, not just a literal x', () => {
  const variant = { id: 1, title: '3×400g', sku: null, price: null, barcode: null, grams: null, available: true, option1: null, option2: null, option3: null };
  assert.equal(extractPackSize(variant), '3x400g');
});

test('extractPackSize returns null (not a wrong per-unit guess) when a multiplier is present but the multipack pattern does not confidently match', () => {
  // "Pack of 6" with a per-unit weight elsewhere in the string, but not in
  // the exact "N x SIZE" shape — writing "180g" here would misstate a
  // 1,080g pack. Null is correct; a wrong number is worse than none.
  const variant = { id: 1, title: 'Pack of 6, 180g each', sku: null, price: null, barcode: null, grams: null, available: true, option1: null, option2: null, option3: null };
  assert.equal(extractPackSize(variant), null);
});

test('extractIdentityCandidates produces one candidate per variant, with checksum-validated GTINs and SKUs', () => {
  const candidates = extractIdentityCandidates(product(), 'forthglade.com');
  assert.equal(candidates.length, 2);
  assert.equal(candidates[0].product_name, 'Cold Pressed Chicken with Vegetables — 2kg');
  assert.equal(candidates[0].pack_size, '2kg');
  assert.equal(candidates[0].gtin, '05063334025939'); // valid vector, normalized to 14
  assert.equal(candidates[0].sku, 'FG-CP-CHK-2KG');
  assert.equal(candidates[0].brand, 'Forthglade');
  assert.equal(candidates[0].source_url, 'https://forthglade.com/products/cold-pressed-chicken-with-vegetables');
  assert.equal(candidates[1].gtin, '08717249776390');
  assert.equal(candidates[1].sku, 'FG-CP-CHK-10KG');
});

test('extractIdentityCandidates does not repeat a pack size that is already in the base product title', () => {
  const p = product({
    title: '2kg Lightly Baked Lamb Dry Dog Food',
    handle: 'lightly-baked-lamb-dry-dog-food',
    variants: [
      { id: 31, title: '2kg', sku: 'LBL-2KG', price: '9.99', barcode: null, grams: 2000, available: true, option1: '2kg', option2: null, option3: null },
    ],
  });
  const candidates = extractIdentityCandidates(p, 'forthglade.com');
  assert.equal(candidates[0].product_name, '2kg Lightly Baked Lamb Dry Dog Food');
});

test('extractIdentityCandidates still appends a variant title that is NOT already in the product title', () => {
  const p = product({
    title: 'Bone Broth Topper Variety Pack',
    handle: 'bone-broth-topper-variety-pack',
    variants: [
      { id: 32, title: '6 x 180g', sku: 'BBT-6X180', price: '19.99', barcode: null, grams: 1080, available: true, option1: '6 x 180g', option2: null, option3: null },
    ],
  });
  const candidates = extractIdentityCandidates(p, 'forthglade.com');
  assert.equal(candidates[0].product_name, 'Bone Broth Topper Variety Pack — 6 x 180g');
  assert.equal(candidates[0].pack_size, '6x180g');
});

test('extractIdentityCandidates: sku is null when the variant has none', () => {
  const p = product({
    variants: [{ id: 41, title: '2kg', sku: '', price: '9.99', barcode: null, grams: 2000, available: true, option1: '2kg', option2: null, option3: null }],
  });
  assert.equal(extractIdentityCandidates(p, 'forthglade.com')[0].sku, null);
});

test('extractIdentityCandidates drops a scraped barcode that fails the GTIN checksum, rather than writing junk', () => {
  const p = product({
    variants: [
      { id: 21, title: '2kg', sku: 'X', price: '9.99', barcode: '1234567890123', grams: 2000, available: true, option1: '2kg', option2: null, option3: null },
    ],
  });
  const candidates = extractIdentityCandidates(p, 'forthglade.com');
  assert.equal(candidates[0].gtin, null);
});

test('extractIdentityCandidates falls back to one candidate when a product has no variants', () => {
  const p = product({ variants: [] });
  const candidates = extractIdentityCandidates(p, 'forthglade.com');
  assert.equal(candidates.length, 1);
  assert.equal(candidates[0].product_name, 'Cold Pressed Chicken with Vegetables');
  assert.equal(candidates[0].gtin, null);
});

test('extractCompositionCandidate finds a Composition: block in body_html', () => {
  const p = product({
    body_html:
      '<div><p>Delicious food.</p><p>Composition: Chicken 60%, Rice 40%.</p><p>Feeding guide below.</p></div>',
  });
  const result = extractCompositionCandidate(p);
  assert.ok(result);
  assert.match(result!.excerpt, /^Composition: Chicken 60%, Rice 40%/);
});

test('extractCompositionCandidate returns null when body_html has no composition heading — Tier 1 is an identity source, not an ingredients source', () => {
  const p = product({ body_html: '<div><p>Great food your dog will love. Grain free and delicious.</p></div>' });
  assert.equal(extractCompositionCandidate(p), null);
});

test('extractCompositionCandidate returns null when body_html is absent entirely', () => {
  const p = product({ body_html: null });
  assert.equal(extractCompositionCandidate(p), null);
});
