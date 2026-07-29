import test from 'node:test';
import assert from 'node:assert/strict';
import {
  isRotatingDiet,
  sameDietComponents,
  validateDietComponents,
} from '../dietPeriods';

test('accepts an arbitrary flat set without assigning a primary component', () => {
  const components = validateDietComponents([
    { food_id: '00000000-0000-0000-0000-000000000001' },
    {
      food_id: '00000000-0000-0000-0000-000000000002',
      share: 'about_half',
      schedule: 'daily',
      meal_slot: 'evening',
    },
    { food_freetext: 'Local raw recipe', role: 'mixer' },
  ]);

  assert.equal(components.length, 3);
  assert.equal(components[0].role, null);
  assert.equal(components[0].share, null);
  assert.equal(components[0].schedule, null);
});

test('share accepts owner ordinals and rejects guessed percentages', () => {
  assert.equal(
    validateDietComponents([{ food_freetext: 'Food A', share: 'spoonful' }])[0].share,
    'spoonful'
  );
  assert.throws(
    () => validateDietComponents([{ food_freetext: 'Food A', share: '50' }]),
    /invalid share/
  );
});

test('rotation includes explicit rotation, specific days and occasional exposure', () => {
  assert.equal(isRotatingDiet([{ food_freetext: 'A', schedule: 'rotating' }]), true);
  assert.equal(
    isRotatingDiet([{ food_freetext: 'A', schedule: 'specific_days', days_of_week: [2] }]),
    true
  );
  assert.equal(isRotatingDiet([{ food_freetext: 'A', schedule: 'occasional' }]), true);
  assert.equal(
    isRotatingDiet([
      { food_freetext: 'A', schedule: 'daily', meal_slot: 'morning' },
      { food_freetext: 'B', schedule: 'daily', meal_slot: 'evening' },
    ]),
    false
  );
});

test('specific days require recorded days and other schedules cannot carry them', () => {
  assert.throws(
    () => validateDietComponents([{ food_freetext: 'A', schedule: 'specific_days' }]),
    /needs at least one day/
  );
  assert.throws(
    () =>
      validateDietComponents([
        { food_freetext: 'A', schedule: 'daily', days_of_week: [1, 2] },
      ]),
    /only set days/
  );
});

test('diet equality is order independent but descriptive changes still create a new period', () => {
  const before = validateDietComponents([
    { food_freetext: 'A', share: 'about_half' },
    { food_freetext: 'B', share: 'about_half' },
  ]);
  const reordered = validateDietComponents([
    { food_freetext: 'B', share: 'about_half' },
    { food_freetext: 'A', share: 'about_half' },
  ]);
  const changed = validateDietComponents([
    { food_freetext: 'A', share: 'most' },
    { food_freetext: 'B', share: 'small_amount' },
  ]);

  assert.equal(sameDietComponents(before, reordered), true);
  assert.equal(sameDietComponents(before, changed), false);
});

test('the same food cannot appear twice in one flat set', () => {
  assert.throws(
    () =>
      validateDietComponents([
        { food_freetext: 'Same food' },
        { food_freetext: ' same FOOD ' },
      ]),
    /cannot appear twice/
  );
});
