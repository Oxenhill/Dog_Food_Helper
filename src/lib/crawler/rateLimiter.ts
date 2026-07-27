/**
 * Per-domain rate limiter. One connection per domain: every fetch for a
 * domain must `await wait(domain)` immediately before the request, and
 * callers must not fire a second request for the same domain without
 * awaiting the previous one's wait() first — this class only serializes the
 * *spacing*, not concurrent calls, so a caller that races two requests to
 * the same domain in parallel can still defeat it.
 */

export interface RateLimiterOptions {
  /** Default minimum gap between requests to the same domain, ms. Spec default: 2000 (1 req / 2s). */
  defaultIntervalMs?: number;
  /** Per-domain overrides, e.g. zooplus.co.uk -> 5000 regardless of what its robots.txt actually requires of named bots. */
  perDomainIntervalMs?: Record<string, number>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class DomainRateLimiter {
  private readonly lastRequestAt = new Map<string, number>();
  private readonly defaultIntervalMs: number;
  private readonly perDomainIntervalMs: Record<string, number>;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(options: RateLimiterOptions = {}) {
    this.defaultIntervalMs = options.defaultIntervalMs ?? 2000;
    this.perDomainIntervalMs = options.perDomainIntervalMs ?? {};
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
  }

  intervalFor(domain: string): number {
    return this.perDomainIntervalMs[domain] ?? this.defaultIntervalMs;
  }

  /** Blocks until it's this domain's turn, then reserves the slot for the next caller. */
  async wait(domain: string): Promise<void> {
    const interval = this.intervalFor(domain);
    const last = this.lastRequestAt.get(domain);
    if (last !== undefined) {
      const remaining = interval - (this.now() - last);
      if (remaining > 0) await this.sleep(remaining);
    }
    this.lastRequestAt.set(domain, this.now());
  }
}

/** zooplus.co.uk's robots.txt only requires 5s of named bots (bingbot/msnbot) — applied to ourselves anyway, per project instructions, regardless of what a generic UA is technically bound by. */
export const ZOOPLUS_INTERVAL_MS = 5000;
