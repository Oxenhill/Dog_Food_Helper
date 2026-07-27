/**
 * Shared "does this HTML/text contain a composition block" finder, used by
 * every Tier that reads raw page content (Shopify's body_html, Tier 2's
 * fetched page HTML). Extracted rather than duplicated per-adapter, since
 * both need the exact same conservative behaviour: return null far more
 * often than not, and when found, return the verbatim excerpt for a
 * reviewer to diff against — never pre-parsed here, that's
 * parse_composition's job downstream, and never guessed when absent.
 */

const COMPOSITION_HEADING_RE = /\b(composition|ingredients)\s*:/i;

// Common e-commerce page furniture that follows the label content on a
// product page (feeding calculators, review widgets, FAQ blocks). Real
// label text (including the Analytical Constituents block, which is kept —
// useful context for a reviewer even though it isn't parsed as an
// ingredient) never contains these phrases, so the first match reliably
// marks where the excerpt should stop, instead of running on for
// `maxChars` into unrelated widget text.
const END_OF_LABEL_RE =
  /\b(feeding guide|feeding calculator|how to feed|please select|frequently asked questions|customer reviews|write a review|get a quote|find your nearest stockist)\b/i;

export function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Finds a Composition:/Ingredients: heading in plain text and returns the verbatim excerpt from there, capped. Null when no such heading exists — the common case. */
export function findCompositionExcerpt(text: string, maxChars = 2000): { excerpt: string } | null {
  const match = text.match(COMPOSITION_HEADING_RE);
  if (!match || match.index === undefined) return null;

  const windowEnd = Math.min(text.length, match.index + maxChars);
  let window = text.slice(match.index, windowEnd);

  const endMatch = window.match(END_OF_LABEL_RE);
  if (endMatch && endMatch.index !== undefined) {
    window = window.slice(0, endMatch.index);
  }

  const excerpt = window.trim();
  return excerpt.length > 20 ? { excerpt } : null;
}

/** Convenience wrapper for raw HTML input. */
export function findCompositionExcerptInHtml(html: string, maxChars = 2000): { excerpt: string } | null {
  return findCompositionExcerpt(stripHtml(html), maxChars);
}
