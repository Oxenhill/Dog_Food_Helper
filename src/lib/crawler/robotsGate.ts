import { parseRobotsTxt, isPathAllowed, type RobotsRules } from './robotsTxt';
import { cacheDateFor } from './rawCache';

/**
 * Fetches, parses and caches robots.txt per domain (once per calendar day —
 * matching the raw-response cache's own key), and evaluates individual
 * paths against it. Deliberately outside the allowlist gate: reading
 * robots.txt is due diligence, not the crawl itself, and it must be
 * reachable even to evaluate a domain that turns out to be disallowed.
 */

export type RobotsFetchImpl = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  text: () => Promise<string>;
}>;

export interface RobotsGateOptions {
  fetchImpl?: RobotsFetchImpl;
  now?: () => number;
  userAgent?: string;
}

export class RobotsGate {
  private readonly cache = new Map<string, { rules: RobotsRules; fetchedDate: string }>();
  private readonly fetchImpl: RobotsFetchImpl;
  private readonly now: () => number;
  private readonly userAgent: string;

  constructor(options: RobotsGateOptions = {}) {
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as RobotsFetchImpl);
    this.now = options.now ?? Date.now;
    this.userAgent = options.userAgent ?? 'DogSmartDB/1.0 (+trainers@dogsmarttrainingbehaviour.co.uk)';
  }

  private async getRules(domain: string): Promise<RobotsRules> {
    const today = cacheDateFor(this.now());
    const cached = this.cache.get(domain);
    if (cached && cached.fetchedDate === today) return cached.rules;

    let rules: RobotsRules;
    try {
      const res = await this.fetchImpl(`https://${domain}/robots.txt`, { headers: { 'user-agent': this.userAgent } });
      // A missing/failed robots.txt is standard-convention "allow all", not "block all" —
      // never invent a restriction that isn't actually published.
      rules = res.ok ? parseRobotsTxt(await res.text()) : { groups: [] };
    } catch {
      rules = { groups: [] };
    }

    this.cache.set(domain, { rules, fetchedDate: today });
    return rules;
  }

  async isAllowed(domain: string, pathWithQuery: string): Promise<boolean> {
    const rules = await this.getRules(domain);
    return isPathAllowed(rules, this.userAgent, pathWithQuery);
  }
}
