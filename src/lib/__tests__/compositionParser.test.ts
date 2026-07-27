import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseComposition,
  canonicalIngredientKey,
  splitTopLevel,
  type ParsedCompositionIngredient,
} from '../compositionParser';
import { HAND_AUTHORED, REAL_WORLD_CLEAN, KNOWN_HARD } from './fixtures/compositionCorpus';

function names(list: ParsedCompositionIngredient[]): string[] {
  return list.map((i) => i.name);
}

test('splitTopLevel: does not split inside parens', () => {
  assert.deepEqual(splitTopLevel('Chicken (26%, of which fresh 14%), Rice, Minerals'), [
    'Chicken (26%, of which fresh 14%)',
    'Rice',
    'Minerals',
  ]);
});

test('percentage after name, no parens', () => {
  const { ingredients, needsReview } = parseComposition('Chicken 26%, Rice 20%, Minerals');
  assert.equal(needsReview, false);
  assert.deepEqual(names(ingredients), ['Chicken', 'Rice', 'Minerals']);
  assert.equal(ingredients[0].inclusion_pct, 26);
  assert.equal(ingredients[1].inclusion_pct, 20);
  assert.equal(ingredients[2].inclusion_pct, null);
});

test('percentage before name', () => {
  const { ingredients, needsReview } = parseComposition('26% Chicken, 20% Rice, Minerals');
  assert.equal(needsReview, false);
  assert.equal(ingredients[0].name, 'Chicken');
  assert.equal(ingredients[0].inclusion_pct, 26);
  assert.equal(ingredients[1].name, 'Rice');
  assert.equal(ingredients[1].inclusion_pct, 20);
});

test('percentage in parens', () => {
  const { ingredients, needsReview } = parseComposition('Chicken (26%), Rice (20%), Minerals');
  assert.equal(needsReview, false);
  assert.equal(ingredients[0].name, 'Chicken');
  assert.equal(ingredients[0].inclusion_pct, 26);
});

test('nested "of which" percentage produces a sub-ingredient with parent inclusion_pct preserved', () => {
  const { ingredients, needsReview } = parseComposition(
    'Meat and animal derivatives (26%, of which fresh chicken 14%), Rice (20%), Minerals'
  );
  assert.equal(needsReview, false);
  const parent = ingredients[0];
  assert.equal(parent.name, 'Meat and animal derivatives');
  assert.equal(parent.inclusion_pct, 26);
  assert.equal(parent.category, 'legal_category');
  assert.equal(parent.sub.length, 1);
  assert.equal(parent.sub[0].name, 'fresh chicken');
  assert.equal(parent.sub[0].inclusion_pct, 14);
});

test('leading percentage on parent with a bracketed sub-list', () => {
  const { ingredients, needsReview } = parseComposition(
    '70% Meat and animal derivatives (4% turkey, 4% game), vegetables (4% carrots), minerals'
  );
  assert.equal(needsReview, false);
  const parent = ingredients[0];
  assert.equal(parent.name, 'Meat and animal derivatives');
  assert.equal(parent.inclusion_pct, 70);
  assert.equal(parent.sub.length, 2);
  assert.equal(parent.sub[0].name, 'turkey');
  assert.equal(parent.sub[0].inclusion_pct, 4);
  assert.equal(parent.sub[1].name, 'game');
  assert.equal(parent.sub[1].inclusion_pct, 4);
});

test('legal category terms are flagged distinctly from named ingredients', () => {
  const { ingredients } = parseComposition('Cereals, Chicken, Minerals, Oils and fats');
  assert.equal(ingredients[0].category, 'legal_category'); // Cereals
  assert.equal(ingredients[1].category, null); // Chicken
  assert.equal(ingredients[2].category, 'legal_category'); // Minerals
  assert.equal(ingredients[3].category, 'legal_category'); // Oils and fats
});

test('derivatives of vegetable origin, various sugars, EC permitted additives are all legal categories', () => {
  const { ingredients } = parseComposition(
    'Derivatives of vegetable origin, Various sugars, EC permitted additives, Chicken'
  );
  assert.equal(ingredients[0].category, 'legal_category');
  assert.equal(ingredients[1].category, 'legal_category');
  assert.equal(ingredients[2].category, 'legal_category');
  assert.equal(ingredients[3].category, null);
});

test('additives block is parsed separately and tagged, headline stays clean', () => {
  const { ingredients, needsReview } = parseComposition(
    'Chicken 80%, Rice 20%. Additives: Vitamin A 5000 IU, Vitamin D3 500 IU'
  );
  assert.equal(needsReview, false);
  assert.equal(ingredients[0].category, null);
  assert.equal(ingredients[1].category, null);
  const additiveNames = ingredients.filter((i) => i.category === 'additive').map((i) => i.name);
  assert.ok(additiveNames.some((n) => n.toLowerCase().includes('vitamin a')));
  assert.ok(additiveNames.some((n) => n.toLowerCase().includes('vitamin d3')));
});

