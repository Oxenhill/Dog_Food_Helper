import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveIngredientFootnotes, extractFeedingGuidance } from '../labelPanelParsing';

const PLATINUM_PANEL_TEXT = `Snacks (complementary feed) – Chicken + Lamb

Composition: fresh chicken and lamb meat 76%, fresh chicken liver, broken rice, green-lipped mussel extract, carrots*, tomatoes*, african marigold*, dandelion*, broccoli*, green tea*, chamomile*, oregano*, milk thistle seed*, cranberry seed*, seaweed*, potassium chloride. (*dried)

Analytical constituents: crude protein 24 %, crude fat 9.9 %, crude ash 6.5 %, crude fibres 2.5 %, calcium 1.5 %, phosphorus 1 %, moisture (natural content) 18 %.

Daily feeding amount: 30 – 40 Click-Bits per 10 kg of the dog's body weight per day.`;

test('resolveIngredientFootnotes folds a resolvable legend into the ingredient name', () => {
  const { resolved, needsReview } = resolveIngredientFootnotes(['carrots*', 'tomatoes*'], PLATINUM_PANEL_TEXT);
  assert.deepEqual(resolved, ['carrots (dried)', 'tomatoes (dried)']);
  assert.deepEqual(needsReview, []);
});

test('resolveIngredientFootnotes leaves non-marked ingredients untouched', () => {
  const { resolved } = resolveIngredientFootnotes(['fresh chicken and lamb meat 76%', 'potassium chloride'], PLATINUM_PANEL_TEXT);
  assert.deepEqual(resolved, ['fresh chicken and lamb meat 76%', 'potassium chloride']);
});

test('resolveIngredientFootnotes flags an unresolvable marker rather than dropping it', () => {
  const { resolved, needsReview } = resolveIngredientFootnotes(['kelp*'], 'Composition: kelp*, rice.');
  assert.deepEqual(resolved, ['kelp*']);
  assert.deepEqual(needsReview, ['kelp*']);
});

test('resolveIngredientFootnotes flags every marker when there is no panel text at all', () => {
  const { resolved, needsReview } = resolveIngredientFootnotes(['carrots*'], null);
  assert.deepEqual(resolved, ['carrots*']);
  assert.deepEqual(needsReview, ['carrots*']);
});

test('extractFeedingGuidance pulls the verbatim feeding sentence', () => {
  assert.equal(
    extractFeedingGuidance(PLATINUM_PANEL_TEXT),
    "Daily feeding amount: 30 – 40 Click-Bits per 10 kg of the dog's body weight per day."
  );
});

test('extractFeedingGuidance returns null when no feeding sentence is present', () => {
  assert.equal(extractFeedingGuidance('Composition: chicken, rice.'), null);
  assert.equal(extractFeedingGuidance(null), null);
});
