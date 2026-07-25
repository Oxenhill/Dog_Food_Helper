// Shared constants + types for the condition-contraindications safety layer.
//
// These MUST stay aligned with src/lib/hardFilter.ts, which consumes
// condition_contraindications rows deterministically:
//   - a nutrient rule stores the actual foods column name (e.g. "protein_pct")
//     in `nutrient`, plus a `comparator` from COMPARATOR_TO_PG_OP and a numeric
//     `threshold`; hardFilter excludes foods where foods.<nutrient> <op> threshold
//     (NULL-valued foods are never excluded).
//   - an ingredient rule stores `contraindicated_ingredient`; hardFilter excludes
//     foods whose food_ingredients.ingredient_name ILIKE %ingredient%.
// Only rows with approved = true ever affect a recommendation.
//
// This file is deliberately framework-neutral (no 'use client') so both the
// API routes and the admin page import the same single source of truth.

export const CONTRA_NUTRIENTS = [
  { column: 'protein_pct', label: 'Protein' },
  { column: 'fat_pct', label: 'Fat' },
  { column: 'fibre_pct', label: 'Fibre' },
  { column: 'moisture_pct', label: 'Moisture' },
  { column: 'ash_pct', label: 'Ash' },
  { column: 'phosphorus_pct', label: 'Phosphorus' },
  { column: 'sodium_pct', label: 'Sodium' },
  { column: 'calcium_pct', label: 'Calcium' },
] as const;

export const CONTRA_NUTRIENT_COLUMNS: string[] = CONTRA_NUTRIENTS.map((n) => n.column);

// Must match the keys of COMPARATOR_TO_PG_OP in hardFilter.ts exactly.
export const CONTRA_COMPARATORS = ['>', '>=', '<', '<='] as const;
export type ContraComparator = (typeof CONTRA_COMPARATORS)[number];

export function nutrientLabel(column: string | null): string {
  if (!column) return '';
  const found = CONTRA_NUTRIENTS.find((n) => n.column === column);
  return found ? found.label : column.replace('_pct', '');
}

export interface RuleInput {
  condition?: unknown;
  contraindicated_ingredient?: unknown;
  nutrient?: unknown;
  comparator?: unknown;
  threshold?: unknown;
  rationale?: unknown;
  source?: unknown;
  approved?: unknown;
}

export interface ValidatedRule {
  condition: string;
  contraindicated_ingredient: string | null;
  nutrient: string | null;
  comparator: string | null;
  threshold: number | null;
  rationale: string | null;
  source: string | null;
  approved: boolean;
}

/**
 * Validate a rule body into a well-formed contraindication, or return an error
 * message. Shared by the create (POST) and edit (PATCH) API paths so an edit can
 * never produce a rule shape the hard filter would silently ignore.
 *
 * Lives here rather than in a route module because Next.js route files may only
 * export HTTP handlers.
 */
export function validateRule(body: RuleInput): { rule: ValidatedRule } | { error: string } {
  const condition = typeof body.condition === 'string' ? body.condition.trim() : '';
  if (!condition) return { error: 'A condition name is required.' };

  const hasIngredient =
    typeof body.contraindicated_ingredient === 'string' &&
    body.contraindicated_ingredient.trim() !== '';
  const hasNutrient = typeof body.nutrient === 'string' && body.nutrient.trim() !== '';

  if (hasIngredient && hasNutrient) {
    return { error: 'A rule is either an ingredient rule OR a nutrient rule, not both.' };
  }
  if (!hasIngredient && !hasNutrient) {
    return { error: 'Provide either a contraindicated ingredient or a nutrient threshold.' };
  }

  const rationale =
    typeof body.rationale === 'string' && body.rationale.trim() !== ''
      ? body.rationale.trim()
      : null;
  const source =
    typeof body.source === 'string' && body.source.trim() !== '' ? body.source.trim() : null;
  const approved = body.approved === true;

  if (hasIngredient) {
    return {
      rule: {
        condition,
        contraindicated_ingredient: (body.contraindicated_ingredient as string).trim(),
        nutrient: null,
        comparator: null,
        threshold: null,
        rationale,
        source,
        approved,
      },
    };
  }

  // Nutrient-threshold rule.
  const nutrient = (body.nutrient as string).trim();
  if (!CONTRA_NUTRIENT_COLUMNS.includes(nutrient)) {
    return { error: `Nutrient must be one of: ${CONTRA_NUTRIENT_COLUMNS.join(', ')}.` };
  }
  const comparator = typeof body.comparator === 'string' ? body.comparator.trim() : '';
  if (!CONTRA_COMPARATORS.includes(comparator as ContraComparator)) {
    return { error: `Comparator must be one of: ${CONTRA_COMPARATORS.join(', ')}.` };
  }
  const threshold =
    typeof body.threshold === 'number'
      ? body.threshold
      : typeof body.threshold === 'string' && body.threshold.trim() !== ''
        ? Number(body.threshold)
        : NaN;
  if (!Number.isFinite(threshold)) {
    return { error: 'A numeric threshold is required for a nutrient rule.' };
  }

  return {
    rule: {
      condition,
      contraindicated_ingredient: null,
      nutrient,
      comparator,
      threshold,
      rationale,
      source,
      approved,
    },
  };
}

export interface ConditionContraindication {
  id: string;
  condition: string;
  contraindicated_ingredient: string | null;
  nutrient: string | null;
  comparator: string | null;
  threshold: number | null;
  rationale: string | null;
  source: string | null;
  approved: boolean;
  created_by: string | null;
  created_at: string | null;
}