test('nutritional additives per kg heading is recognised', () => {
  const { ingredients } = parseComposition(
    'Chicken 80%, Rice 20%. Nutritional additives per kg: Vitamin E 40mg, Copper 12mg'
  );
  const additives = ingredients.filter((i) => i.category === 'additive');
  assert.equal(additives.length, 2);
});

test('analytical constituents block is dropped, never parsed as an ingredient', () => {
  const { ingredients } = parseComposition(
    'Chicken 80%, Rice 20%. Analytical Constituents: Protein 25%, Fat 12%, Fibre 3%'
  );
  assert.deepEqual(names(ingredients), ['Chicken', 'Rice']);
  const joined = names(ingredients).join(' ').toLowerCase();
  assert.ok(!joined.includes('protein'));
  assert.ok(!joined.includes('fibre'));
});

test('guaranteed analysis (US heading) is dropped the same way', () => {
  const { ingredients } = parseComposition(
    'Chicken, Rice, Peas. Guaranteed Analysis: Crude Protein (min) 26%, Crude Fat (min) 15%'
  );
  assert.deepEqual(names(ingredients), ['Chicken', 'Rice', 'Peas']);
});

test('a qualifier in parens with no percentage becomes a note, never a percentage', () => {
  const { ingredients } = parseComposition('Chicken Fat (preserved with Mixed Tocopherols), Rice');
  assert.equal(ingredients[0].name, 'Chicken Fat');
  assert.equal(ingredients[0].inclusion_pct, null);
  assert.equal(ingredients[0].note, 'preserved with Mixed Tocopherols');
});

test('"min X%" is never promoted to inclusion_pct — the label did not state an exact figure', () => {
  const { ingredients } = parseComposition(
    'Cereals (min 4% rice), Meat and animal derivatives (min 4% chicken), Minerals'
  );
  assert.equal(ingredients[0].inclusion_pct, null);
  assert.equal(ingredients[0].note, 'min 4% rice');
  assert.equal(ingredients[1].inclusion_pct, null);
  assert.equal(ingredients[1].note, 'min 4% chicken');
});

test('European decimal comma in a percentage is parsed correctly', () => {
  // The comma must stay inside parens: a bare "0,2%" outside parens is
  // indistinguishable from a list separator under comma-splitting, and UK
  // labels always parenthesise a decimal-comma percentage in practice.
  const { ingredients, needsReview } = parseComposition('Yeast (0,2%), Chicory powder (0,15%), Minerals');
  assert.equal(needsReview, false);
  assert.equal(ingredients[0].inclusion_pct, 0.2);
  assert.equal(ingredients[1].inclusion_pct, 0.15);
});

test('Composition:/Ingredients: label prefixes are stripped', () => {
  assert.deepEqual(names(parseComposition('Composition: Chicken 60%, Rice 40%').ingredients), ['Chicken', 'Rice']);
  assert.deepEqual(names(parseComposition('Ingredients: Chicken 60%, Rice 40%').ingredients), ['Chicken', 'Rice']);
});

test('canonicalIngredientKey: maize/corn resolve to the same key without rewriting stored names', () => {
  assert.equal(canonicalIngredientKey('Maize'), canonicalIngredientKey('Corn'));
  const { ingredients } = parseComposition('Maize, Corn, Minerals');
  // Storage is verbatim — the label's own wording is preserved.
  assert.deepEqual(names(ingredients), ['Maize', 'Corn', 'Minerals']);
});

test('canonicalIngredientKey: dried egg / egg powder synonym pair', () => {
  assert.equal(canonicalIngredientKey('dried egg'), canonicalIngredientKey('Egg powder'));
});

test('canonicalIngredientKey: poultry meal / dehydrated poultry protein synonym pair', () => {
  assert.equal(canonicalIngredientKey('Poultry meal'), canonicalIngredientKey('Dehydrated poultry protein'));
});

test('canonicalIngredientKey: unrelated ingredients get distinct keys', () => {
  assert.notEqual(canonicalIngredientKey('Chicken'), canonicalIngredientKey('Beef'));
});

test('position_in_list order is preserved exactly as printed, including duplicates', () => {
  const { ingredients } = parseComposition('Rice, Chicken, Rice, Minerals');
  assert.deepEqual(names(ingredients), ['Rice', 'Chicken', 'Rice', 'Minerals']);
});

test('empty input is flagged for review rather than silently producing nothing', () => {
  const { ingredients, needsReview, reviewReasons } = parseComposition('');
  assert.equal(ingredients.length, 0);
  assert.equal(needsReview, true);
  assert.ok(reviewReasons.length > 0);
});

