import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DomainRateLimiter, ZOOPLUS_INTERVAL_MS } from '../../crawler/rateLimiter';

function fakeClock(startMs = 0) {
  let current = startMs;
  const sleeps: number[] = [];
  const now = () => current;
  const sleep = async (ms: number) => {
    sleeps.push(ms);
    current += ms; // simulate time passing during the sleep
  };
  return { now, sleep, sleeps, advance: (ms: number) => (current += ms) };
}

test('first request for a domain never waits', async () => {
  const clock = fakeClock();
  const limiter = new DomainRateLimiter({ now: clock.now, sleep: clock.sleep });
  await limiter.wait('example.com');
  assert.deepEqual(clock.sleeps, []);
});

test('a second request within the interval waits exactly the remainder', async () => {
  const clock = fakeClock();
  const limiter = new DomainRateLimiter({ now: clock.now, sleep: clock.sleep, defaultIntervalMs: 2000 });
  await limiter.wait('example.com');
  clock.advance(500); // only 500ms passed
  await limiter.wait('example.com');
  assert.deepEqual(clock.sleeps, [1500]);
});

test('a request after the interval has already elapsed does not wait', async () => {
  const clock = fakeClock();
  const limiter = new DomainRateLimiter({ now: clock.now, sleep: clock.sleep, defaultIntervalMs: 2000 });
  await limiter.wait('example.com');
  clock.advance(3000);
  await limiter.wait('example.com');
  assert.deepEqual(clock.sleeps, []);
});

test('different domains do not share a rate-limit slot', async () => {
  const clock = fakeClock();
  const limiter = new DomainRateLimiter({ now: clock.now, sleep: clock.sleep, defaultIntervalMs: 2000 });
  await limiter.wait('a.com');
  await limiter.wait('b.com');
  assert.deepEqual(clock.sleeps, []);
});

test('per-domain override interval is honoured, e.g. zooplus at 5s', async () => {
  const clock = fakeClock();
  const limiter = new DomainRateLimiter({
    now: clock.now,
    sleep: clock.sleep,
    defaultIntervalMs: 2000,
    perDomainIntervalMs: { 'zooplus.co.uk': ZOOPLUS_INTERVAL_MS },
  });
  await limiter.wait('zooplus.co.uk');
  clock.advance(1000);
  await limiter.wait('zooplus.co.uk');
  assert.deepEqual(clock.sleeps, [4000]);
});
