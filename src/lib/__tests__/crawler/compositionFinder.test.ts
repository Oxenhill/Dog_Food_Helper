import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findCompositionExcerpt, findCompositionExcerptInHtml } from '../../crawler/compositionFinder';

test('finds a Composition: heading and returns the excerpt from there', () => {
  const result = findCompositionExcerpt('Some intro text. Composition: Chicken 60%, Rice 40%. More detail.');
  assert.ok(result);
  assert.match(result!.excerpt, /^Composition: Chicken 60%, Rice 40%/);
});

test('returns null when no heading is present', () => {
  assert.equal(findCompositionExcerpt('This page has no ingredient information at all, just marketing copy.'), null);
});

test('real-crawled bug (fish4dogs.com Run 1): excerpt stops at page furniture (feeding calculator) instead of running to maxChars', () => {
  const text =
    'Composition: Salmon (27%), Potato (21%), Minerals. Analytical Constituents: Crude Protein 26%, Fat Content 12%. ' +
    'Metabolic Energy: 367 kcal/100g Feeding Guide Feeding Calculator Please select your dog\'s age : 1 year old 2 years old ' +
    '3 years old Please select your dog\'s weight : 1kg 2kg 3kg 4kg';
  const result = findCompositionExcerpt(text, 2000);
  assert.ok(result);
  assert.ok(!result!.excerpt.includes('Feeding Calculator'), 'excerpt must not run into the feeding widget');
  assert.ok(!result!.excerpt.includes('1kg 2kg 3kg'), 'excerpt must not run into the weight-picker options');
  // The Analytical Constituents block itself is real label content and stays — it's useful context for a reviewer even though it isn't parsed as an ingredient.
  assert.ok(result!.excerpt.includes('Analytical Constituents'));
  assert.ok(result!.excerpt.includes('Metabolic Energy'));
});

test('an excerpt with no page-furniture marker is unaffected — only the maxChars cap applies', () => {
  const text = 'Composition: Chicken 60%, Rice 40%. Analytical Constituents: Protein 25%.';
  const result = findCompositionExcerpt(text, 2000);
  assert.equal(result!.excerpt, text);
});

test('findCompositionExcerptInHtml strips tags before searching', () => {
  const html = '<div><p>Info</p><p>Composition: <b>Chicken</b> 60%, Rice 40%.</p></div>';
  const result = findCompositionExcerptInHtml(html);
  assert.ok(result);
  assert.match(result!.excerpt, /^Composition: Chicken 60%, Rice 40%/);
});