test('real-crawled bug (fish4dogs.com Run 1): a thousands-separator comma in an additive amount is not misread as a list separator', () => {
  const { ingredients } = parseComposition(
    'Salmon (27%), Potato (21%). Additives (per kg): Vitamins: Vitamin A (Retinyl acetate) 22,500 IU, Vitamin D3 900 IU.'
  );
  const additive = ingredients.find((i) => i.category === 'additive' && i.name.toLowerCase().includes('vitamin a'));
  assert.ok(additive, `expected a Vitamin A additive entry, got: ${JSON.stringify(ingredients)}`);
  assert.match(additive!.name, /22,500/, 'the thousands separator must survive intact, not be split into "22" and "500 IU"');
  assert.equal(ingredients.find((i) => i.name.includes('900 IU'))?.name, 'Vitamin D3 900 IU');
  // needsReview stays true here for an unrelated, honest reason: "(Retinyl
  // acetate)" is a mid-string qualifier paren, not a trailing one, which
  // splitTrailingParen doesn't resolve — correctly left flagged rather than
  // silently mishandled. The thousands-comma bug this test targets is fixed.
});

test('real-crawled bug: "Additives (per kg):" with the qualifier in parens is recognised as a section heading, not just "Additives per kg:"', () => {
  const { ingredients } = parseComposition('Chicken 80%, Rice 20%. Additives (per kg): Vitamin E 40mg.');
  assert.equal(ingredients.filter((i) => i.category === 'additive').length, 1);
});

test('real-crawled bug (emea.acana.com Run 1): "ADDITIVES (per kg)" with no colon at all is still recognised as a heading, not glued onto the last headline ingredient', () => {
  const { ingredients } = parseComposition('Turmeric. ADDITIVES (per kg) Technological additives: Citric acid 40mg.');
  const turmeric = ingredients.find((i) => i.name.toLowerCase() === 'turmeric');
  assert.ok(turmeric, `expected a clean "Turmeric" entry, got: ${JSON.stringify(ingredients)}`);
  assert.equal(ingredients.some((i) => i.category === 'additive'), true);
});

test('"additives" used inline as a legal-category term (no "per kg", no colon) is NOT mistaken for a section heading', () => {
  const { ingredients } = parseComposition('Cereals, EC permitted additives, Minerals');
  assert.equal(ingredients.filter((i) => i.category === 'additive').length, 0);
  assert.equal(ingredients.some((i) => i.name.toLowerCase() === 'ec permitted additives'), true);
});

test('a genuine European decimal comma is still parsed correctly alongside thousands-separator protection (no regression)', () => {
  const { ingredients } = parseComposition('Yeast (0,2%), Chicory powder (0,15%), Minerals');
  assert.equal(ingredients[0].inclusion_pct, 0.2);
  assert.equal(ingredients[1].inclusion_pct, 0.15);
});

test('real bug (3 Bakers foods): footnote asterisks on a bare legal-category token must not defeat matching', () => {
  const { ingredients } = parseComposition('Cereals, Meat and Animal Derivatives, Vegetables* **, Minerals');
  const veg = ingredients.find((i) => i.name.toLowerCase().includes('vegetable'));
  assert.ok(veg, `expected a vegetables entry, got: ${JSON.stringify(ingredients)}`);
  assert.equal(veg!.category, 'legal_category');
});

test('every hand-authored fixture parses without throwing and yields at least one ingredient', () => {
  for (const { description, raw } of HAND_AUTHORED) {
    assert.doesNotThrow(() => parseComposition(raw), description);
    const result = parseComposition(raw);
    assert.ok(result.ingredients.length > 0, `${description}: expected at least one ingredient`);
  }
});

test('coverage: hand-authored + real-world-clean corpus clears >=80% unaided (needsReview === false)', () => {
  const corpus = [...HAND_AUTHORED.map((c) => c.raw), ...REAL_WORLD_CLEAN];
  let clean = 0;
  const dirty: string[] = [];
  for (const raw of corpus) {
    const result = parseComposition(raw);
    if (!result.needsReview) clean++;
    else dirty.push(raw);
  }
  const rate = clean / corpus.length;
  assert.ok(
    rate >= 0.8,
    `Coverage ${(rate * 100).toFixed(1)}% is below the 80% target. Flagged: ${JSON.stringify(dirty, null, 2)}`
  );
});

test('every ingredient/sub-ingredient inclusion_pct, when present, is within 0-100', () => {
  function checkAll(list: ParsedCompositionIngredient[]) {
    for (const item of list) {
      if (item.inclusion_pct !== null) {
        assert.ok(item.inclusion_pct >= 0 && item.inclusion_pct <= 100, `${item.name}: ${item.inclusion_pct}`);
      }
      checkAll(item.sub);
    }
  }
  for (const raw of [...HAND_AUTHORED.map((c) => c.raw), ...REAL_WORLD_CLEAN]) {
    checkAll(parseComposition(raw).ingredients);
  }
});

test('known-hard real-world strings never throw, even when they cannot be fully resolved', () => {
  for (const raw of KNOWN_HARD) {
    assert.doesNotThrow(() => parseComposition(raw));
  }
});
