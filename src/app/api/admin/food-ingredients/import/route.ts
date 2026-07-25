import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { isIngredientCategory, INGREDIENT_CATEGORY_VALUES } from '@/lib/ingredientCategories';

/**
 * Bulk ingredient import — the write path for populating `food_ingredients`.
 *
 * Built so a separate AI session (or a human) can fill in complete ingredient
 * lists without touching SQL. Admin-gated, validated, and idempotent per food:
 * importing the same food twice replaces its rows rather than duplicating them.
 *
 * GET  — which foods still need ingredients (id/brand/name + current count), so
 *        the caller knows exactly what to work through. Supports ?missing=1.
 * POST — { items: [...] } writes ordered ingredient rows.
 *
 * Item shape (food matched by `food_id`, or by exact case-insensitive
 * `brand` + `name`):
 *   {
 *     "brand": "Acana",
 *     "name": "Regional Red",
 *     "ingredients": [
 *       "Beef",                                   // plain string, or…
 *       { "name": "Fresh Chicken", "inclusion_pct": 26, "category": "protein_animal" },
 *       { "name": "Chicken Fat", "note": "as a preservative" },
 *       {
 *         "name": "Animal Derivatives",           // compound ingredient
 *         "inclusion_pct": 20,
 *         "sub_ingredients": [
 *           { "name": "Chicken", "inclusion_pct": 4 }
 *         ]
 *       }
 *     ]
 *   }
 *
 * Rules:
 *   - `position_in_list` is assigned from array order (1-based) — order is the
 *     label order and carries meaning (most prevalent first), so the caller must
 *     preserve it. Sub-ingredients are numbered 1..m within their parent.
 *   - `inclusion_pct` is the printed percentage (0-100) or omitted. NEVER
 *     estimate one: an absent percentage must stay absent.
 *   - `sub_ingredients` nest under a compound ingredient via
 *     `parent_ingredient_id`. This matters for hidden allergens — a
 *     beef-flavoured food may declare chicken only inside "animal derivatives",
 *     and both the allergy hard filter and the correlation engine match on
 *     `ingredient_name` across all rows, so a nested ingredient is still found.
 *   - A food's existing rows are replaced ONLY when the incoming list is
 *     non-empty, so an empty payload can never wipe data.
 *   - `category` is optional but must be from the known vocabulary if given.
 *   - Nothing is invented here: this endpoint stores exactly what it is sent.
 */

const MAX_ITEMS = 100;
const MAX_INGREDIENTS_PER_FOOD = 200;
const MAX_NAME_LENGTH = 200;

interface ImportIngredient {
  name: string;
  category: string | null;
  inclusion_pct: number | null;
  note: string | null;
  sub: ImportIngredient[];
}

/**
 * Parse one ingredient entry (string, or object possibly carrying
 * `sub_ingredients`). Returns an error message instead of throwing so the
 * caller can report per-item. `depth` guards against a pathological payload.
 */
