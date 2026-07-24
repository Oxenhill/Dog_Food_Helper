import { Food } from './types';
import { DerResult } from './nutritionalScoring';

/**
 * Budget fit scoring (Phase 3)
 *
 * Takes the dog's monthly_food_budget (or a request-time override) and
 * scores foods by estimated monthly cost vs. that budget. Estimated cost
 * uses the dog's own DER (from nutritionalScoring.ts) divided by the food's
 * calorie density to estimate daily feeding weight — a cheap price_per_kg
 * food that's calorie-sparse (so the dog has to eat more of it) can still
 * cost more per month than a pricier calorie-dense one, which this makes
 * visible rather than comparing price_per_kg in isolation.
 */

const DAYS_PER_MONTH = 30.4;

export interface BudgetFitResult {
  score: number;
  estimatedMonthlyCost: number | null;
  budgetUsed: number | null;
}

export function scoreBudgetFit(
  food: Food,
  der: DerResult,
  monthlyBudget: number | null | undefined
): BudgetFitResult {
  if (!food.price_per_kg || !food.calories_per_kg) {
    // Can't estimate a monthly cost without both fields — neutral, not penalised.
    return { score: 0.5, estimatedMonthlyCost: null, budgetUsed: monthlyBudget ?? null };
  }

  const dailyKg = der.der / food.calories_per_kg;
  const estimatedMonthlyCost = dailyKg * DAYS_PER_MONTH * food.price_per_kg;

  if (!monthlyBudget || monthlyBudget <= 0) {
    // No budget set on the dog and no override supplied — neutral score,
    // rather than guessing a default budget figure.
    return { score: 0.5, estimatedMonthlyCost, budgetUsed: null };
  }

  const ratio = estimatedMonthlyCost / monthlyBudget;
  // At-or-under budget scores 1; score falls off linearly, reaching 0 at 2x budget.
  const score = ratio <= 1 ? 1 : Math.max(0, 1 - (ratio - 1));

  return { score, estimatedMonthlyCost, budgetUsed: monthlyBudget };
}
