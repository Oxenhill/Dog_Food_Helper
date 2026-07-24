import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { findDuplicateFood } from '@/lib/foodDuplicates';
import {
  IngredientReviewCorrections,
  IngredientReviewQueueItem,
  FoodType,
} from '@/lib/types';

const VALID_FOOD_TYPES: FoodType[] = ['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other'];

function isAdminAuthorized(request: NextRequest): boolean {
  // Same stopgap as Phase 4's /api/research/ingest (Part B item 4 explicitly
  // says "reuse the same stopgap"): a shared-secret header checked against
  // RESEARCH_INGEST_ADMIN_TOKEN. NOT a real admin/role auth system — see
  // BUILD_PROGRESS.md.
  const adminToken = process.env.RESEARCH_INGEST_ADMIN_TOKEN;
  if (!adminToken) return false;
  return request.headers.get('x-admin-token') === adminToken;
}

/**
 * POST /api/ingredients/review — Part B `reviewQueueItem` (admin/you only).
 *
 * Body:
 *   queue_id: string (required)
 *   decision: 'approve' | 'reject' (required)
 *   reviewer_id?: string — no real admin auth exists yet (see
 *     isAdminAuthorized above), so there's no session to derive this from;
 *     accepted optionally as a plain uuid if the caller wants it recorded
 *     against `reviewed_by`.
 *   feedback?: string — reject-path only. `ingredient_review_queue` (Part A)
 *     has no `feedback` column, so this is stored inside `raw_ocr_json`
 *     under `_review.feedback` rather than added as a new table column not
 *     in Part A — flagged in BUILD_PROGRESS.md as a "needs owner input"
 *     schema question (should Part A gain a real `feedback` text column?).
 *   corrections?: IngredientReviewCorrections — approve-path. The raw OCR
 *     JSON's fields (brand/product_name/ingredients/age_suitability/
 *     weight_range/price/notes) are free text and don't map cleanly onto
 *     `foods`' strict columns (food_type enum, suitable_size_min/max enum,
 *     price_per_kg/calories_per_kg numeric, suitable_age_min/max_months
 *     integer) — none of those are things OCR can reliably produce from a
 *     photo. `corrections.food_type` is required to approve into a *new*
 *     food record (foods.food_type is NOT NULL in Part A); everything else
 *     is optional/nullable, same as the schema.
 *   link_to_existing_food_id?: string — approve-path. Use this instead of
 *     creating a new `foods` row (e.g. after a duplicate-confirmation round
 *     trip below).
 *   confirm_create_despite_duplicate?: boolean — approve-path. Required to
 *     proceed with creating a *new* foods row when a likely duplicate was
 *     found (spec item 3: "ask reviewer to confirm ... don't auto-skip").
 *
 * Duplicate flow: on approve, if no `link_to_existing_food_id` is given,
 * brand+name is checked against `foods` (case-insensitive, trimmed). If a
 * match is found and `confirm_create_despite_duplicate` isn't set, this
 * returns 409 with the candidate match instead of merging — the reviewer
 * either resubmits with `link_to_existing_food_id` set to that food's id,
 * or with `confirm_create_despite_duplicate: true` if it's genuinely a
 * different product.
 */