function parseIngredient(
  entry: unknown,
  depth: number,
): { value: ImportIngredient } | { error: string } {
  if (depth > 2) return { error: 'Sub-ingredients may not nest more than one level deep.' };

  if (typeof entry === 'string') {
    const name = entry.trim();
    if (!name) return { error: 'Each ingredient needs a non-empty name.' };
    if (name.length > MAX_NAME_LENGTH) {
      return { error: `Ingredient name exceeds ${MAX_NAME_LENGTH} characters.` };
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
  if (name.length > MAX_NAME_LENGTH) {
    return { error: `Ingredient name exceeds ${MAX_NAME_LENGTH} characters.` };
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

  let inclusionPct: number | null = null;
  if (obj.inclusion_pct != null) {
    const value =
      typeof obj.inclusion_pct === 'number' ? obj.inclusion_pct : Number(obj.inclusion_pct);
    if (!Number.isFinite(value) || value < 0 || value > 100) {
      return { error: `inclusion_pct for "${name}" must be a number between 0 and 100.` };
    }
    inclusionPct = value;
  }

  const note =
    typeof obj.note === 'string' && obj.note.trim() !== '' ? obj.note.trim() : null;

  const sub: ImportIngredient[] = [];
  if (obj.sub_ingredients != null) {
    if (!Array.isArray(obj.sub_ingredients)) {
      return { error: `sub_ingredients for "${name}" must be an array.` };
    }
    for (const child of obj.sub_ingredients) {
      const parsed = parseIngredient(child, depth + 1);
      if ('error' in parsed) return parsed;
      sub.push(parsed.value);
    }
  }

  return { value: { name, category, inclusion_pct: inclusionPct, note, sub } };
}

interface ItemResult {
  brand?: string;
  name?: string;
  food_id?: string;
  matched: boolean;
  ingredients_written: number;
  error?: string;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const missingOnly = request.nextUrl.searchParams.get('missing') === '1';

  const [{ data: foods, error }, { data: rows, error: rowsError }] = await Promise.all([
    supabaseAdmin.from('foods').select('id, brand, name, source_url').order('brand'),
    supabaseAdmin.from('food_ingredients').select('food_id'),
  ]);

  if (error || rowsError) {
    return NextResponse.json(
      { error: (error ?? rowsError)?.message ?? 'Query failed.' },
      { status: 500 },
    );
  }

  const counts = new Map<string, number>();
  for (const row of rows ?? []) {
    const id = (row as { food_id: string }).food_id;
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }

  const list = (foods ?? [])
    .map((f) => {
      const food = f as { id: string; brand: string; name: string; source_url: string | null };
      return {
        food_id: food.id,
        brand: food.brand,
        name: food.name,
        source_url: food.source_url,
        ingredient_count: counts.get(food.id) ?? 0,
      };
    })
    .filter((f) => (missingOnly ? f.ingredient_count < 5 : true));

  return NextResponse.json(
    {
      total: list.length,
      categories: INGREDIENT_CATEGORY_VALUES,
      foods: list,
    },
    { status: 200 },
  );
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: { items?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (!Array.isArray(body.items) || body.items.length === 0) {
    return NextResponse.json({ error: '`items` must be a non-empty array.' }, { status: 400 });
  }
  if (body.items.length > MAX_ITEMS) {
    return NextResponse.json(
      { error: `At most ${MAX_ITEMS} items per request.` },
      { status: 400 },
    );
  }

  const results: ItemResult[] = [];
  let totalWritten = 0;

  for (const raw of body.items) {
    const item = raw as {
      food_id?: unknown;
      brand?: unknown;
      name?: unknown;
      ingredients?: unknown;
    };
    const result: ItemResult = {
      brand: typeof item.brand === 'string' ? item.brand : undefined,
      name: typeof item.name === 'string' ? item.name : undefined,
      food_id: typeof item.food_id === 'string' ? item.food_id : undefined,
      matched: false,
      ingredients_written: 0,
    };

    // --- Parse + validate the ingredient list ---------------------------
    if (!Array.isArray(item.ingredients)) {
      result.error = '`ingredients` must be an array.';
      results.push(result);
      continue;
    }
    if (item.ingredients.length > MAX_INGREDIENTS_PER_FOOD) {
      result.error = `At most ${MAX_INGREDIENTS_PER_FOOD} ingredients per food.`;
      results.push(result);
      continue;
    }

    const parsed: ImportIngredient[] = [];
    let invalid: string | null = null;
    for (const entry of item.ingredients) {
      const result = parseIngredient(entry, 1);
      if ('error' in result) {
        invalid = result.error;
        break;
      }
      parsed.push(result.value);
    }

    if (invalid) {
      result.error = invalid;
      results.push(result);
      continue;
    }
    if (parsed.length === 0) {
      result.error = 'Empty ingredient list — refusing to clear existing rows.';
      results.push(result);
      continue;
    }

    // --- Resolve the food ------------------------------------------------
    let foodId: string | null = null;
    if (typeof item.food_id === 'string' && item.food_id) {
      const { data } = await supabaseAdmin
        .from('foods')
        .select('id')
        .eq('id', item.food_id)
        .maybeSingle();
      foodId = (data as { id: string } | null)?.id ?? null;
    } else if (typeof item.brand === 'string' && typeof item.name === 'string') {
      const { data } = await supabaseAdmin
        .from('foods')
        .select('id')
        .ilike('brand', item.brand.trim())
        .ilike('name', item.name.trim())
        .limit(2);
      const matches = (data ?? []) as { id: string }[];
      if (matches.length > 1) {
        result.error = 'Ambiguous brand + name (multiple foods matched) — pass food_id instead.';
        results.push(result);
        continue;
      }
      foodId = matches[0]?.id ?? null;
    } else {
      result.error = 'Provide `food_id`, or both `brand` and `name`.';
      results.push(result);
      continue;
    }

    if (!foodId) {
      result.error = 'No matching food found.';
      results.push(result);
      continue;
    }

    result.matched = true;
    result.food_id = foodId;

    // --- Replace this food's ingredient rows ----------------------------
    const { error: deleteError } = await supabaseAdmin
      .from('food_ingredients')
      .delete()
      .eq('food_id', foodId);
    if (deleteError) {
      result.error = deleteError.message;
      results.push(result);
      continue;
    }

    // Insert top-level ingredients first so their ids can parent the
    // sub-ingredients of any compound entry.
    const topRows = parsed.map((ingredient, index) => ({
      food_id: foodId,
      ingredient_name: ingredient.name,
      ingredient_category: ingredient.category,
      inclusion_pct: ingredient.inclusion_pct,
      note: ingredient.note,
      parent_ingredient_id: null,
      position_in_list: index + 1,
    }));

    const { data: insertedTop, error: insertError } = await supabaseAdmin
      .from('food_ingredients')
      .insert(topRows)
      .select('id, position_in_list');

    if (insertError) {
      result.error = insertError.message;
      results.push(result);
      continue;
    }

    let written = insertedTop?.length ?? 0;

    // Map each inserted parent back to its source entry by position, then
    // insert that entry's sub-ingredients numbered 1..m within the parent.
    const idByPosition = new Map<number, string>();
    for (const row of (insertedTop ?? []) as { id: string; position_in_list: number }[]) {
      idByPosition.set(row.position_in_list, row.id);
    }

    const subRows: Record<string, unknown>[] = [];
    parsed.forEach((ingredient, index) => {
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
      const { error: subError } = await supabaseAdmin.from('food_ingredients').insert(subRows);
      if (subError) {
        result.error = `Top-level ingredients written, but sub-ingredients failed: ${subError.message}`;
        result.ingredients_written = written;
        totalWritten += written;
        results.push(result);
        continue;
      }
      written += subRows.length;
    }

    result.ingredients_written = written;
    totalWritten += written;
    results.push(result);
  }

  return NextResponse.json(
    {
      items_processed: results.length,
      foods_updated: results.filter((r) => r.ingredients_written > 0).length,
      ingredients_written: totalWritten,
      results,
    },
    { status: 200 },
  );
}
