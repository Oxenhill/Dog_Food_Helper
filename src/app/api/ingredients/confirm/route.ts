import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { findDuplicateFood } from '@/lib/foodDuplicates';
import { FoodType } from '@/lib/types';

export const runtime = 'nodejs';

const VALID_FOOD_TYPES: FoodType[] = ['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other'];

const NUTRIENT_COLUMNS = [
  'protein_pct',
  'fat_pct',
  'fibre_pct',
  'moisture_pct',
  'ash_pct',
  'phosphorus_pct',
  'sodium_pct',
  'calcium_pct',
] as const;

interface ConfirmBody {
  brand?: string;
  name?: string;
  food_type?: string;
  is_treat?: boolean;
  ingredients?: string[];
  calories_per_kg?: number | null;
  protein_pct?: number | null;
  fat_pct?: number | null;
  fibre_pct?: number | null;
  moisture_pct?: number | null;
  ash_pct?: number | null;
  phosphorus_pct?: number | null;
  sodium_pct?: number | null;
  calcium_pct?: number | null;
}

function cleanPct(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  // A percentage outside 0-100 is a misread, not data.
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

/**
 * POST /api/ingredients/confirm — the owner confirms what they read on the
 * packet, and it becomes a food.
 *
 * This is the ONLY write in the photo flow. The values here are whatever the
 * owner accepted or corrected on screen, not the raw model output — they are
 * holding the packet, so their correction is the authority.
 *
 * ---------------------------------------------------------------------------
 * WHY AN EXISTING FOOD IS NEVER OVERWRITTEN
 * `foods` is SHARED. Every owner's recommendations read it, and the allergy
 * hard filter matches on `food_ingredients.ingredient_name`. If one owner's
 * mistaken confirmation could overwrite an existing record, it could cause a
 * DIFFERENT owner's allergic dog to be offered a food containing its allergen.
 * That risk is not the submitter's to accept on someone else's behalf.
 *
 * So: a genuinely new product is created immediately (no bottleneck — the
 * owner's own submission is live for them at once), while a submission for a
 * food we already hold is recorded as a second, independent observation in
 * `ingredient_review_queue` and surfaced as a conflict. Nobody's data is
 * silently replaced, and the queue only ever contains real disagreements
 * rather than every routine submission.
 * ---------------------------------------------------------------------------
 */
export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    let body: ConfirmBody;
    try {
      body = (await request.json()) as ConfirmBody;
    } catch {
      return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
    }

    const brand = (body.brand ?? '').trim();
    const name = (body.name ?? '').trim();
    const foodType = (body.food_type ?? '').trim();

    if (!brand || !name) {
      return NextResponse.json(
        { error: 'Brand and product name are both required — please fill them in from the packet.' },
        { status: 400 }
      );
    }
    if (!VALID_FOOD_TYPES.includes(foodType as FoodType)) {
      return NextResponse.json(
        { error: `Food type must be one of: ${VALID_FOOD_TYPES.join(', ')}` },
        { status: 400 }
      );
    }

    const ingredients = Array.isArray(body.ingredients)
      ? body.ingredients
          .filter((i): i is string => typeof i === 'string')
          .map((i) => i.trim())
          .filter((i) => i.length > 0 && i.length <= 300)
      : [];

    if (ingredients.length === 0) {
      return NextResponse.json(
        {
          error:
            'At least one ingredient is required. If the ingredient list is not readable, retake the photo of the back of the packet rather than saving an empty list.',
        },
        { status: 400 }
      );
    }

    const nutrients: Record<string, number | null> = {};
    for (const column of NUTRIENT_COLUMNS) {
      nutrients[column] = cleanPct(body[column]);
    }

    const caloriesRaw = body.calories_per_kg;
    const calories =
      caloriesRaw === null || caloriesRaw === undefined || !Number.isFinite(Number(caloriesRaw))
        ? null
        : Math.max(0, Math.round(Number(caloriesRaw)));

    const isTreat = body.is_treat === true;

    // Already hold this product? Record the observation, change nothing.
    const duplicate = await findDuplicateFood(brand, name);
    if (duplicate) {
      const { data: queued, error: queueError } = await supabaseAdmin
        .from('ingredient_review_queue')
        .insert({
          raw_ocr_json: {
            brand,
            product_name: name,
            ingredients,
            age_suitability: null,
            weight_range: null,
            price: null,
            notes: 'Owner-confirmed packet transcription for a food we already hold.',
            _submission_kind: 'duplicate_observation',
            _existing_food_id: duplicate.id,
            _food_type: foodType,
            _is_treat: isTreat,
            _calories_per_kg: calories,
            ...nutrients,
          },
          submitted_by: user.id,
          status: 'pending',
        })
        .select('id')
        .single();

      if (queueError) {
        console.error('ingredients/confirm: failed to record duplicate observation', queueError);
        return NextResponse.json({ error: 'Could not record your submission.' }, { status: 500 });
      }

      return NextResponse.json(
        {
          outcome: 'already_known',
          food_id: duplicate.id,
          submission_id: queued.id,
          message:
            'Thanks — we already have this food, so your version has been recorded alongside it rather than replacing it. If the two differ, we will check which is current.',
        },
        { status: 200 }
      );
    }

    // Genuinely new product — create it.
    const { data: newFood, error: foodError } = await supabaseAdmin
      .from('foods')
      .insert({
        brand,
        name,
        food_type: foodType,
        is_treat: isTreat,
        calories_per_kg: calories,
        ...nutrients,
        ingredient_source: 'label_photo',
        submitted_by: user.id,
        // The packet in the owner's hand IS the current recipe, and they have
        // just read it — which is exactly what these audit columns record.
        ingredient_data_status: 'complete',
        recipe_version_status: 'current',
        product_availability_status: 'available',
        ingredient_status_reason: 'Transcribed from packet photos and confirmed by the submitting owner.',
        ingredient_status_checked_at: new Date().toISOString(),
        last_verified_at: new Date().toISOString(),
      })
      .select('id, brand, name')
      .single();

    if (foodError || !newFood) {
      console.error('ingredients/confirm: food insert failed', foodError);
      return NextResponse.json({ error: 'Could not save this food.' }, { status: 500 });
    }

    const rows = ingredients.map((ingredient_name, index) => ({
      food_id: newFood.id,
      ingredient_name,
      ingredient_category: null,
      position_in_list: index + 1,
    }));

    const { error: ingredientsError } = await supabaseAdmin.from('food_ingredients').insert(rows);
    if (ingredientsError) {
      // A food row with no ingredients is worse than none: it would look
      // complete while contributing nothing to the allergy filter. Roll back.
      console.error('ingredients/confirm: ingredient insert failed, rolling back food', ingredientsError);
      await supabaseAdmin.from('foods').delete().eq('id', newFood.id);
      return NextResponse.json({ error: 'Could not save the ingredient list.' }, { status: 500 });
    }

    return NextResponse.json(
      {
        outcome: 'created',
        food_id: newFood.id,
        brand: newFood.brand,
        name: newFood.name,
        ingredients_saved: rows.length,
        is_treat: isTreat,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('ingredients/confirm error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
