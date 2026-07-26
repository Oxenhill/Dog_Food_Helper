import { supabaseAdmin } from './supabase';
import { isIngredientCategory, INGREDIENT_CATEGORY_VALUES } from './ingredientCategories';

/**
 * Shared parser for a submitted ingredient list.
 *
 * Extracted from the admin bulk-import route so that route and the contributor
 * submission path validate the same shape with the same code. Two separate
 * validators for this payload would be a safety problem rather than mere
 * duplication: both the allergy hard filter and the correlation engine match on
 * `ingredient_name` across ALL rows including nested ones, so a path that
 * mishandled `sub_ingredients` would silently drop the hidden chicken inside
 * "Animal Derivatives (Chicken 4%)" — the exact case the nesting exists for.
 *
 * Accepted entry forms:
 *   "Beef"
 *   { name: "Fresh Chicken", inclusion_pct: 26, category: "protein_animal" }
 *   { name: "Chicken Fat", note: "as a preservative" }
 *   { name: "Animal Derivatives", sub_ingredients: [{ name: "Chicken", inclusion_pct: 4 }] }
 */

export const MAX_INGREDIENT_NAME_LENGTH = 200;
export const MAX_INGREDIENTS_PER_FOOD = 200;

export interface ParsedIngredient {
  name: string;
  category: string | null;
  inclusion_pct: number | null;
  note: string | null;
  sub: ParsedIngredient[];
}

export type ParseResult<T> = { value: T } | { error: string };

/**
 * Parse one entry. Returns an error message rather than throwing so a caller
 * processing a batch can report per-item. `depth` guards a pathological payload;
 * one level of nesting is all a label ever needs.
 */
export function parseIngredientEntry(entry: unknown, depth = 1): ParseResult<ParsedIngredient> {
  if (depth > 2) return { error: 'Sub-ingredients may not nest more than one level deep.' };

  if (typeof entry === 'string') {
    const name = entry.trim();
    if (!name) return { error: 'Each ingredient needs a non-empty name.' };
    if (name.length > MAX_INGREDIENT_NAME_LENGTH) {
      return { error: `Ingredient name exceeds ${MAX_INGREDIENT_NAME_LENGTH} characters.` };
    }
    return { value: { name, category: null, inclusion_pct: null, note: null, sub: [] } };
  }

  if (!entry || typeof entry !== 'object') {
    return { error: 'Each ingredient must be a string or an object.' };
  }

  const obj = entry as {
    name?: unknown;
    category?: unknown;
    inclusion_pct?: unknown;
    note?: unknown;
    sub_ingredients?: unknown;
  };

  const name = typeof obj.name === 'string' ? obj.name.trim() : '';
  if (!name) return { error: 'Each ingredient needs a non-empty name.' };
  if (name.length > MAX_INGREDIENT_NAME_LENGTH) {
    return { error: `Ingredient name exceeds ${MAX_INGREDIENT_NAME_LENGTH} characters.` };
  }

  let category: string | null = null;
  if (obj.category != null) {
    if (!isIngredientCategory(obj.category)) {
      return {
        error: `Unknown category "${String(obj.category)}". Allowed: ${INGREDIENT_CATEGORY_VALUES.join(', ')}.`,
      };
    }
    category = obj.category;
  }

  // An absent percentage must stay absent. Never estimated, here or upstream.
  let inclusionPct: number | null = null;
  if (obj.inclusion_pct != null) {
    const value =
      typeof obj.inclusion_pct === 'number' ? obj.inclusion_pct : Number(obj.inclusion_pct);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { error: `inclusion_pct for "${name}" must be a number between 0 and 100.` };
    }
    inclusionPct = value;
  }

  const note = typeof obj.note === 'string' && obj.note.trim() !== '' ? obj.note.trim() : null;

  const sub: ParsedIngredient[] = [];
  if (obj.sub_ingredients != null) {
    if (!Array.isArray(obj.sub_ingredients)) {
      return { error: `sub_ingredients for "${name}" must be an array.` };
    }
    for (const child of obj.sub_ingredients) {
      const parsed = parseIngredientEntry(child, depth + 1);
      if ('error' in parsed) return parsed;
      sub.push(parsed.value);
    }
  }

  return { value: { name, category, inclusion_pct: inclusionPct, note, sub } };
}

/** Parse a whole list, preserving order — order is label order and carries meaning. */
export function parseIngredientList(entries: unknown): ParseResult<ParsedIngredient[]> {
  if (!Array.isArray(entries)) return { error: '`ingredients` must be an array.' };
  if (entries.length === 0) return { error: 'The ingredient list is empty.' };
  if (entries.length > MAX_INGREDIENTS_PER_FOOD) {
    return { error: `At most ${MAX_INGREDIENTS_PER_FOOD} ingredients per food.` };
  }

  const parsed: ParsedIngredient[] = [];
  for (const entry of entries) {
    const result = parseIngredientEntry(entry, 1);
    if ('error' in result) return result;
    parsed.push(result.value);
  }
  return { value: parsed };
}

/** Every ingredient name in the list, including nested sub-ingredients. */
export function flattenIngredientNames(list: ParsedIngredient[]): string[] {
  const names: string[] = [];
  for (const item of list) {
    names.push(item.name);
    for (const child of item.sub) names.push(child.name);
  }
  return names;
}

/**
 * Insert a parsed list as `food_ingredients` rows for one food.
 *
 * Two passes because a sub-ingredient needs its parent's generated id:
 * top-level rows first (numbered 1..n in label order), then each compound
 * entry's children numbered 1..m within their parent.
 */
export async function insertParsedIngredients(
  foodId: string,
  list: ParsedIngredient[]
): Promise<{ written: number; error?: string }> {
  const client = supabaseAdmin;

  const topRows = list.map((ingredient, index) => ({
    food_id: foodId,
    ingredient_name: ingredient.name,
    ingredient_category: ingredient.category,
    inclusion_pct: ingredient.inclusion_pct,
    note: ingredient.note,
    parent_ingredient_id: null,
    position_in_list: index + 1,
  }));

  const { data: insertedTop, error: insertError } = await client
    .from('food_ingredients')
    .insert(topRows)
    .select('id, position_in_list');

  if (insertError) return { written: 0, error: insertError.message };

  let written = insertedTop?.length ?? 0;

  const idByPosition = new Map<number, string>();
  for (const row of (insertedTop ?? []) as { id: string; position_in_list: number }[]) {
    idByPosition.set(row.position_in_list, row.id);
  }

  const subRows: Record<string, unknown>[] = [];
  list.forEach((ingredient, index) => {
    if (ingredient.sub.length === 0) return;
    const parentId = idByPosition.get(index + 1);
    if (!parentId) return;
    ingredient.sub.forEach((child, childIndex) => {
      subRows.push({
        food_id: foodId,
        ingredient_name: child.name,
        ingredient_category: child.category,
        inclusion_pct: child.inclusion_pct,
        note: child.note,
        parent_ingredient_id: parentId,
        position_in_list: childIndex + 1,
      });
    });
  });

  if (subRows.length > 0) {
    const { error: subError } = await client.from('food_ingredients').insert(subRows);
    if (subError) {
      return {
        written,
        error: `Top-level ingredients written, but sub-ingredients failed: ${subError.message}`,
      };
    }
    written += subRows.length;
  }

  return { written };
}
