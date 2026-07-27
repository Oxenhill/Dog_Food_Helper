import { DomainRateLimiter } from './rateLimiter';
import { RawResponseCache, cacheDateFor } from './rawCache';
import { normalizeDomain, type AllowlistCheckResult } from './allowlist';
import type { RobotsGate } from './robotsGate';

/**
 * The one place every Phase 2 network request goes through. Combines the
 * allowlist gate (one-time human review), per-path robots.txt evaluation
 * (live, on every URL — necessary once an adapter walks many paths on one
 * domain rather than one known-safe endpoint), rate limiting, the
 * raw-response cache, and retry/hard-stop behaviour, so no adapter can
 * accidentally skip one of them by calling fetch() directly.
 */

export const CRAWLER_USER_AGENT = 'DogSmartDB/1.0 (+trainers@dogsmarttrainingbehaviour.co.uk)';

const DEFAULT_MAX_CONSECUTIVE_FAILURES = 3;
const DEFAULT_MAX_ATTEMPTS_PER_REQUEST = 3;
const DEFAULT_BACKOFF_BASE_MS = 1000;

export type FetchImpl = (url: string, init?: { headers?: Record<string, string> }) => Promise<{
  ok: boolean;
  status: number;
  text: () => Promise<string>;
}>;

export interface PolicyFetchResult {
  ok: boolean;
  status?: number;
  body?: string;
  fromCache: boolean;
  /** Set when ok is false: why. Never throws for a normal fetch failure — callers check this instead. */
  error?: string;
}

export interface PolicyFetcherOptions {
  isDomainCrawlable: (domain: string) => Promise<AllowlistCheckResult>;
  rateLimiter: DomainRateLimiter;
  cache?: RawResponseCache;
  /**
   * Per-path robots.txt check, evaluated on every URL when supplied.
   * Optional — omitting it preserves the old domain-only behaviour, which
   * existing tests and single-known-endpoint adapters (Forthglade's
   * /products.json) rely on — but any adapter walking multiple/unknown
   * paths on a domain (a sitemap crawl) MUST be given one.
   */
  robotsGate?: Pick<RobotsGate, 'isAllowed'>;
  fetchImpl?: FetchImpl;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  maxConsecutiveFailures?: number;
  maxAttemptsPerRequest?: number;
  backoffBaseMs?: number;
}

const defaultSleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export class PolicyFetcher {
  private readonly consecutiveFailures = new Map<string, number>();
  private readonly isDomainCrawlable: PolicyFetcherOptions['isDomainCrawlable'];
  private readonly rateLimiter: DomainRateLimiter;
  private readonly cache?: RawResponseCache;
  private readonly robotsGate?: Pick<RobotsGate, 'isAllowed'>;
  private readonly fetchImpl: FetchImpl;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly maxConsecutiveFailures: number;
  private readonly maxAttemptsPerRequest: number;
  private readonly backoffBaseMs: number;

  constructor(options: PolicyFetcherOptions) {
    this.isDomainCrawlable = options.isDomainCrawlable;
    this.rateLimiter = options.rateLimiter;
    this.cache = options.cache;
    this.robotsGate = options.robotsGate;
    this.fetchImpl = options.fetchImpl ?? (fetch as unknown as FetchImpl);
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? defaultSleep;
    this.maxConsecutiveFailures = options.maxConsecutiveFailures ?? DEFAULT_MAX_CONSECUTIVE_FAILURES;
    this.maxAttemptsPerRequest = options.maxAttemptsPerRequest ?? DEFAULT_MAX_ATTEMPTS_PER_REQUEST;
    this.backoffBaseMs = options.backoffBaseMs ?? DEFAULT_BACKOFF_BASE_MS;
  }

  /** Consecutive-failure count for a domain, for callers that want to surface it (e.g. an admin dashboard). */
  failureCount(domain: string): number {
    return this.consecutiveFailures.get(domain) ?? 0;
  }

  async fetch(url: string): Promise<PolicyFetchResult> {
    let domain: string;
    try {
      domain = normalizeDomain(new URL(url).hostname);
    } catch {
      return { ok: false, fromCache: false, error: `not a valid URL: ${url}` };
    }

    const allowlistResult = await this.isDomainCrawlable(domain);
    if (!allowlistResult.allowed) {
      return { ok: false, fromCache: false, error: `blocked by allowlist: ${allowlistResult.reason}` };
    }

    if (this.robotsGate) {
      let pathWithQuery: string;
      try {
        const parsed = new URL(url);
        pathWithQuery = parsed.pathname + parsed.search;
      } catch {
        return { ok: false, fromCache: false, error: `not a valid URL: ${url}` };
      }
      const robotsAllowed = await this.robotsGate.isAllowed(domain, pathWithQuery);
      if (!robotsAllowed) {
        return { ok: false, fromCache: false, error: `blocked by robots.txt: ${pathWithQuery} disallowed for ${domain}` };
      }
    }

    const fetchDate = cacheDateFor(this.now());
    if (this.cache) {
      const cached = await this.cache.get(url, fetchDate);
      if (cached) {
        return { ok: true, status: cached.status, body: cached.body, fromCache: true };
      }
    }

    if (this.failureCount(domain) >= this.maxConsecutiveFailures) {
      return {
        ok: false,
        fromCache: false,
        error: `hard stop: ${this.failureCount(domain)} consecutive failures for ${domain}`,
      };
    }

    await this.rateLimiter.wait(domain);
    return this.fetchWithRetry(url, domain, fetchDate);
  }

  private async fetchWithRetry(url: string, domain: string, fetchDate: string): Promise<PolicyFetchResult> {
    let lastError: string | undefined;
    let lastStatus: number | undefined;

    for (let attempt = 1; attempt <= this.maxAttemptsPerRequest; attempt++) {
      let res: { ok: boolean; status: number; text: () => Promise<string> } | undefined;
      try {
        res = await this.fetchImpl(url, { headers: { 'user-agent': CRAWLER_USER_AGENT } });
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err);
      }

      if (res?.ok) {
        this.consecutiveFailures.set(domain, 0);
        const body = await res.text();
        if (this.cache) {
          await this.cache.set({ url, fetchDate, status: res.status, headers: {}, body });
        }
        return { ok: true, status: res.status, body, fromCache: false };
      }

      lastStatus = res?.status;
      const retryable = !res || res.status === 429 || res.status >= 500;
      if (!retryable) break;
      if (attempt < this.maxAttemptsPerRequest) {
        await this.sleep(this.backoffBaseMs * 2 ** (attempt - 1));
      }
    }

    const newFailureCount = this.failureCount(domain) + 1;
    this.consecutiveFailures.set(domain, newFailureCount);

    return {
      ok: false,
      fromCache: false,
      status: lastStatus,
      error: lastError ?? `HTTP ${lastStatus} after ${this.maxAttemptsPerRequest} attempt(s)`,
    };
  }
}
