import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  dogNeedsIngredientGate,
  filterCandidateFoods,
  foodLifeStageEligibility,
  type CandidateFoodRow,
} from '../hardFilter';

function food(overrides: Partial<CandidateFoodRow> = {}): CandidateFoodRow {
  return {
    id: 'food',
    name: 'Everyday complete food',
    ingredient_data_status: 'complete',
    product_availability_status: 'available',
    suitable_age_min_months: null,
    suitable_age_max_months: null,
    ...overrides,
  };
}

test('dogNeedsIngredientGate: gate applies when the dog has a restriction', () => {
  assert.equal(dogNeedsIngredientGate(true, false), true);
});

test('dogNeedsIngredientGate: gate applies when the dog has an approved ingredient contraindication', () => {
  assert.equal(dogNeedsIngredientGate(false, true), true);
});

test('dogNeedsIngredientGate: no gate when the dog has neither', () => {
  assert.equal(dogNeedsIngredientGate(false, false), false);
});

test('regression: a dog with a restriction must never be offered a food with no transcribed ingredients', () => {
  // This is the exact bug the gate exists to close: an incomplete/ambiguous
  // ingredient record has nothing for an allergen match to hit, so without
  // the gate it silently passes as "no restricted ingredient found".
  const foods: CandidateFoodRow[] = [
    food({ id: 'no-ingredients', ingredient_data_status: 'identity_ambiguous' }),
    food({ id: 'has-chicken' }),
  ];

  const result = filterCandidateFoods(foods, {
    needsIngredientGate: dogNeedsIngredientGate(/* hasIngredientRestrictions */ true, false),
    foodIdsWithIngredients: new Set(['has-chicken']),
  });

  const resultIds = result.map((f) => f.id);
  assert.ok(!resultIds.includes('no-ingredients'), 'a food with no transcribed ingredients must be excluded once a restriction gate is active');
  assert.ok(resultIds.includes('has-chicken'));
});

test('a food marked complete but with zero food_ingredients rows is still excluded under the gate (belt and braces)', () => {
  const foods: CandidateFoodRow[] = [
    food({ id: 'complete-but-empty' }),
  ];

  const result = filterCandidateFoods(foods, {
    needsIngredientGate: true,
    foodIdsWithIngredients: new Set(), // no food_ingredients rows for this food
  });

  assert.equal(result.length, 0, 'status alone is not sufficient — the EXISTS check must also hold');
});

test('an unrestricted dog is not punished with thinner results: no gate means incomplete foods stay eligible', () => {
  const foods: CandidateFoodRow[] = [
    food({ id: 'no-ingredients', ingredient_data_status: 'identity_ambiguous' }),
  ];

  const result = filterCandidateFoods(foods, {
    needsIngredientGate: false,
    foodIdsWithIngredients: new Set(),
  });

  assert.equal(result.length, 1, 'a dog with no ingredient-based exclusion criterion should see today\'s full candidate pool');
});

test('unavailable/discontinued foods are excluded regardless of the ingredient gate', () => {
  const foods: CandidateFoodRow[] = [
    food({ id: 'discontinued', product_availability_status: 'discontinued' }),
    food({ id: 'unavailable', product_availability_status: 'unavailable' }),
    food({ id: 'available' }),
  ];

  const resultNoGate = filterCandidateFoods(foods, {
    needsIngredientGate: false,
    foodIdsWithIngredients: new Set(),
  });
  assert.deepEqual(resultNoGate.map((f) => f.id), ['available']);

  const resultWithGate = filterCandidateFoods(foods, {
    needsIngredientGate: true,
    foodIdsWithIngredients: new Set(['discontinued', 'unavailable', 'available']),
  });
  assert.deepEqual(resultWithGate.map((f) => f.id), ['available']);
});

test('adult dogs never receive foods explicitly labelled senior', () => {
  assert.deepEqual(
    foodLifeStageEligibility(
      food({ name: 'Acana Senior Dog' }),
      { lifeStage: 'adult', ageMonths: 48 }
    ),
    {
      eligible: false,
      reason: 'Senior life-stage food is not suitable for this dog’s recorded life stage.',
    }
  );
});

test('senior dogs remain eligible for foods explicitly labelled senior', () => {
  assert.equal(
    foodLifeStageEligibility(
      food({ name: 'Senior Recipe' }),
      { lifeStage: 'senior', ageMonths: 120 }
    ).eligible,
    true
  );
});

test('adult dogs never receive foods explicitly labelled puppy or junior', () => {
  assert.equal(
    foodLifeStageEligibility(
      food({ name: 'Chicken Puppy & Junior' }),
      { lifeStage: 'adult', ageMonths: 36 }
    ).eligible,
    false
  );
});

test('unrelated partial product names do not trigger life-stage labels', () => {
  assert.equal(
    foodLifeStageEligibility(
      food({ name: 'Juniper & chicken recipe' }),
      { lifeStage: 'adult', ageMonths: 36 }
    ).eligible,
    true
  );
});

test('recorded numeric age limits are strict candidate requirements', () => {
  assert.equal(
    foodLifeStageEligibility(
      food({ suitable_age_min_months: 84 }),
      { lifeStage: 'adult', ageMonths: 48 }
    ).eligible,
    false
  );
  assert.equal(
    foodLifeStageEligibility(
      food({ suitable_age_min_months: 12, suitable_age_max_months: 72 }),
      { lifeStage: 'adult', ageMonths: 48 }
    ).eligible,
    true
  );
});
