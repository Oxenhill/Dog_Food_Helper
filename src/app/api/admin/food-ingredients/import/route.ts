import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { INGREDIENT_CATEGORY_VALUES } from '@/lib/ingredientCategories';
import {
  ParsedIngredient,
  parseIngredientList,
  insertParsedIngredients,
} from '@/lib/ingredientPayload';

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
    // Shared parser (src/lib/ingredientPayload.ts). The contributor submission
    // path validates the same shape with the same code, so nested
    // sub-ingredient handling cannot diverge between the two write paths — a
    // divergence there would drop a hidden allergen on one path only.
    const parseResult = parseIngredientList(item.ingredients);
    if ('error' in parseResult) {
      // An empty list lands here too, which is the wanted behaviour: an empty
      // payload must never be read as "clear this food's rows".
      result.error = parseResult.error;
      results.push(result);
      continue;
    }
    const parsed: ParsedIngredient[] = parseResult.value;

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

    const { written, error: writeError } = await insertParsedIngredients(foodId, parsed);
    if (writeError) {
      result.error = writeError;
      result.ingredients_written = written;
      totalWritten += written;
      results.push(result);
      continue;
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
