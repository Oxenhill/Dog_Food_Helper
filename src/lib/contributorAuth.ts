import { timingSafeEqual } from 'node:crypto';

/**
 * Contributor access gate for the /contribute path.
 *
 * ONE shared token for every contributor (owner decision, 2026-07-26). The
 * contributors are non-technical friends donating their own AI-subscription
 * usage to populate the food catalogue; per-person links or accounts would be
 * ceremony without a security gain, because the token is the boundary either
 * way. Provenance is handled by the free-text `contributor_label` on each
 * submission instead — enough to trace a batch to a person and retract it.
 *
 * What the token actually permits, deliberately kept tiny so a leaked or
 * forwarded link is a nuisance rather than an incident:
 *   - render the contribute page and its prompt;
 *   - POST a submission into `contributed_foods`, which nothing reads until an
 *     admin approves it.
 * It grants no read access to users, dogs, logs or research, and it cannot
 * modify or delete anything that already exists. Worst case is a spammed
 * review queue, which is why the submit route also caps batch size and rate.
 *
 * Rotation is changing the env var. Treat the token as semi-public: it travels
 * in a URL that non-technical people will forward, and may end up in a chat
 * transcript. That is an accepted trade for "one link is all they need" — the
 * blast radius above is what makes it acceptable, so do not widen this token's
 * reach without revisiting that reasoning.
 */

/** Constant-time compare that also tolerates length mismatch without leaking it. */
function tokensMatch(provided: string, expected: string): boolean {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  // timingSafeEqual throws on differing lengths, which would itself be a
  // (weak) oracle. Hash-free equalisation: compare same-length buffers and AND
  // in the length check.
  if (a.length !== b.length) {
    // Still do a comparison of equal-length buffers so the timing profile does
    // not depend on the length test.
    timingSafeEqual(a, a);
    return false;
  }
  return timingSafeEqual(a, b);
}

export function contributorTokenConfigured(): boolean {
  return Boolean(process.env.CONTRIBUTOR_TOKEN);
}

/**
 * True when `provided` is the configured contributor token.
 *
 * Fails closed when CONTRIBUTOR_TOKEN is unset: an unconfigured deployment must
 * not expose an open write path. That means the feature is off until the owner
 * sets the variable, which is the intended default.
 */
export function isContributorAuthorized(provided: string | null | undefined): boolean {
  const expected = process.env.CONTRIBUTOR_TOKEN;
  if (!expected) return false;
  if (!provided) return false;
  return tokensMatch(provided, expected);
}

/**
 * Pull the token from a request: `Authorization: Bearer <token>` for a direct
 * API caller (a contributor comfortable with curl, or Claude Code), or the
 * `key` query parameter / `token` body field for the paste page. The page path
 * is the one that matters for non-technical contributors.
 */
export function extractContributorToken(
  request: Request,
  bodyToken?: unknown
): string | null {
  const header = request.headers.get('authorization');
  if (header?.startsWith('Bearer ')) return header.slice('Bearer '.length).trim();

  if (typeof bodyToken === 'string' && bodyToken.trim()) return bodyToken.trim();

  try {
    const url = new URL(request.url);
    const key = url.searchParams.get('key');
    if (key?.trim()) return key.trim();
  } catch {
    // Unparseable URL — treated as no token.
  }

  return null;
}
