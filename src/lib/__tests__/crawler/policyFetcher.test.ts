import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PolicyFetcher, CRAWLER_USER_AGENT } from '../../crawler/policyFetcher';
import { DomainRateLimiter } from '../../crawler/rateLimiter';
import type { AllowlistCheckResult } from '../../crawler/allowlist';

function allow(): Promise<AllowlistCheckResult> {
  return Promise.resolve({ allowed: true, reason: 'approved, with both robots.txt and ToS review recorded' });
}
function deny(reason = 'domain is not approved'): Promise<AllowlistCheckResult> {
  return Promise.resolve({ allowed: false, reason });
}

function noWaitRateLimiter() {
  return new DomainRateLimiter({ now: () => 0, sleep: async () => {} });
}

function fakeCache() {
  const store = new Map<string, { url: string; fetchDate: string; status: number; headers: Record<string, string>; body: string }>();
  return {
    get: async (url: string, fetchDate: string) => store.get(`${fetchDate}::${url}`) ?? null,
    set: async (entry: { url: string; fetchDate: string; status: number; headers: Record<string, string>; body: string }) => {
      store.set(`${entry.fetchDate}::${entry.url}`, entry);
    },
    _store: store,
  };
}

function allowPath() {
  return { isAllowed: async () => true };
}
function denyPath(reasonPath = '/blocked-path') {
  return { isAllowed: async (_domain: string, path: string) => path !== reasonPath };
}

test('a path robots.txt disallows is never fetched, even though the domain itself is allowlisted', async () => {
  let fetchCalled = false;
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    robotsGate: denyPath('/checkout.php'),
    fetchImpl: async () => {
      fetchCalled = true;
      return { ok: true, status: 200, text: async () => 'body' };
    },
  });

  const result = await fetcher.fetch('https://example.com/checkout.php');
  assert.equal(result.ok, false);
  assert.match(result.error!, /blocked by robots\.txt/);
  assert.equal(fetchCalled, false);
});

test('a path robots.txt allows proceeds normally', async () => {
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    robotsGate: allowPath(),
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'ok' }),
  });

  const result = await fetcher.fetch('https://example.com/products/123');
  assert.equal(result.ok, true);
});

test('omitting robotsGate entirely preserves the old domain-only behaviour (backwards compatible)', async () => {
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'ok' }),
  });
  const result = await fetcher.fetch('https://example.com/checkout.php');
  assert.equal(result.ok, true);
});

test('the robots.txt check receives the path+query, not the whole URL', async () => {
  let seenPath: string | undefined;
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    robotsGate: {
      isAllowed: async (_domain, path) => {
        seenPath = path;
        return true;
      },
    },
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'ok' }),
  });
  await fetcher.fetch('https://example.com/search?q=chicken&page=2');
  assert.equal(seenPath, '/search?q=chicken&page=2');
});

test('a domain the allowlist rejects is never fetched', async () => {
  let fetchCalled = false;
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: () => deny('domain is not approved'),
    rateLimiter: noWaitRateLimiter(),
    fetchImpl: async () => {
      fetchCalled = true;
      return { ok: true, status: 200, text: async () => 'body' };
    },
  });

  const result = await fetcher.fetch('https://blocked.example.com/product');
  assert.equal(result.ok, false);
  assert.match(result.error!, /blocked by allowlist/);
  assert.equal(fetchCalled, false);
});

test('a successful fetch sends the project user-agent and returns the body', async () => {
  let seenHeaders: Record<string, string> | undefined;
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    fetchImpl: async (_url, init) => {
      seenHeaders = init?.headers;
      return { ok: true, status: 200, text: async () => '<html>ok</html>' };
    },
  });

  const result = await fetcher.fetch('https://example.com/product');
  assert.equal(result.ok, true);
  assert.equal(result.body, '<html>ok</html>');
  assert.equal(result.fromCache, false);
  assert.equal(seenHeaders?.['user-agent'], CRAWLER_USER_AGENT);
});

test('a cache hit is served without calling fetch at all', async () => {
  const cache = fakeCache();
  await cache.set({ url: 'https://example.com/product', fetchDate: '2026-07-27', status: 200, headers: {}, body: 'cached body' });

  let fetchCalled = false;
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    cache: cache as never,
    now: () => Date.UTC(2026, 6, 27, 12, 0),
    fetchImpl: async () => {
      fetchCalled = true;
      return { ok: true, status: 200, text: async () => 'live body' };
    },
  });

  const result = await fetcher.fetch('https://example.com/product');
  assert.equal(result.fromCache, true);
  assert.equal(result.body, 'cached body');
  assert.equal(fetchCalled, false);
});

