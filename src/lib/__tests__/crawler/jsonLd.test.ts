import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractJsonLdBlocks, extractProductsFromJsonLd } from '../../crawler/jsonLd';

test('extractJsonLdBlocks parses a single script block', () => {
  const html = `<html><head><script type="application/ld+json">{"@type":"Product","name":"Chicken Dinner"}</script></head></html>`;
  const blocks = extractJsonLdBlocks(html);
  assert.equal(blocks.length, 1);
  assert.equal((blocks[0] as { name: string }).name, 'Chicken Dinner');
});

test('extractJsonLdBlocks parses multiple script blocks and an array block', () => {
  const html = `
    <script type="application/ld+json">{"@type":"Organization","name":"Acme"}</script>
    <script type="application/ld+json">[{"@type":"Product","name":"A"},{"@type":"Product","name":"B"}]</script>
  `;
  const blocks = extractJsonLdBlocks(html);
  assert.equal(blocks.length, 3);
});

test('extractJsonLdBlocks skips a malformed block without losing the others', () => {
  const html = `
    <script type="application/ld+json">{ this is not valid json }</script>
    <script type="application/ld+json">{"@type":"Product","name":"Valid"}</script>
  `;
  const blocks = extractJsonLdBlocks(html);
  assert.equal(blocks.length, 1);
  assert.equal((blocks[0] as { name: string }).name, 'Valid');
});

test('extractJsonLdBlocks returns nothing for a page with no JSON-LD at all', () => {
  assert.deepEqual(extractJsonLdBlocks('<html><body>hello</body></html>'), []);
});

test('extractProductsFromJsonLd reads name/brand/sku/price and validates a real GTIN', () => {
  const html = `<script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Product",
      "name": "Salmon & Rice Dry Dog Food 12kg",
      "brand": { "@type": "Brand", "name": "Fish4Dogs" },
      "sku": "F4D-SR-12KG",
      "gtin13": "5063334025939",
      "offers": { "@type": "Offer", "price": "44.99", "priceCurrency": "GBP" }
    }
  </script>`;
  const products = extractProductsFromJsonLd(html);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Salmon & Rice Dry Dog Food 12kg');
  assert.equal(products[0].brand, 'Fish4Dogs');
  assert.equal(products[0].sku, 'F4D-SR-12KG');
  assert.equal(products[0].gtin, '05063334025939');
  assert.equal(products[0].price, '44.99');
});

test('extractProductsFromJsonLd rejects a GTIN that fails the checksum, rather than writing junk', () => {
  const html = `<script type="application/ld+json">
    {"@type":"Product","name":"X","gtin13":"1234567890123"}
  </script>`;
  const products = extractProductsFromJsonLd(html);
  assert.equal(products[0].gtin, null);
  assert.equal(products[0].gtinRaw, '1234567890123');
});

test('extractProductsFromJsonLd ignores non-Product nodes (Organization, BreadcrumbList, WebSite)', () => {
  const html = `
    <script type="application/ld+json">{"@type":"Organization","name":"Fish4Dogs"}</script>
    <script type="application/ld+json">{"@type":"BreadcrumbList","itemListElement":[]}</script>
    <script type="application/ld+json">{"@type":"Product","name":"Real Product"}</script>
  `;
  const products = extractProductsFromJsonLd(html);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Real Product');
});

test('extractProductsFromJsonLd handles @type as an array (e.g. ["Product","Thing"])', () => {
  const html = `<script type="application/ld+json">{"@type":["Product","Thing"],"name":"X"}</script>`;
  assert.equal(extractProductsFromJsonLd(html).length, 1);
});

test('extractProductsFromJsonLd flattens @graph-wrapped nodes (common WordPress/Yoast pattern)', () => {
  const html = `<script type="application/ld+json">
    {"@context":"https://schema.org","@graph":[
      {"@type":"WebPage","name":"Home"},
      {"@type":"Product","name":"Graphed Product","sku":"G1"}
    ]}
  </script>`;
  const products = extractProductsFromJsonLd(html);
  assert.equal(products.length, 1);
  assert.equal(products[0].name, 'Graphed Product');
});

test('extractProductsFromJsonLd deliberately never captures description or image — identity/price fields only', () => {
  const products = extractProductsFromJsonLd(
    `<script type="application/ld+json">{"@type":"Product","name":"X","description":"Marketing copy","image":"https://example.com/a.jpg"}</script>`
  );
  const keys = Object.keys(products[0]);
  assert.ok(!keys.includes('description'));
  assert.ok(!keys.includes('image'));
});

test('extractProductsFromJsonLd handles a numeric offer price', () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"X","offers":{"price":9.99}}</script>`;
  assert.equal(extractProductsFromJsonLd(html)[0].price, '9.99');
});

test('extractProductsFromJsonLd handles offers as an array, using the first', () => {
  const html = `<script type="application/ld+json">{"@type":"Product","name":"X","offers":[{"price":"12.00"},{"price":"15.00"}]}</script>`;
  assert.equal(extractProductsFromJsonLd(html)[0].price, '12.00');
});
