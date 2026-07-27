import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizeGtin, isValidGtin14, validateScrapedGtin } from '../gtin';

// Same five vectors verified against the SQL is_valid_gtin14 function in
// Phase 1 (BUILD_PROGRESS.md): 2 UK EAN-13, 1 UPC-A, 1 EAN-8, 1 corrupted.
test('valid EAN-13 vectors', () => {
  assert.equal(isValidGtin14(normalizeGtin('5063334025939')!), true);
  assert.equal(isValidGtin14(normalizeGtin('8717249776390')!), true);
});

test('valid UPC-A vector, zero-padded to 14', () => {
  assert.equal(isValidGtin14(normalizeGtin('036000291452')!), true);
});

test('valid EAN-8 vector, zero-padded to 14', () => {
  assert.equal(isValidGtin14(normalizeGtin('96385074')!), true);
});

test('a corrupted check digit is rejected', () => {
  // Last digit of the first valid EAN-13 above, flipped.
  assert.equal(isValidGtin14(normalizeGtin('5063334025930')!), false);
});

test('normalizeGtin strips punctuation and spaces before padding', () => {
  assert.equal(normalizeGtin('5063-3340 25939'), '05063334025939');
});

test('normalizeGtin returns null for a string with no digits', () => {
  assert.equal(normalizeGtin('n/a'), null);
});

test('validateScrapedGtin rejects null/undefined/empty without throwing', () => {
  assert.equal(validateScrapedGtin(null), null);
  assert.equal(validateScrapedGtin(undefined), null);
  assert.equal(validateScrapedGtin(''), null);
});

test('validateScrapedGtin round-trips a valid barcode to its normalized GTIN-14', () => {
  assert.equal(validateScrapedGtin('5063334025939'), '05063334025939');
});

test('validateScrapedGtin rejects a barcode whose checksum does not compute, rather than writing it', () => {
  assert.equal(validateScrapedGtin('5063334025930'), null); // same corrupted vector as above
});
