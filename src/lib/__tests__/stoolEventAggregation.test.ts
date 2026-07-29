import assert from 'node:assert/strict';
import test from 'node:test';
import { deriveDailyStoolSummaries } from '../stoolEventAggregation';

test('derives count, highest loose-stool score, median and spread per day', () => {
  const summaries = deriveDailyStoolSummaries([
    {
      id: 'a',
      occurred_on: '2026-07-29',
      occurred_at: '2026-07-29T07:00:00Z',
      score: 2,
      created_at: '2026-07-29T07:00:00Z',
    },
    {
      id: 'b',
      occurred_on: '2026-07-29',
      occurred_at: '2026-07-29T12:00:00Z',
      score: 5,
      mucus: true,
      created_at: '2026-07-29T12:00:00Z',
    },
    {
      id: 'c',
      occurred_on: '2026-07-29',
      occurred_at: '2026-07-29T20:00:00Z',
      score: 3,
      created_at: '2026-07-29T20:00:00Z',
    },
  ]);

  assert.deepEqual(summaries, [
    {
      date: '2026-07-29',
      count: 3,
      scored_count: 3,
      unscored_count: 0,
      worst_score: 5,
      median_score: 3,
      spread: 3,
      flags: {
        mucus: true,
        blood: false,
        urgency: false,
        straining: false,
        undigested_food: false,
      },
    },
  ]);
});

test('counts provenance-only legacy events without inventing a score', () => {
  const [summary] = deriveDailyStoolSummaries([
    {
      id: 'legacy',
      occurred_on: '2026-07-28',
      occurred_at: null,
      score: null,
      created_at: '2026-07-28T22:00:00Z',
    },
  ]);

  assert.equal(summary.count, 1);
  assert.equal(summary.scored_count, 0);
  assert.equal(summary.unscored_count, 1);
  assert.equal(summary.worst_score, null);
  assert.equal(summary.median_score, null);
  assert.equal(summary.spread, null);
});

test('keeps calendar days separate and returns newest day first', () => {
  const summaries = deriveDailyStoolSummaries([
    {
      id: 'old',
      occurred_on: '2026-07-28',
      score: 2,
      created_at: '2026-07-28T08:00:00Z',
    },
    {
      id: 'new',
      occurred_on: '2026-07-29',
      score: 4,
      created_at: '2026-07-29T08:00:00Z',
    },
  ]);

  assert.deepEqual(
    summaries.map((summary) => summary.date),
    ['2026-07-29', '2026-07-28']
  );
});