export async function POST(request: NextRequest) {
  try {
    if (!process.env.RESEARCH_INGEST_ADMIN_TOKEN) {
      return NextResponse.json(
        { error: 'RESEARCH_INGEST_ADMIN_TOKEN is not configured on the server — review is disabled.' },
        { status: 503 }
      );
    }
    if (!isAdminAuthorized(request)) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const {
      queue_id,
      decision,
      reviewer_id,
      feedback,
      corrections,
      link_to_existing_food_id,
      confirm_create_despite_duplicate,
    }: {
      queue_id?: string;
      decision?: 'approve' | 'reject';
      reviewer_id?: string;
      feedback?: string;
      corrections?: IngredientReviewCorrections;
      link_to_existing_food_id?: string;
      confirm_create_despite_duplicate?: boolean;
    } = body;

    if (!queue_id || !decision || !['approve', 'reject'].includes(decision)) {
      return NextResponse.json(
        { error: 'queue_id and decision ("approve" | "reject") are required' },
        { status: 400 }
      );
    }

    const { data: queueItem, error: fetchError } = await supabaseAdmin
      .from('ingredient_review_queue')
      .select('*')
      .eq('id', queue_id)
      .single();

    if (fetchError || !queueItem) {
      return NextResponse.json({ error: 'Queue item not found' }, { status: 404 });
    }
    const item = queueItem as IngredientReviewQueueItem;

    if (item.status !== 'pending') {
      return NextResponse.json(
        { error: `Queue item has already been reviewed (status: ${item.status})` },
        { status: 400 }
      );
    }

    if (decision === 'reject') {
      const updatedRawJson = feedback
        ? { ...item.raw_ocr_json, _review: { ...item.raw_ocr_json._review, feedback } }
        : item.raw_ocr_json;

      const { data: updated, error: updateError } = await supabaseAdmin
        .from('ingredient_review_queue')
        .update({
          status: 'rejected',
          reviewed_by: reviewer_id ?? null,
          reviewed_at: new Date().toISOString(),
          raw_ocr_json: updatedRawJson,
        })
        .eq('id', queue_id)
        .select()
        .single();

      if (updateError) {
        return NextResponse.json({ error: updateError.message }, { status: 500 });
      }
      return NextResponse.json({ message: 'Rejected', item: updated }, { status: 200 });
    }

    // decision === 'approve'
    let resultingFoodId: string;

    if (link_to_existing_food_id) {
      const { data: existingFood, error: existingFoodError } = await supabaseAdmin
        .from('foods')
        .select('id')
        .eq('id', link_to_existing_food_id)
        .maybeSingle();
      if (existingFoodError || !existingFood) {
        return NextResponse.json({ error: 'link_to_existing_food_id does not match a food' }, { status: 400 });
      }
      resultingFoodId = existingFood.id;
    } else {
      const brand = corrections?.brand ?? item.raw_ocr_json.brand ?? undefined;
      const name = corrections?.name ?? item.raw_ocr_json.product_name ?? undefined;
      const foodType = corrections?.food_type;

      if (!brand || !name) {
        return NextResponse.json(
          {
            error:
              'brand and name (either from the OCR extraction or corrections.brand/corrections.name) are required to create a food record',
          },
          { status: 400 }
        );
      }
      if (!foodType || !VALID_FOOD_TYPES.includes(foodType)) {
        return NextResponse.json(
          {
            error: `corrections.food_type is required and must be one of: ${VALID_FOOD_TYPES.join(
              ', '
            )} — the OCR extraction doesn't produce this field, a reviewer must supply it`,
          },
          { status: 400 }
        );
      }

      const duplicate = await findDuplicateFood(brand, name);
      if (duplicate && !confirm_create_despite_duplicate) {
        return NextResponse.json(
          {
            duplicate_found: true,
            existing_food: duplicate,
            message:
              'A food with this brand+name already exists. Resubmit with link_to_existing_food_id set to the existing food, or confirm_create_despite_duplicate: true if this is genuinely a different product.',
          },
          { status: 409 }
        );
      }

      const ingredients = corrections?.ingredients ?? item.raw_ocr_json.ingredients ?? [];

      const { data: newFood, error: foodError } = await supabaseAdmin
        .from('foods')
        .insert({
          brand: brand.trim(),
          name: name.trim(),
          food_type: foodType,
          suitable_age_min_months: corrections?.suitable_age_min_months ?? null,
          suitable_age_max_months: corrections?.suitable_age_max_months ?? null,
          suitable_size_min: corrections?.suitable_size_min ?? null,
          suitable_size_max: corrections?.suitable_size_max ?? null,
          price_per_kg: corrections?.price_per_kg ?? null,
          calories_per_kg: corrections?.calories_per_kg ?? null,
          source_url: null, // owner photo, not a URL source — Tier 2, distinct from Tier 1 scraped foods
          source_domain: null,
          last_verified_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (foodError || !newFood) {
        return NextResponse.json({ error: foodError?.message ?? 'Failed to create food' }, { status: 500 });
      }
      resultingFoodId = newFood.id;

      if (ingredients.length > 0) {
        const ingredientRows = ingredients.map((ingredient_name: string, index: number) => ({
          food_id: resultingFoodId,
          ingredient_name,
          ingredient_category: null,
          position_in_list: index + 1,
        }));
        const { error: ingredientsError } = await supabaseAdmin
          .from('food_ingredients')
          .insert(ingredientRows);
        if (ingredientsError) {
          // The food row itself is already committed — surface the partial
          // failure rather than silently pretending ingredients were saved.
          console.error('review approve: food_ingredients insert failed', ingredientsError);
          return NextResponse.json(
            {
              error: `Food record was created (id: ${resultingFoodId}) but ingredient rows failed to save: ${ingredientsError.message}`,
            },
            { status: 500 }
          );
        }
      }
    }

    const { data: updated, error: updateError } = await supabaseAdmin
      .from('ingredient_review_queue')
      .update({
        status: 'approved',
        reviewed_by: reviewer_id ?? null,
        reviewed_at: new Date().toISOString(),
        resulting_food_id: resultingFoodId,
        raw_ocr_json: corrections
          ? { ...item.raw_ocr_json, _review: { ...item.raw_ocr_json._review, corrections_applied: true } }
          : item.raw_ocr_json,
      })
      .eq('id', queue_id)
      .select()
      .single();

    if (updateError) {
      return NextResponse.json(
        {
          error: `Food merged (id: ${resultingFoodId}) but the queue row failed to update: ${updateError.message}`,
        },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { message: 'Approved and merged', resulting_food_id: resultingFoodId, item: updated },
      { status: 200 }
    );
  } catch (error) {
    console.error('review error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
