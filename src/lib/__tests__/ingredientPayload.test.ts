import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildTopIngredientRows,
  parseIngredientEntry,
  type ParsedIngredient,
} from '../ingredientPayload';

function ingredient(
  name: string,
  category: string | null = null,
  additiveCategoryPrinted: string | null = null
): ParsedIngredient {
  return {
    name,
    category,
    inclusion_pct: null,
    note: null,
    additive_category_printed: additiveCategoryPrinted,
    sub: [],
  };
}

test('additive-panel rows use a separate sequence and never consume prevalence positions', () => {
  const { topRows } = buildTopIngredientRows('food-1', [
    ingredient('Chicken'),
    ingredient('Vitamin A', 'additive_nutritional', 'Nutritional additives'),
    ingredient('Rice'),
    ingredient('Rosemary extract', 'additive_sensory', 'Sensory additives'),
  ]);

  assert.deepEqual(
    topRows.map(({ ingredient_name, position_in_list, additive_sequence }) => ({
      ingredient_name,
      position_in_list,
      additive_sequence,
    })),
    [
      { ingredient_name: 'Chicken', position_in_list: 1, additive_sequence: null },
      { ingredient_name: 'Vitamin A', position_in_list: null, additive_sequence: 1 },
      { ingredient_name: 'Rice', position_in_list: 2, additive_sequence: null },
      { ingredient_name: 'Rosemary extract', position_in_list: null, additive_sequence: 2 },
    ]
  );
});

test('legacy generic additive without a printed panel heading remains prevalence-ranked', () => {
  const parsed = parseIngredientEntry({ name: 'Mixed tocopherols', category: 'additive' });
  assert.ok('value' in parsed);
  if (!('value' in parsed)) return;

  const { topRows } = buildTopIngredientRows('food-1', [parsed.value]);
  assert.equal(topRows[0].position_in_list, 1);
  assert.equal(topRows[0].additive_sequence, null);
});

test('distinct additive category is rejected unless the printed heading is retained', () => {
  const parsed = parseIngredientEntry({
    name: 'Vitamin A',
    category: 'additive_nutritional',
  });
  assert.ok('error' in parsed);
});
