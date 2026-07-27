import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { RawResponseCache, cacheDateFor } from '../../crawler/rawCache';

async function withTempCache(fn: (cache: RawResponseCache) => Promise<void>) {
  const dir = await mkdtemp(path.join(tmpdir(), 'bowl-raw-cache-'));
  try {
    await fn(new RawResponseCache(dir));
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

test('a miss returns null, not an error', async () => {
  await withTempCache(async (cache) => {
    const result = await cache.get('https://example.com/product', '2026-07-27');
    assert.equal(result, null);
  });
});

test('set then get round-trips the exact entry', async () => {
  await withTempCache(async (cache) => {
    await cache.set({
      url: 'https://example.com/product',
      fetchDate: '2026-07-27',
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html>hello</html>',
    });
    const result = await cache.get('https://example.com/product', '2026-07-27');
    assert.deepEqual(result, {
      url: 'https://example.com/product',
      fetchDate: '2026-07-27',
      status: 200,
      headers: { 'content-type': 'text/html' },
      body: '<html>hello</html>',
    });
  });
});

test('the same URL on a different fetch date is a separate cache entry', async () => {
  await withTempCache(async (cache) => {
    await cache.set({ url: 'https://example.com/x', fetchDate: '2026-07-27', status: 200, headers: {}, body: 'old' });
    const missOnNewDate = await cache.get('https://example.com/x', '2026-07-28');
    assert.equal(missOnNewDate, null);
    await cache.set({ url: 'https://example.com/x', fetchDate: '2026-07-28', status: 200, headers: {}, body: 'new' });
    const oldStillThere = await cache.get('https://example.com/x', '2026-07-27');
    assert.equal(oldStillThere?.body, 'old');
  });
});

test('different URLs on the same date never collide', async () => {
  await withTempCache(async (cache) => {
    await cache.set({ url: 'https://example.com/a', fetchDate: '2026-07-27', status: 200, headers: {}, body: 'A' });
    await cache.set({ url: 'https://example.com/b', fetchDate: '2026-07-27', status: 200, headers: {}, body: 'B' });
    assert.equal((await cache.get('https://example.com/a', '2026-07-27'))?.body, 'A');
    assert.equal((await cache.get('https://example.com/b', '2026-07-27'))?.body, 'B');
  });
});

test('cacheDateFor formats as YYYY-MM-DD from an epoch ms clock', () => {
  const ms = Date.UTC(2026, 6, 27, 15, 30);
  assert.equal(cacheDateFor(ms), '2026-07-27');
});
