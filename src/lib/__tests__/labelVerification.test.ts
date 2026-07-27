import { test } from 'node:test';
import assert from 'node:assert/strict';
import { numberAppearsInText, verifyNumericFields } from '../labelVerification';
import { isLegalCategory } from '../compositionParser';

/**
 * Fixture modelled on the labelling pattern that dropped it: Royal Canin and
 * Hill's both print a specific ingredient's percentage in a separate
 * declaration sentence ("Protein sources: ...") rather than inline in the
 * main composition list — recurs widely, per the owner's 2026-07-28 finding
 * on a Royal Canin Hypoallergenic submission.
 */
const ROYAL_CANIN_HYPOALLERGENIC_PANEL_TEXT = `
COMPOSITION: Rice flour, hydrolysed soya protein isolate, animal fats, rice,
hydrolysed poultry liver, beet pulp, minerals, soya oil,
fructo-oligosaccharides, fish oil, borage oil, marigold meal.
Protein sources: soya protein isolate (17.6%), poultry liver (5.0%), rice (48.1%).
ANALYTICAL CONSTITUENTS: Protein: 21% - Fat content: 19% - Crude ash: 6.2%
- Crude fibre: 1.1%.
`;

test('numberAppearsInText finds a percentage stated only in a separate "Protein sources:" sentence', () => {
  assert.equal(numberAppearsInText(17.6, ROYAL_CANIN_HYPOALLERGENIC_PANEL_TEXT), true);
  assert.equal(numberAppearsInText(5.0, ROYAL_CANIN_HYPOALLERGENIC_PANEL_TEXT), true);
  assert.equal(numberAppearsInText(48.1, ROYAL_CANIN_HYPOALLERGENIC_PANEL_TEXT), true);
});

test('numberAppearsInText finds an integer analytical-constituent value', () => {
  assert.equal(numberAppearsInText(21, ROYAL_CANIN_HYPOALLERGENIC_PANEL_TEXT), true);
  assert.equal(numberAppearsInText(6.2, ROYAL_CANIN_HYPOALLERGENIC_PANEL_TEXT), true);
});

test('numberAppearsInText rejects a plausible-looking but unprinted figure (the fabrication case)', () => {
  // 3900 kcal/kg never appears anywhere in this panel text.
  assert.equal(numberAppearsInText(3900, ROYAL_CANIN_HYPOALLERGENIC_PANEL_TEXT), false);
});

test('numberAppearsInText tolerates a thousands-separator comma', () => {
  assert.equal(numberAppearsInText(3900, 'Energy: 3,900 kcal/kg'), true);
});

test('verifyNumericFields keeps verified fields and nulls the rest, reporting which were rejected', () => {
  const { verified, rejected } = verifyNumericFields(
    { protein_pct: 21, calories_per_kg: 3900, moisture_pct: null },
    ROYAL_CANIN_HYPOALLERGENIC_PANEL_TEXT
  );
  assert.equal(verified.protein_pct, 21);
  assert.equal(verified.calories_per_kg, null);
  assert.equal(verified.moisture_pct, null); // was already null — not "rejected"
  assert.deepEqual(rejected, ['calories_per_kg']);
});

test('verifyNumericFields rejects every non-null field when there is no panel text to check against', () => {
  const { verified, rejected } = verifyNumericFields({ protein_pct: 21, calories_per_kg: 3900 }, null);
  assert.equal(verified.protein_pct, null);
  assert.equal(verified.calories_per_kg, null);
  assert.deepEqual(rejected.sort(), ['calories_per_kg', 'protein_pct']);
});

test('isLegalCategory flags "animal fats" and "minerals" as generic legal category declarations', () => {
  assert.equal(isLegalCategory('animal fats'), true);
  assert.equal(isLegalCategory('minerals'), true);
  assert.equal(isLegalCategory('rice flour'), false);
  assert.equal(isLegalCategory('hydrolysed poultry liver'), false);
});
