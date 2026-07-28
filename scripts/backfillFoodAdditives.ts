/**
 * Backfill additive-panel rows from foods.composition_raw only.
 *
 * Dry-run is the default:
 *   npx tsx --env-file=.env scripts/backfillFoodAdditives.ts
 *
 * Apply only after reviewing the dry-run:
 *   npx tsx --env-file=.env scripts/backfillFoodAdditives.ts --apply
 *
 * Never supplements label text with brand/product knowledge. Existing
 * composition ingredients are untouched; only top-level additive rows are
 * replaced for foods whose own composition_raw contains a parsed additive
 * panel.
 */

import {
  isAdditiveIngredientCategory,
  parseComposition,
} from '../src/lib/compositionParser';
import { supabaseAdmin } from '../src/lib/supabase';

const APPLY = process.argv.includes('--apply');
const ADDITIVE_CATEGORIES = [
  'additive',
  'additive_nutritional',
  'additive_sensory',
  'additive_technological',
  'additive_antioxidant',
] as const;

interface FoodRow {
  id: string;
  brand: string;
  name: string;
  composition_raw: string;
}

interface ExistingAdditiveRow {
  id: string;
  food_id: string;
  ingredient_name: string;
  ingredient_category: string | null;
  position_in_list: number | null;
  inclusion_pct: number | null;
  note: string | null;
  parent_ingredient_id: string | null;
  additive_sequence: number | null;
  additive_category_printed: string | null;
}

async function main() {
  const { data, error } = await supabaseAdmin
    .from('foods')
    .select('id, brand, name, composition_raw')
    .not('composition_raw', 'is', null)
    .order('brand')
    .order('name');

  if (error) throw new Error(`Could not read foods: ${error.message}`);

  const candidates = ((data ?? []) as FoodRow[])
    .map((food) => {
      const parsed = parseComposition(food.composition_raw);
      const additives = parsed.ingredients.filter((ingredient) =>
        isAdditiveIngredientCategory(ingredient.category)
      );
      return { food, parsed, additives };
    })
    .filter((candidate) => candidate.additives.length > 0);

  let totalAdditives = 0;
  for (const candidate of candidates) {
    totalAdditives += candidate.additives.length;
    console.log(
      `${candidate.food.brand} — ${candidate.food.name}: ${candidate.additives.length} additive(s)`
    );
    for (const [index, additive] of candidate.additives.entries()) {
      console.log(
        `  ${index + 1}. [${additive.category}; ${additive.additive_category_printed}] ` +
        `${additive.name}${additive.note ? ` — ${additive.note}` : ''}`
      );
    }
  }

  console.log(
    `${APPLY ? 'APPLY' : 'DRY RUN'}: ${candidates.length} food(s), ${totalAdditives} additive row(s)`
  );
  if (!APPLY) return;

  for (const candidate of candidates) {
    const { data: oldData, error: oldError } = await supabaseAdmin
      .from('food_ingredients')
      .select(
        'id, food_id, ingredient_name, ingredient_category, position_in_list, inclusion_pct, note, parent_ingredient_id, additive_sequence, additive_category_printed'
      )
      .eq('food_id', candidate.food.id)
      .is('parent_ingredient_id', null)
      .in('ingredient_category', [...ADDITIVE_CATEGORIES]);
    if (oldError) throw new Error(`Could not snapshot ${candidate.food.name}: ${oldError.message}`);
    const oldRows = (oldData ?? []) as ExistingAdditiveRow[];

    const { error: deleteError } = await supabaseAdmin
      .from('food_ingredients')
      .delete()
      .eq('food_id', candidate.food.id)
      .is('parent_ingredient_id', null)
      .in('ingredient_category', [...ADDITIVE_CATEGORIES]);
    if (deleteError) throw new Error(`Could not clear ${candidate.food.name}: ${deleteError.message}`);

    const rows = candidate.additives.map((additive, index) => ({
      food_id: candidate.food.id,
      ingredient_name: additive.name,
      ingredient_category: additive.category,
      position_in_list: null,
      inclusion_pct: null,
      note: additive.note,
      parent_ingredient_id: null,
      additive_sequence: index + 1,
      additive_category_printed: additive.additive_category_printed,
    }));
    const { error: insertError } = await supabaseAdmin.from('food_ingredients').insert(rows);
    if (!insertError) continue;

    const { error: restoreError } = oldRows.length
      ? await supabaseAdmin.from('food_ingredients').insert(oldRows)
      : { error: null };
    const restoreMessage = restoreError ? ` Restore also failed: ${restoreError.message}` : '';
    throw new Error(
      `Could not write ${candidate.food.name}: ${insertError.message}.${restoreMessage}`
    );
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
