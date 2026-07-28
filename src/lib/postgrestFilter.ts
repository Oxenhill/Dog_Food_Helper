/**
 * Builds a safe `ilike` term for PostgREST's `.or()` logic-tree syntax
 * (`or=(brand.ilike.<term>,name.ilike.<term>)`).
 *
 * Two escaping passes are needed, in this order:
 *  1. Escape the ILIKE wildcards (`%`, `_`) and the escape character itself
 *     (`\`) so the search term is matched literally, not as a pattern.
 *  2. Wrap the result in double quotes and escape embedded `\` and `"` so
 *     commas and parentheses in the term (e.g. a product name like
 *     "Cod, Pumpkin & Orange") can't be parsed as logic-tree separators.
 *     Without the quoting, a comma in the search term splits PostgREST's
 *     condition list and the request fails to parse.
 */
export function buildIlikeTerm(raw: string): string {
  const likeEscaped = raw.replace(/[\\%_]/g, (m) => `\\${m}`);
  const quoted = likeEscaped.replace(/[\\"]/g, (m) => `\\${m}`);
  return `"%${quoted}%"`;
}
