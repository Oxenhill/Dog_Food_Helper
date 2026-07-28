/**
 * Owner-facing food detail — the one read path for "what is actually in this
 * food".
 *
 * Backed by the `public.food_full` view (one row per food, every ingredient
 * nested as JSON with percentages, notes and sub-ingredients, plus the derived
 * `est_digestible_carbohydrate_pct`). Using the view rather than a join keeps
 * this a single round trip and guarantees the nesting/order is identical
 * wherever it is rendered.
 *
 * WHY THIS EXISTS: the ingredient list is the primary information about a food.
 * The guaranteed-analysis panel is a coarse aggregate that cannot say WHICH
 * carbohydrate or protein a food uses, and cannot describe fibre type at all —
 * only the ingredient list can (see src/lib/carbohydrate.ts). A beef-flavoured
 * food may declare chicken only inside a compound ingredient, which is why
 * sub-ingredients are carried through here rather than flattened away.
 *
 * HONESTY RULE: most foods have no ingredient list recorded yet. When
 * `ingredients` is empty the UI must say so plainly. Nothing in this module
 * infers, completes or substitutes an ingredient — an absent list stays absent.
 */

import { supabaseAdmin } from './supabase';
import { carbBand, type CarbBand } from './carbohydrate';

/** A single ingredient as printed on the label, in label order. */
export interface FoodFullIngredient {
  name: string;
  /** Structural category (see ingredientCategories.ts). Null when not classified. */
  category: string | null;
  /** 1-based position on the label. Order is meaningful — it implies inclusion. */
  position: number;
  /** Printed inclusion percentage, or null when the label didn't state one. */
  inclusion_pct: number | null;
  /** Label qualifier: "dried", "min 4%", "as a preservative". */
  note: string | null;
  /** Ingredients declared inside a compound ingredient, e.g. chicken inside "Animal Derivatives". */
  sub_ingredients: FoodFullIngredient[];
}

export interface FoodFullAdditive {
  name: string;
  category: string;
  printed_category: string;
  sequence: number;
  /** Printed amount and unit, verbatim; null when the label prints no amount. */
  note: string | null;
}

/** The eight guaranteed-analysis columns, plus the derived carbohydrate figure. */
export interface FoodNutrients {
  protein_pct: number | null;
  fat_pct: number | null;
  fibre_pct: number | null;
  moisture_pct: number | null;
  ash_pct: number | null;
  phosphorus_pct: number | null;
  sodium_pct: number | null;
  calcium_pct: number | null;
  /** Derived by difference (NFE), never a label value. Null on an incomplete panel. */
  est_digestible_carbohydrate_pct: number | null;
  /** Presentational banding of the derived figure. Null when it isn't derivable. */
  carbohydrate_band: CarbBand | null;
}

export interface FoodFull {
  id: string;
  brand: string;
  name: string;
  food_type: string;
  price_per_kg: number | null;
  calories_per_kg: number | null;
  source_url: string | null;
  source_domain: string | null;
  last_verified_at: string | null;
  nutrients: FoodNutrients;
  /** Empty when no ingredient list has been recorded. Never fabricated. */
  ingredients: FoodFullIngredient[];
  /** Label-declared additives, kept outside prevalence-ranked ingredients. */
  additives: FoodFullAdditive[];
  /** Top-level ingredient count as reported by the view. */
  ingredient_count: number;
}

/**
 * PostgREST returns `numeric` columns as JSON numbers, but a numeric can also
 * arrive as a string depending on driver/view shape. Coerce defensively and
 * return null rather than NaN — a nutrient we cannot read must never render as
 * a number.
 */
function num(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

function mapIngredient(raw: unknown): FoodFullIngredient | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  if (!name) return null;

  const subs = Array.isArray(r.sub_ingredients)
    ? r.sub_ingredients.map(mapIngredient).filter((s): s is FoodFullIngredient => s !== null)
    : [];

  return {
    name,
    category: typeof r.category === 'string' ? r.category : null,
    position: num(r.position) ?? 0,
    inclusion_pct: num(r.inclusion_pct),
    note: typeof r.note === 'string' && r.note.trim() ? r.note : null,
    sub_ingredients: subs,
  };
}

