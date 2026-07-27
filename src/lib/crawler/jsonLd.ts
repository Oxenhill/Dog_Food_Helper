import { validateScrapedGtin } from '../gtin';

/**
 * schema.org Product JSON-LD extraction (Tier 2, spec §"Fetch tiers"):
 * "Fetch once, look for schema.org Product JSON-LD, then __NEXT_DATA__/
 * Nuxt state blobs, then inline JSON." This module handles the JSON-LD
 * step. Deliberately narrow: it reads identity and price fields only
 * (name, brand, sku, mpn, gtin, price) — never `description` and never
 * `image`. Product descriptions are marketing copy the site author wrote;
 * scraping them alongside factual GTIN/price data was explicitly ruled out
 * of scope for the retailer adapters this session (see the Zooplus/Viovet
 * permission-email drafts, which name exactly this restriction as the ask)
 * and is kept consistent here rather than decided differently per adapter.
 */

export interface JsonLdProduct {
  name: string | null;
  brand: string | null;
  sku: string | null;
  mpn: string | null;
  /** Raw, unvalidated — run through validateScrapedGtin before ever writing it. */
  gtinRaw: string | null;
  gtin: string | null;
  price: string | null;
  url: string | null;
}

const LD_JSON_SCRIPT_RE = /<script[^>]+type\s*=\s*["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;

/** Every parseable JSON-LD block on the page, flattened. Malformed JSON in one script tag is skipped, not fatal to the others. */
export function extractJsonLdBlocks(html: string): unknown[] {
  const blocks: unknown[] = [];
  for (const match of html.matchAll(LD_JSON_SCRIPT_RE)) {
    const raw = match[1].trim();
    if (!raw) continue;
    try {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed)) blocks.push(...parsed);
      else blocks.push(parsed);
    } catch {
      // Malformed JSON-LD is common in the wild (unescaped quotes, trailing
      // commas from a templating bug) — skip this block, keep the rest.
      continue;
    }
  }
  return blocks;
}

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/** JSON-LD often nests real nodes under @graph (common in WordPress/Yoast-style output). */
function flattenGraph(blocks: unknown[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const block of blocks) {
    if (!isPlainObject(block)) continue;
    const graph = block['@graph'];
    if (Array.isArray(graph)) {
      for (const node of graph) if (isPlainObject(node)) out.push(node);
    } else {
      out.push(block);
    }
  }
  return out;
}

function hasProductType(node: Record<string, unknown>): boolean {
  const type = node['@type'];
  if (typeof type === 'string') return type.toLowerCase() === 'product';
  if (Array.isArray(type)) return type.some((t) => typeof t === 'string' && t.toLowerCase() === 'product');
  return false;
}

function stringField(v: unknown): string | null {
  if (typeof v === 'string' && v.trim() !== '') return v.trim();
  if (isPlainObject(v) && typeof v.name === 'string' && v.name.trim() !== '') return v.name.trim();
  return null;
}

function firstOffer(node: Record<string, unknown>): Record<string, unknown> | null {
  const offers = node.offers;
  if (Array.isArray(offers)) return isPlainObject(offers[0]) ? offers[0] : null;
  if (isPlainObject(offers)) return offers;
  return null;
}

/** All schema.org Product nodes on the page, with identity/price fields only — see module docblock for what's deliberately excluded. */
export function extractProductsFromJsonLd(html: string): JsonLdProduct[] {
  const nodes = flattenGraph(extractJsonLdBlocks(html));
  const products: JsonLdProduct[] = [];

  for (const node of nodes) {
    if (!hasProductType(node)) continue;
    const offer = firstOffer(node);

    const gtinRaw =
      stringField(node.gtin13) ??
      stringField(node.gtin12) ??
      stringField(node.gtin8) ??
      stringField(node.gtin) ??
      stringField(offer?.gtin13) ??
      stringField(offer?.gtin) ??
      null;

    products.push({
      name: stringField(node.name),
      brand: stringField(node.brand),
      sku: stringField(node.sku),
      mpn: stringField(node.mpn),
      gtinRaw,
      gtin: validateScrapedGtin(gtinRaw),
      price: stringField(offer?.price) ?? (typeof offer?.price === 'number' ? String(offer.price) : null),
      url: stringField(node.url),
    });
  }

  return products;
}