test('a fresh fetch writes through to the cache', async () => {
  const cache = fakeCache();
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    cache: cache as never,
    now: () => Date.UTC(2026, 6, 27, 12, 0),
    fetchImpl: async () => ({ ok: true, status: 200, text: async () => 'fresh body' }),
  });

  await fetcher.fetch('https://example.com/product');
  const cached = await cache.get('https://example.com/product', '2026-07-27');
  assert.equal(cached?.body, 'fresh body');
});

test('a 500 is retried with exponential backoff and succeeds on a later attempt', async () => {
  const sleeps: number[] = [];
  let calls = 0;
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async () => {
      calls++;
      if (calls < 3) return { ok: false, status: 503, text: async () => '' };
      return { ok: true, status: 200, text: async () => 'recovered' };
    },
  });

  const result = await fetcher.fetch('https://example.com/product');
  assert.equal(result.ok, true);
  assert.equal(result.body, 'recovered');
  assert.equal(calls, 3);
  assert.deepEqual(sleeps, [1000, 2000]); // exponential: base * 2^0, base * 2^1
});

test('a non-retryable status (404) fails immediately without backoff', async () => {
  let calls = 0;
  const sleeps: number[] = [];
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    sleep: async (ms) => {
      sleeps.push(ms);
    },
    fetchImpl: async () => {
      calls++;
      return { ok: false, status: 404, text: async () => '' };
    },
  });

  const result = await fetcher.fetch('https://example.com/missing');
  assert.equal(result.ok, false);
  assert.equal(calls, 1);
  assert.deepEqual(sleeps, []);
});

test('hard stop: after 3 consecutive failed requests, the 4th is refused without any network call', async () => {
  let calls = 0;
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    sleep: async () => {},
    maxAttemptsPerRequest: 1, // one attempt per logical request, so 3 requests = 3 failures
    fetchImpl: async () => {
      calls++;
      return { ok: false, status: 500, text: async () => '' };
    },
  });

  await fetcher.fetch('https://flaky.example.com/1');
  await fetcher.fetch('https://flaky.example.com/2');
  await fetcher.fetch('https://flaky.example.com/3');
  assert.equal(calls, 3);

  const fourth = await fetcher.fetch('https://flaky.example.com/4');
  assert.equal(fourth.ok, false);
  assert.match(fourth.error!, /hard stop/);
  assert.equal(calls, 3, 'the 4th call must not reach the network at all');
});

test('a success resets the consecutive-failure counter for that domain', async () => {
  let shouldFail = true;
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    sleep: async () => {},
    maxAttemptsPerRequest: 1,
    fetchImpl: async () => {
      if (shouldFail) return { ok: false, status: 500, text: async () => '' };
      return { ok: true, status: 200, text: async () => 'ok' };
    },
  });

  await fetcher.fetch('https://example.com/1');
  await fetcher.fetch('https://example.com/2');
  assert.equal(fetcher.failureCount('example.com'), 2);

  shouldFail = false;
  await fetcher.fetch('https://example.com/3');
  assert.equal(fetcher.failureCount('example.com'), 0);
});

test('failure counters are tracked per-domain, not globally', async () => {
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    sleep: async () => {},
    maxAttemptsPerRequest: 1,
    fetchImpl: async (url) => {
      if (url.includes('bad.example.com')) return { ok: false, status: 500, text: async () => '' };
      return { ok: true, status: 200, text: async () => 'ok' };
    },
  });

  await fetcher.fetch('https://bad.example.com/1');
  await fetcher.fetch('https://bad.example.com/2');
  await fetcher.fetch('https://good.example.com/1');

  assert.equal(fetcher.failureCount('bad.example.com'), 2);
  assert.equal(fetcher.failureCount('good.example.com'), 0);
});

test('a network throw is treated as a retryable failure, not an uncaught exception', async () => {
  let calls = 0;
  const fetcher = new PolicyFetcher({
    isDomainCrawlable: allow,
    rateLimiter: noWaitRateLimiter(),
    sleep: async () => {},
    fetchImpl: async () => {
      calls++;
      if (calls < 2) throw new Error('ECONNRESET');
      return { ok: true, status: 200, text: async () => 'ok after retry' };
    },
  });

  const result = await fetcher.fetch('https://example.com/flaky');
  assert.equal(result.ok, true);
  assert.equal(result.body, 'ok after retry');
});
