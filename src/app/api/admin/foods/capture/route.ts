import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { verifyNumericFields } from '@/lib/labelVerification';
import { parseComposition, type ParsedCompositionIngredient } from '@/lib/compositionParser';
import { checkExcerptSupport } from '@/lib/contributedFoods';
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
  'linoleic_acid_pct',
  'epa_dha_pct',
  'omega3_pct',
] as const;

function cleanPct(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 100) return null;
  return Math.round(n * 100) / 100;
}

/** parse_composition()'s legal_category has no equivalent in the food_ingredients nutritional vocabulary — mapping it would be a guess, so it's dropped to null rather than invented. additive maps directly; it's the one category both vocabularies share. Mirrors toParsedIngredient in /api/admin/contributions. */
function toPayloadIngredient(node: ParsedCompositionIngredient): {
  name: string;
  category: string | null;
  inclusion_pct: number | null;
  note: string | null;
  sub: ReturnType<typeof toPayloadIngredient>[];
} {
  return {
    name: node.name,
    category: node.category === 'additive' ? 'additive' : null,
    inclusion_pct: node.inclusion_pct,
    note: node.note,
    sub: node.sub.map(toPayloadIngredient),
  };
}

/**
 * POST /api/admin/foods/capture — the owner's standalone bulk-test capture
 * (/admin/foods), reusing LabelCapture in 'contribute' mode. Same
 * capture/resize/extract pipeline as the dog-owner flow (untouched); this is
 * the ONLY new write path, and it writes to contributed_foods with
 * status='pending' — never straight to `foods`. An admin review (see
 * /api/admin/contributions) is still required before it reaches the
 * catalogue, same as any other contribution.
 *
 * Numeric fields are verified against composition_panel_text with the same
 * verifyNumericFields used by /api/ingredients/confirm — a value the model
 * can't be pointed back to on the panel is dropped here too, before it ever
 * reaches the review queue. Ingredient percentages are parsed out of the
 * bracketed text ("Chicken (26%)") via the same parseComposition() the
 * crawler path uses, rather than storing inclusion_pct as null for
 * everything — it's only non-null where the label actually printed it.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const brand = typeof body.brand === 'string' ? body.brand.trim() : '';
  const name = typeof body.name === 'string' ? body.name.trim() : '';
  const foodType = typeof body.food_type === 'string' ? body.food_type.trim() : '';

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
    ? body.ingredients.filter((i): i is string => typeof i === 'string' && i.trim().length > 0)
    : [];
  if (ingredients.length === 0) {
    return NextResponse.json(
      { error: 'At least one ingredient is required — retake the back-of-pack photo if unreadable.' },
      { status: 400 }
    );
  }

  const panelText = typeof body.composition_panel_text === 'string' ? body.composition_panel_text : null;

  const rawNutrients: Record<string, number | null> = {};
  for (const column of NUTRIENT_COLUMNS) {
    rawNutrients[column] = cleanPct(body[column]);
  }
  const caloriesRaw = body.calories_per_kg;
  const rawCalories =
    caloriesRaw === null || caloriesRaw === undefined || !Number.isFinite(Number(caloriesRaw))
      ? null
      : Math.max(0, Math.round(Number(caloriesRaw)));

  // Same anti-fabrication check as /api/ingredients/confirm (labelVerification.ts,
  // unchanged) — a numeric field not findable in the panel text is dropped,
  // never written on the model's word alone.
  const { verified: nutrients, rejected: rejectedNutrientFields } = verifyNumericFields(
    rawNutrients,
    panelText
  );
  const {
    verified: { calories_per_kg: calories },
    rejected: rejectedCaloriesField,
  } = verifyNumericFields({ calories_per_kg: rawCalories }, panelText);
  const rejectedFields = [...rejectedNutrientFields, ...rejectedCaloriesField];

  // Percentages parsed out of the bracketed ingredient text, same parser the
  // crawler path uses — inclusion_pct is only ever non-null where printed.
  const parsedComposition = parseComposition(ingredients.join(', '));
  const parsedIngredients = parsedComposition.ingredients.map(toPayloadIngredient);

  const topLevelNames = parsedComposition.ingredients.map((i) => i.name);
  const { unsupported } = panelText
    ? checkExcerptSupport(topLevelNames, panelText)
    : { unsupported: topLevelNames };

  const payload = {
    brand,
    name,
    food_type: foodType,
    is_treat: body.is_treat === true,
    source_excerpt: panelText ?? '',
    ingredients: parsedIngredients,
    suitable_age_min_months: null,
    suitable_age_max_months: null,
    suitable_size_min: null,
    suitable_size_max: null,
    price_per_kg: null,
    calories_per_kg: calories,
    nutrients,
    unsupported_ingredient_names: unsupported,
  };

  const { data: inserted, error: insertError } = await supabaseAdmin
    .from('contributed_foods')
    // No real web source for a photo capture — a distinctive non-http
    // placeholder rather than a fake URL, so nothing downstream mistakes it
    // for a crawlable page. source_url is NOT NULL in the schema.
    .insert({
      brand,
      name,
      source_url: `label-photo:admin-capture-${Date.now()}`,
      payload,
      composition_raw: panelText,
      contributor_label: 'admin-photo-capture',
      status: 'pending',
    })
    .select('id')
    .single();

  if (insertError || !inserted) {
    return NextResponse.json(
      { error: insertError?.message ?? 'Could not save this submission.' },
      { status: 500 }
    );
  }

  return NextResponse.json(
    {
      outcome: 'submitted',
      submission_id: (inserted as { id: string }).id,
      message:
        rejectedFields.length > 0
          ? `Queued for review. ${rejectedFields.join(', ')} could not be verified against the panel text and ${rejectedFields.length === 1 ? 'was' : 'were'} left blank.`
          : 'Queued for review — nothing is added to the catalogue until an admin approves it.',
    },
    { status: 200 }
  );
}
