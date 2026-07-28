/**
 * Data-state statement (owner decisions, 2026-07-28, DECISION 2).
 *
 * Three states, three distinct messages, never collapsed. Purely
 * informational — must never change a score or exclude a food (exclusion by
 * missing composition is DECISION 1, in hardFilter.ts, and only applies to a
 * dog with a recorded restriction or health condition).
 */
export type DataState = 'no_ingredients' | 'opaque' | 'clean';

export function deriveDataState(hasIngredients: boolean, compositionIsOpaque: boolean): DataState {
  if (!hasIngredients) return 'no_ingredients';
  if (compositionIsOpaque) return 'opaque';
  return 'clean';
}

export function dataStateMessage(
  state: DataState,
  opaqueTerms: string[] | null | undefined
): string | null {
  switch (state) {
    case 'no_ingredients':
      return 'No ingredients on record for this food. It has not been checked against anything.';
    case 'opaque':
      return `Composition lists ${(opaqueTerms ?? []).join(', ')} without naming the source.`;
    case 'clean':
      return null;
  }
}

/**
 * DECISION 6 (owner, 2026-07-28): a food sourced from a domain the site
 * allowlist has since marked approved=false may still carry ingredient data
 * (crawled before the domain was refused, or captured before it turned out
 * restrictive), but that domain can no longer be re-checked against the live
 * page. Informational only, same treatment as opacity — never a score
 * change, never an exclusion (the food is not removed from the pool; see
 * hardFilter.ts, which never filters on source_domain_allowlist at all).
 */
export const REFUSED_DOMAIN_LINE =
  'Ingredient data for this food came from a source we can no longer re-check. Confirm against the pack.';

export function needsRefusedDomainCaution(
  hasIngredients: boolean,
  sourceDomainRefused: boolean
): boolean {
  return hasIngredients && sourceDomainRefused;
}
