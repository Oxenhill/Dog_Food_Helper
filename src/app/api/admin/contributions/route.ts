import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { findDuplicateFood } from '@/lib/foodDuplicates';
import { insertParsedIngredients } from '@/lib/ingredientPayload';
import { ValidatedContribution } from '@/lib/contributedFoods';

/**
 * Admin review of third-party food contributions.
 *
 * GET  ?status=pending — the queue, oldest first.
 * POST { id, action: 'approve' | 'reject', note? }
 *
 * Approval is the only path from `contributed_foods` into `foods`. It re-runs
 * the duplicate check at approval time rather than trusting the one done at
 * submission: the catalogue may have gained the product in between, from the
 * discovery cron or another contributor, and a duplicate food would split one
 * product's correlation history across two rows.
 *
 * `ingredient_source` is set to 'contributor' so an approved contribution stays
 * distinguishable from a scrape and from an owner-confirmed label photo. If one
 * contributor's batch later turns out to be unreliable, that column plus
 * `contributed_foods.contributor_label` is what makes the damage findable.
 */

const VALID_STATUSES = ['pending', 'approved', 'rejected'] as const;

interface ContributionRow {
  id: string;
  brand: string;
  name: string;
  source_url: string;
  payload: ValidatedContribution;
  contributor_label: string | null;
  status: string;
  review_note: string | null;
  reviewed_at: string | null;
  resulting_food_id: string | null;
  created_at: string;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const status = request.nextUrl.searchParams.get('status') ?? 'pending';
  if (!VALID_STATUSES.includes(status as (typeof VALID_STATUSES)[number])) {
    return NextResponse.json(
      { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
      { status: 400 }
    );
  }

  const { data, error } = await supabaseAdmin
    .from('contributed_foods')
    .select('*')
    .eq('status', status)
    .order('created_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as ContributionRow[];

  // Flag anything that has since been added to the catalogue, so the reviewer
  // sees it before clicking rather than after.
  const items = await Promise.all(
    rows.map(async (row) => {
      if (status !== 'pending') return { ...row, possible_duplicate: null };
      const duplicate = await findDuplicateFood(row.brand, row.name);
      return {
        ...row,
        possible_duplicate: duplicate ? { id: duplicate.id, brand: duplicate.brand, name: duplicate.name } : null,
      };
    })
  );

  return NextResponse.json({ items }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { id?: unknown; action?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

  if (!id || !action) {
    return NextResponse.json(
      { error: 'Provide `id` and `action` ("approve" or "reject").' },
      { status: 400 }
    );
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('contributed_foods')
    .select('*')
    .eq('id', id)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const row = existing as ContributionRow;
  if (row.status !== 'pending') {
    return NextResponse.json(
      { error: `This submission was already ${row.status}.` },
      { status: 409 }
    );
  }

  // --- Reject --------------------------------------------------------------
  if (action === 'reject') {
    const { error } = await supabaseAdmin
      .from('contributed_foods')
      .update({
        status: 'rejected',
        review_note: note,
        reviewed_by: admin.id,
        reviewed_at: new Date().toISOString(),
      })
      .eq('id', id);

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ status: 'rejected' }, { status: 200 });
  }

  // --- Approve -------------------------------------------------------------
  const payload = row.payload;
  if (!payload || !Array.isArray(payload.ingredients) || payload.ingredients.length === 0) {
    return NextResponse.json(
      { error: 'This submission has no usable ingredient list and cannot be approved.' },
      { status: 400 }
    );
  }

  // Re-check now, not just at submission time.
  const duplicate = await findDuplicateFood(row.brand, row.name);
  if (duplicate) {
    return NextResponse.json(
      {
        error: `"${row.brand} — ${row.name}" is already in the catalogue. Reject this submission instead of approving it.`,
        duplicate_food_id: duplicate.id,
      },
      { status: 409 }
    );
  }

  let sourceDomain: string | null = null;
  try {
    sourceDomain = new URL(row.source_url).hostname.replace(/^www\./, '');
  } catch {
    sourceDomain = null;
  }

  const { data: newFood, error: foodError } = await supabaseAdmin
    .from('foods')
    .insert({
      brand: payload.brand,
      name: payload.name,
      food_type: payload.food_type,
      is_treat: payload.is_treat === true,
      suitable_age_min_months: payload.suitable_age_min_months,
      suitable_age_max_months: payload.suitable_age_max_months,
      suitable_size_min: payload.suitable_size_min,
      suitable_size_max: payload.suitable_size_max,
      price_per_kg: payload.price_per_kg,
      calories_per_kg: payload.calories_per_kg,
      protein_pct: payload.nutrients?.protein_pct ?? null,
      fat_pct: payload.nutrients?.fat_pct ?? null,
      fibre_pct: payload.nutrients?.fibre_pct ?? null,
      moisture_pct: payload.nutrients?.moisture_pct ?? null,
      ash_pct: payload.nutrients?.ash_pct ?? null,
      calcium_pct: payload.nutrients?.calcium_pct ?? null,
      phosphorus_pct: payload.nutrients?.phosphorus_pct ?? null,
      sodium_pct: payload.nutrients?.sodium_pct ?? null,
      ingredient_source: 'contributor',
      source_url: payload.source_url,
      source_domain: sourceDomain,
      // The reviewer has just checked the parsed list against the excerpt, so
      // this is a genuine verification timestamp rather than an import artefact.
      last_verified_at: new Date().toISOString(),
    })
    .select('id')
    .single();

  if (foodError || !newFood) {
    return NextResponse.json(
      { error: foodError?.message ?? 'Could not create the food.' },
      { status: 500 }
    );
  }

  const foodId = (newFood as { id: string }).id;
  const { written, error: ingredientError } = await insertParsedIngredients(
    foodId,
    payload.ingredients
  );

  if (ingredientError) {
    // The food row exists but its ingredients are incomplete — which is the one
    // state that must never be left silently, because a food with a partial
    // ingredient list looks safe to the allergy filter while hiding an
    // allergen. Remove the food and keep the submission pending so it can be
    // approved again cleanly.
    await supabaseAdmin.from('food_ingredients').delete().eq('food_id', foodId);
    await supabaseAdmin.from('foods').delete().eq('id', foodId);
    return NextResponse.json(
      {
        error: `Ingredients could not be written (${ingredientError}). Nothing was kept — the submission is still pending.`,
      },
      { status: 500 }
    );
  }

  const { error: updateError } = await supabaseAdmin
    .from('contributed_foods')
    .update({
      status: 'approved',
      review_note: note,
      reviewed_by: admin.id,
      reviewed_at: new Date().toISOString(),
      resulting_food_id: foodId,
    })
    .eq('id', id);

  if (updateError) {
    // The food and its ingredients are correct; only the audit link failed.
    // Report it rather than rolling back real catalogue data.
    return NextResponse.json(
      {
        status: 'approved',
        food_id: foodId,
        ingredients_written: written,
        warning: `Food created, but the submission record could not be marked approved: ${updateError.message}`,
      },
      { status: 200 }
    );
  }

  return NextResponse.json(
    { status: 'approved', food_id: foodId, ingredients_written: written },
    { status: 200 }
  );
}
