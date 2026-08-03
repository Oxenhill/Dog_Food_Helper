import assert from 'node:assert/strict';
import test from 'node:test';
import {
  computeFleetIngredientPatterns,
  fleetConfidenceTierForDogCount,
  FLEET_CONFIDENCE_THRESHOLDS,
  type FleetSignalRow,
} from '../fleetIngredientSignal';

function row(overrides: Partial<FleetSignalRow> = {}): FleetSignalRow {
  return {
    dog_id: 'dog-1',
    ingredient_name: 'chicken',
    outcome_metric: 'stool_score',
    correlation_strength: 0.5,
    evidence_basis: 'food_switch',
    ...overrides,
  };
}

test('fleetConfidenceTierForDogCount matches the documented thresholds', () => {
  assert.equal(fleetConfidenceTierForDogCount(0), null);
  assert.equal(fleetConfidenceTierForDogCount(FLEET_CONFIDENCE_THRESHOLDS.low_sample_min - 1), null);
  assert.equal(fleetConfidenceTierForDogCount(FLEET_CONFIDENCE_THRESHOLDS.low_sample_min), 'low_sample');
  assert.equal(fleetConfidenceTierForDogCount(FLEET_CONFIDENCE_THRESHOLDS.preliminary_min - 1), 'low_sample');
  assert.equal(fleetConfidenceTierForDogCount(FLEET_CONFIDENCE_THRESHOLDS.preliminary_min), 'preliminary');
  assert.equal(fleetConfidenceTierForDogCount(FLEET_CONFIDENCE_THRESHOLDS.established_min - 1), 'preliminary');
  assert.equal(fleetConfidenceTierForDogCount(FLEET_CONFIDENCE_THRESHOLDS.established_min), 'established');
});

test('below the fleet sample floor, no pattern is returned at all', () => {
  const signals: FleetSignalRow[] = Array.from({ length: FLEET_CONFIDENCE_THRESHOLDS.low_sample_min - 1 }, (_, i) =>
    row({ dog_id: `dog-${i}` })
  );
  const patterns = computeFleetIngredientPatterns(signals);
  assert.equal(patterns.length, 0);
});

test('one row per dog counts once toward dog_count, even with duplicate rows', () => {
  const signals: FleetSignalRow[] = [
    row({ dog_id: 'dog-1', outcome_metric: 'stool_score' }),
    row({ dog_id: 'dog-1', outcome_metric: 'coat_condition' }), // same dog, different metric -> still one dog
    row({ dog_id: 'dog-2' }),
    row({ dog_id: 'dog-3' }),
    row({ dog_id: 'dog-4' }),
    row({ dog_id: 'dog-5' }),
  ];
  const patterns = computeFleetIngredientPatterns(signals);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].dog_count, 5);
  assert.equal(patterns[0].confidence_tier, 'low_sample');
});

test('food_switch evidence is preferred over single_food_period for the same dog/ingredient/metric', () => {
  const signals: FleetSignalRow[] = [
    row({ dog_id: 'dog-1', evidence_basis: 'single_food_period', correlation_strength: -0.9 }),
    row({ dog_id: 'dog-1', evidence_basis: 'food_switch', correlation_strength: 0.9 }),
    ...['dog-2', 'dog-3', 'dog-4', 'dog-5'].map((id) => row({ dog_id: id, correlation_strength: 0.9 })),
  ];
  const patterns = computeFleetIngredientPatterns(signals);
  assert.equal(patterns.length, 1);
  // If the period row (-0.9) had won, avg_strength would be negative.
  assert.ok(patterns[0].avg_strength > 0);
});

test('ingredient names canonicalize before grouping (parenthetical percentage stripped)', () => {
  const signals: FleetSignalRow[] = ['dog-1', 'dog-2', 'dog-3', 'dog-4', 'dog-5'].map((id, i) =>
    row({ dog_id: id, ingredient_name: i % 2 === 0 ? 'Chicken (26%)' : 'chicken' })
  );
  const patterns = computeFleetIngredientPatterns(signals);
  assert.equal(patterns.length, 1);
  assert.equal(patterns[0].ingredient_key, 'chicken');
  assert.equal(patterns[0].dog_count, 5);
});

test('direction classification: positive, negative and neutral band', () => {
  const dogs5 = ['dog-1', 'dog-2', 'dog-3', 'dog-4', 'dog-5'];
  const better = computeFleetIngredientPatterns(dogs5.map((id) => row({ dog_id: id, correlation_strength: 0.5 })));
  assert.equal(better[0].direction, 'better_outcomes');

  const worse = computeFleetIngredientPatterns(dogs5.map((id) => row({ dog_id: id, correlation_strength: -0.5 })));
  assert.equal(worse[0].direction, 'worse_outcomes');

  const neutral = computeFleetIngredientPatterns(dogs5.map((id) => row({ dog_id: id, correlation_strength: 0.05 })));
  assert.equal(neutral[0].direction, 'no_clear_pattern');
});

test('rows with a null correlation_strength are ignored', () => {
  const signals: FleetSignalRow[] = ['dog-1', 'dog-2', 'dog-3', 'dog-4', 'dog-5'].map((id) =>
    row({ dog_id: id, correlation_strength: null })
  );
  const patterns = computeFleetIngredientPatterns(signals);
  assert.equal(patterns.length, 0);
});
