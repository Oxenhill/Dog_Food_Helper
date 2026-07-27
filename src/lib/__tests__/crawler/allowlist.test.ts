import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateAllowlistEntry, normalizeDomain, type AllowlistEntry } from '../../crawler/allowlist';

function entry(overrides: Partial<AllowlistEntry> = {}): AllowlistEntry {
  return {
    domain: 'example.com',
    approved: true,
    robots_txt_checked_at: '2026-07-27T00:00:00Z',
    tos_reviewed_at: '2026-07-27T00:00:00Z',
    ...overrides,
  };
}

test('a domain not in the allowlist at all is never crawlable', () => {
  const result = evaluateAllowlistEntry(null);
  assert.equal(result.allowed, false);
  assert.match(result.reason, /not present/);
});

test('regression: approved=true with null review dates must never be crawlable', () => {
  // This is the exact bug found and fixed in source_domain_allowlist this
  // session — a domain that says "approved" but was never actually reviewed.
  const result = evaluateAllowlistEntry(
    entry({ approved: true, robots_txt_checked_at: null, tos_reviewed_at: null })
  );
  assert.equal(result.allowed, false);
});

test('robots.txt reviewed but ToS not reviewed is not crawlable', () => {
  const result = evaluateAllowlistEntry(
    entry({ approved: true, robots_txt_checked_at: '2026-07-27T00:00:00Z', tos_reviewed_at: null })
  );
  assert.equal(result.allowed, false);
  assert.match(result.reason, /Terms of Service/);
});

test('both reviewed but not yet approved is not crawlable', () => {
  const result = evaluateAllowlistEntry(entry({ approved: false }));
  assert.equal(result.allowed, false);
  assert.match(result.reason, /not approved/);
});

test('both reviewed and approved is crawlable', () => {
  const result = evaluateAllowlistEntry(entry());
  assert.equal(result.allowed, true);
});

test('normalizeDomain strips a leading www.', () => {
  assert.equal(normalizeDomain('www.zooplus.co.uk'), 'zooplus.co.uk');
  assert.equal(normalizeDomain('zooplus.co.uk'), 'zooplus.co.uk');
  assert.equal(normalizeDomain('WWW.Zooplus.co.uk'), 'zooplus.co.uk');
});
