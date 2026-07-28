import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { FoodType, SizeCategory } from '@/lib/types';

/**
 * Admin food detail + correction endpoint. Admin-gated (requireAdmin —
 * verified session + user_profiles.is_admin).
 *
 * GET returns the food row plus its food_ingredients (composition prevalence
 * first, then additive panel order) so the detail page can show provenance (what was
 * actually extracted/ingested) alongside the editable nutrient/commercial
 * fields.
 *
 * PATCH is a correction/override surface, not a general food editor — see
 * BUILD_PROGRESS.md / CLAUDE.md: composition data primarily arrives via
 * automated extraction (a later workstream); this lets an admin fix or fill
 * in what extraction got wrong or couldn't find. Only the whitelisted
 * editable fields are ever written. A field is only touched if the request
 * body contains the key at all — `undefined`/absent means "leave alone",
 * `null` or `''` means "clear to unknown" (nutrients/measurements are
 * nullable; NEVER coerce a missing value to 0 — that would fabricate data).
 */

const FOOD_TYPES: FoodType[] = ['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other'];
const SIZE_CATEGORIES: SizeCategory[] = ['toy', 'small', 'medium', 'large', 'giant'];

const NUMERIC_FIELDS = [
  'protein_pct',
  'fat_pct',
  'fibre_pct',
  'moisture_pct',
  'ash_pct',
  'phosphorus_pct',
  'sodium_pct',
  'calcium_pct',
  'price_per_kg',
  'calories_per_kg',
  'suitable_age_min_months',
  'suitable_age_max_months',
] as const;

const TEXT_FIELDS = ['brand', 'name', 'source_url'] as const;

const ENUM_FIELDS = {
  food_type: FOOD_TYPES,
  suitable_size_min: SIZE_CATEGORIES,
  suitable_size_max: SIZE_CATEGORIES,
} as const;

type RouteParams = { params: Promise<{ foodId: string }> };

export async function GET(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { foodId } = await params;

  const [foodRes, ingredientsRes] = await Promise.all([
    supabaseAdmin.from('foods').select('*').eq('id', foodId).maybeSingle(),
    supabaseAdmin
      .from('food_ingredients')
      .select('*')
      .eq('food_id', foodId)
      .order('position_in_list', { ascending: true, nullsFirst: false })
      .order('additive_sequence', { ascending: true, nullsFirst: false }),
  ]);

  if (foodRes.error) {
    return NextResponse.json({ error: foodRes.error.message }, { status: 500 });
  }
  if (!foodRes.data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  if (ingredientsRes.error) {
    return NextResponse.json({ error: ingredientsRes.error.message }, { status: 500 });
  }

  return NextResponse.json(
    { food: foodRes.data, ingredients: ingredientsRes.data ?? [] },
    { status: 200 },
  );
}

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }
  const { foodId } = await params;

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const update: Record<string, unknown> = {};

  // Numeric fields: absent key -> untouched; null/'' -> clear to NULL (unknown,
  // never fabricated as 0); otherwise must parse as a finite number.
  for (const field of NUMERIC_FIELDS) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw === null || raw === '') {
      update[field] = null;
      continue;
    }
    const num = typeof raw === 'number' ? raw : Number(raw);
    if (typeof raw === 'boolean' || raw === undefined || Number.isNaN(num) || !Number.isFinite(num)) {
      return NextResponse.json({ error: `Field "${field}" must be a number or null` }, { status: 400 });
    }
    update[field] = num;
  }

  // Text fields: absent -> untouched; null/'' -> clear; otherwise trimmed string.
  for (const field of TEXT_FIELDS) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw === null || raw === '') {
      update[field] = null;
      continue;
    }
    if (typeof raw !== 'string') {
      return NextResponse.json({ error: `Field "${field}" must be a string or null` }, { status: 400 });
    }
    update[field] = raw.trim();
  }

  // brand/name are NOT NULL columns — reject an explicit clear on those two.
  if ('brand' in body && update.brand === null) {
    return NextResponse.json({ error: 'Field "brand" cannot be cleared' }, { status: 400 });
  }
  if ('name' in body && update.name === null) {
    return NextResponse.json({ error: 'Field "name" cannot be cleared' }, { status: 400 });
  }

  // Enum fields: validate against the known set. food_type is NOT NULL, so it
  // cannot be cleared; the size fields are nullable and may be cleared.
  for (const [field, allowed] of Object.entries(ENUM_FIELDS) as [
    keyof typeof ENUM_FIELDS,
    readonly string[],
  ][]) {
    if (!(field in body)) continue;
    const raw = body[field];
    if (raw === null || raw === '') {
      if (field === 'food_type') {
        return NextResponse.json({ error: 'Field "food_type" cannot be cleared' }, { status: 400 });
      }
      update[field] = null;
      continue;
    }
    if (typeof raw !== 'string' || !allowed.includes(raw)) {
      return NextResponse.json(
        { error: `Field "${field}" must be one of: ${allowed.join(', ')}` },
        { status: 400 },
      );
    }
    update[field] = raw;
  }

  if (Object.keys(update).length === 0) {
    return NextResponse.json({ error: 'No editable fields provided' }, { status: 400 });
  }

  update.updated_at = new Date().toISOString();

  const { data, error } = await supabaseAdmin
    .from('foods')
    .update(update)
    .eq('id', foodId)
    .select('*')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  return NextResponse.json({ food: data }, { status: 200 });
}
