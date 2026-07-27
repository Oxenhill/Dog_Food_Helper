/**
 * Generates the SQL regex alternation used by the composition_is_opaque
 * trigger from compositionParser.LEGAL_CATEGORY_TERMS (concealsSource subset)
 * — the single source of truth. Run this and paste the output into a new
 * migration whenever LEGAL_CATEGORY_TERMS changes; never hand-edit the SQL
 * list directly.
 *
 * Usage: npx tsx scripts/generateOpaqueTermsSql.ts
 */
import { LEGAL_CATEGORY_TERMS } from '../src/lib/compositionParser';

function escapeForSqlRegex(term: string): string {
  return term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const terms = LEGAL_CATEGORY_TERMS.filter((t) => t.concealsSource).map((t) => t.term);
const alternation = terms.map(escapeForSqlRegex).join('|');
const pattern = `^(${alternation})s?$`;

console.log('-- GENERATED from LEGAL_CATEGORY_TERMS (concealsSource=true) — do not hand-edit.');
console.log(`-- Source terms: ${terms.join(', ')}`);
console.log(pattern);
