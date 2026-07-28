import assert from 'node:assert/strict';
import test from 'node:test';
import {
  findFoodMatches,
  foodMatchesFreetext,
  normalizeFoodName,
} from '../foodNameMatching';

const lennyFood = {
  id: 'c7d99e2f-948d-4c91-b684-3cf0e90147f2',
  brand: 'Farmina N&D',
  name: 'Ocean Adult Medium & Maxi',
};

const lennyFreetext =
  'Farmina N&D Ocean Adult Medium & Maxi Dog Food Cod Pumpkin & Orange';

test("Lenny's actual full marketing title matches the shorter catalogue name", () => {
  assert.equal(foodMatchesFreetext(lennyFreetext, lennyFood), true);
});

test('comparison normalisation handles punctuation, case, ampersands and Dog Food', () => {
  assert.equal(
    foodMatchesFreetext(
      'FARMINA N&D — Ocean Adult Medium & Maxi Dog Food: Cod, Pumpkin & Orange',
      lennyFood
    ),
    true
  );
});

test('containment is tested in the opposite direction too', () => {
  assert.equal(
    foodMatchesFreetext('Canagan Grain-Free Chicken', {
      brand: 'Canagan',
      name: 'Grain-Free Chicken Dog Food',
    }),
    true
  );
});

test('a matching brand with a different product does not match', () => {
  assert.equal(
    foodMatchesFreetext('Millies wolfheart forerunner', {
      brand: 'Millies Wolfheart',
      name: 'Countryside Wet Food',
    }),
    false
  );
});

test('a product-name match from another brand is rejected', () => {
  assert.equal(
    foodMatchesFreetext('Other Brand Grain-Free Chicken', {
      brand: 'Canagan',
      name: 'Grain-Free Chicken',
    }),
    false
  );
});

test('matching never changes the punctuation in the stored source string', () => {
  const entered = 'Cod, Pumpkin & Orange';
  normalizeFoodName(entered);
  assert.equal(entered, 'Cod, Pumpkin & Orange');
});

test('the audited set returns only the uniquely matching food', () => {
  const matches = findFoodMatches(lennyFreetext, [
    lennyFood,
    {
      id: 'other',
      brand: 'Farmina N&D',
      name: 'Pumpkin Puppy Mini',
    },
  ]);
  assert.deepEqual(matches.map((food) => food.id), [lennyFood.id]);
});