function mapAdditive(raw: unknown): FoodFullAdditive | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const name = typeof r.name === 'string' ? r.name.trim() : '';
  const category = typeof r.category === 'string' ? r.category : '';
  const printedCategory =
    typeof r.printed_category === 'string' ? r.printed_category.trim() : '';
  const sequence = num(r.sequence);
  if (!name || !category || !printedCategory || sequence === null) return null;
  return {
    name,
    category,
    printed_category: printedCategory,
    sequence,
    note: typeof r.note === 'string' && r.note.trim() ? r.note : null,
  };
}

/**
 * Every ingredient name in a food, INCLUDING nested sub-ingredients, flattened
 * to one list.
 *
 * `FoodFull.ingredients` is a tree: a compound ingredient carries its contents
 * in `sub_ingredients`. Anything matching ingredient names against a food must
 * walk the whole tree, because the nested rows are the entire point — a
 * beef-flavoured food declaring "Meat and animal derivatives" with chicken
 * nested inside it is exactly the case the ingredient detail exists to catch.
 * A top-level-only `.map(i => i.name)` silently misses it.
 *
 * Both `hardFilter.ts` and the correlation engine query `food_ingredients`
 * directly and so match across all rows already; this is the equivalent for
 * code working from the assembled `FoodFull` view shape.
 */
export function flattenIngredientNames(ingredients: FoodFullIngredient[]): string[] {
  const names: string[] = [];
  const walk = (list: FoodFullIngredient[]) => {
    for (const ingredient of list) {
      names.push(ingredient.name);
      if (ingredient.sub_ingredients.length > 0) walk(ingredient.sub_ingredients);
    }
  };
  walk(ingredients);
  return names;
}

/** Map one `food_full` row onto the app-facing shape. */
export function mapFoodFullRow(row: Record<string, unknown>): FoodFull {
  const ingredients = Array.isArray(row.ingredients)
    ? row.ingredients
        .map(mapIngredient)
        .filter((i): i is FoodFullIngredient => i !== null)
        // The view already orders by position, but sorting here makes label
        // order a guarantee of this module rather than an assumption about it.
        .sort((a, b) => a.position - b.position)
    : [];

  const carb = num(row.est_digestible_carbohydrate_pct);
  const additives = Array.isArray(row.additives)
    ? row.additives
        .map(mapAdditive)
        .filter((item): item is FoodFullAdditive => item !== null)
        .sort((a, b) => a.sequence - b.sequence)
    : [];

  return {
    id: String(row.id),
    brand: String(row.brand ?? ''),
    name: String(row.name ?? ''),
    food_type: String(row.food_type ?? ''),
    price_per_kg: num(row.price_per_kg),
    calories_per_kg: num(row.calories_per_kg),
    source_url: typeof row.source_url === 'string' ? row.source_url : null,
    source_domain: typeof row.source_domain === 'string' ? row.source_domain : null,
    last_verified_at: typeof row.last_verified_at === 'string' ? row.last_verified_at : null,
    nutrients: {
      protein_pct: num(row.protein_pct),
      fat_pct: num(row.fat_pct),
      fibre_pct: num(row.fibre_pct),
      moisture_pct: num(row.moisture_pct),
      ash_pct: num(row.ash_pct),
      phosphorus_pct: num(row.phosphorus_pct),
      sodium_pct: num(row.sodium_pct),
      calcium_pct: num(row.calcium_pct),
      est_digestible_carbohydrate_pct: carb,
      carbohydrate_band: carb === null ? null : carbBand(carb),
    },
    ingredients,
    additives,
    ingredient_count: num(row.ingredient_count) ?? ingredients.length,
  };
}

/** Fetch one food's full detail, or null when it doesn't exist. */
export async function fetchFoodFull(foodId: string): Promise<FoodFull | null> {
  const { data, error } = await supabaseAdmin
    .from('food_full')
    .select('*')
    .eq('id', foodId)
    .maybeSingle();

  if (error || !data) return null;
  return mapFoodFullRow(data as Record<string, unknown>);
}

/**
 * Fetch full detail for many foods at once, keyed by food id. Used by the
 * recommendations route so a list of results carries its ingredients without
 * one query per food.
 */
export async function fetchFoodFullMany(foodIds: string[]): Promise<Map<string, FoodFull>> {
  const out = new Map<string, FoodFull>();
  if (foodIds.length === 0) return out;

  const { data, error } = await supabaseAdmin.from('food_full').select('*').in('id', foodIds);

  if (error || !data) return out;

  for (const row of data as Record<string, unknown>[]) {
    const mapped = mapFoodFullRow(row);
    out.set(mapped.id, mapped);
  }
  return out;
}
