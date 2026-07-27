/**
 * robots.txt parsing and per-path evaluation. Domain-level allowlist
 * approval (allowlist.ts) is a one-time human review and stays the primary
 * gate. This is the belt-and-braces layer that matters once an adapter
 * walks many paths on one domain (a sitemap crawl) rather than fetching one
 * known-safe endpoint (Forthglade's single /products.json) — a human
 * reviewing a domain once does not catch every Disallow line, and a rule
 * can also change between review and crawl.
 */

export interface RobotsRule {
  pattern: string;
  allow: boolean;
}

export interface RobotsGroup {
  userAgents: string[];
  rules: RobotsRule[];
}

export interface RobotsRules {
  groups: RobotsGroup[];
}

/** Parses robots.txt into User-agent groups, each with its Allow/Disallow rules, in file order. Unknown directives (Sitemap, Crawl-delay, comments) are ignored here — Crawl-delay is handled separately by the rate limiter's per-domain override. */
export function parseRobotsTxt(text: string): RobotsRules {
  const groups: RobotsGroup[] = [];
  let currentGroup: RobotsGroup | null = null;
  let groupIsOpen = false; // true while consecutive User-agent lines are still being collected

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.split('#')[0].trim();
    if (line === '') continue;

    const colonIndex = line.indexOf(':');
    if (colonIndex === -1) continue;
    const directive = line.slice(0, colonIndex).trim().toLowerCase();
    const value = line.slice(colonIndex + 1).trim();

    if (directive === 'user-agent') {
      if (!groupIsOpen || currentGroup === null) {
        currentGroup = { userAgents: [value.toLowerCase()], rules: [] };
        groups.push(currentGroup);
        groupIsOpen = true;
      } else {
        currentGroup.userAgents.push(value.toLowerCase());
      }
      continue;
    }

    // Any non-user-agent directive closes the run of User-agent lines for this group.
    groupIsOpen = false;

    if (!currentGroup) continue;

    if (directive === 'disallow') {
      if (value !== '') currentGroup.rules.push({ pattern: value, allow: false });
      // "Disallow:" with an empty value is a no-op (allows everything) — correctly produces no rule.
    } else if (directive === 'allow') {
      if (value !== '') currentGroup.rules.push({ pattern: value, allow: true });
    }
    // Sitemap, Crawl-delay, and anything else: intentionally ignored here.
  }

  return { groups };
}

/** Exact match beats a same-named group beats '*'. Real UAs are matched by substring (e.g. "DogSmartDB/1.0 (...)" against a robots.txt group named "dogsmartdb"). */
function selectGroup(rules: RobotsRules, userAgent: string): RobotsGroup | null {
  const ua = userAgent.toLowerCase();
  let wildcard: RobotsGroup | null = null;
  for (const group of rules.groups) {
    for (const groupUa of group.userAgents) {
      if (groupUa === '*') {
        wildcard = wildcard ?? group;
        continue;
      }
      if (ua.includes(groupUa)) return group;
    }
  }
  return wildcard;
}

function escapeRegexLiteral(s: string): string {
  return s.replace(/[.+?^${}()|[\]\\]/g, '\\$&');
}

/** robots.txt pattern -> RegExp. `*` is a wildcard, a trailing `$` anchors the end; otherwise the pattern matches as a prefix. */
function patternToRegex(pattern: string): RegExp {
  const endsAnchored = pattern.endsWith('$');
  const body = endsAnchored ? pattern.slice(0, -1) : pattern;
  const escaped = body.split('*').map(escapeRegexLiteral).join('.*');
  return new RegExp(`^${escaped}${endsAnchored ? '$' : ''}`);
}

function matchesPattern(pathWithQuery: string, pattern: string): boolean {
  return patternToRegex(pattern).test(pathWithQuery);
}

/**
 * Standard robots.txt precedence: among rules matching this path in the
 * applicable group, the longest matched pattern wins; a tie favours Allow.
 * No applicable group, or no matching rule within it, means allowed —
 * robots.txt is opt-out, not opt-in.
 */
export function isPathAllowed(rules: RobotsRules, userAgent: string, pathWithQuery: string): boolean {
  const group = selectGroup(rules, userAgent);
  if (!group) return true;

  let best: RobotsRule | null = null;
  for (const rule of group.rules) {
    if (!matchesPattern(pathWithQuery, rule.pattern)) continue;
    if (
      !best ||
      rule.pattern.length > best.pattern.length ||
      (rule.pattern.length === best.pattern.length && rule.allow && !best.allow)
    ) {
      best = rule;
    }
  }
  return best ? best.allow : true;
}
