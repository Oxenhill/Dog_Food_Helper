import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { findDuplicateFood } from '@/lib/foodDuplicates';
import { insertParsedIngredients, type ParsedIngredient } from '@/lib/ingredientPayload';
import { ValidatedContribution } from '@/lib/contributedFoods';
import { parseComposition, type ParsedCompositionIngredient } from '@/lib/compositionParser';
import { FoodType } from '@/lib/types';
import { extractFeedingGuidance } from '@/lib/labelPanelParsing';

/**
 * Admin review of third-party food contributions — the ONE approval path
 * shared by two different origins that land in this same table:
 *
 * 1. Friend/contributor submissions (contributor_label = null or a person's
 *    name) — payload.ingredients arrives already parsed, from the pasted
 *    label text at submission time.
 * 2. Crawler harvests (contributor_label = 'shopify-adapter' /
 *    'tier2-adapter') — payload has no pre-parsed ingredients, only a
 *    verbatim `composition_raw` excerpt. parse_composition() runs HERE, at
 *    review time, so the reviewer sees the parsed list next to the exact
 *    text it came from, and a parser fix applies to every row still
 *    pending without re-crawling anything.
 *
 * GET  ?status=pending — the queue, oldest first.
 * POST { id, action: 'approve' | 'reject', note?, brand?, name?, food_type?, is_treat? }
 *   brand/name/food_type/is_treat are overrides for crawler rows, which
 *   often don't know food_type at all (no schema.org field for it) and
 *   sometimes have no real product name (falls back to the source URL when
 *   the page had no JSON-LD).
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
const VALID_FOOD_TYPES: FoodType[] = ['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other'];

interface ContributionRow {
  id: string;
  brand: string;
  name: string;
  source_url: string;
  payload: ValidatedContribution;
  composition_raw: string | null;
  contributor_label: string | null;
  status: string;
  review_note: string | null;
  reviewed_at: string | null;
  resulting_food_id: string | null;
  created_at: string;
}

const CRAWLER_LABELS = new Set(['shopify-adapter', 'tier2-adapter']);

function isCrawlerRow(row: ContributionRow): boolean {
  return (row.contributor_label != null && CRAWLER_LABELS.has(row.contributor_label)) ||
    !Array.isArray(row.payload?.ingredients);
}

/** Legal categories stay unclassified here; label-derived additive categories are preserved. */
function toParsedIngredient(node: ParsedCompositionIngredient): ParsedIngredient {
  return {
    name: node.name,
    category: node.category?.startsWith('additive') ? node.category : null,
    inclusion_pct: node.inclusion_pct,
    note: node.note,
    additive_category_printed: node.additive_category_printed,
    sub: node.sub.map(toParsedIngredient),
  };
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
      const duplicate = status === 'pending' ? await findDuplicateFood(row.brand, row.name) : null;

      if (!isCrawlerRow(row)) {
        return {
          ...row,
          possible_duplicate: duplicate ? { id: duplicate.id, brand: duplicate.brand, name: duplicate.name } : null,
        };
      }

      // Crawler row: parse composition_raw HERE, live, rather than trusting
      // whatever was parsed at harvest time (there wasn't any — the crawler
      // only ever stores the verbatim excerpt). This is also why a parser
      // fix helps every row still sitting in this queue without a re-crawl.
      const excerpt = row.composition_raw ?? row.payload?.source_excerpt ?? '';
      const parsed = parseComposition(excerpt);
      return {
        ...row,
        possible_duplicate: duplicate ? { id: duplicate.id, brand: duplicate.brand, name: duplicate.name } : null,
        is_crawler_row: true,
        parsed_composition: {
          ingredients: parsed.ingredients,
          needs_review: parsed.needsReview,
          review_reasons: parsed.reviewReasons,
          excerpt,
        },
      };
    })
  );

  return NextResponse.json({ items }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: {
    id?: unknown;
    action?: unknown;
    note?: unknown;
    brand?: unknown;
    name?: unknown;
    food_type?: unknown;
    is_treat?: unknown;
    dry_run?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const id = typeof body.id === 'string' ? body.id : '';
  const action = body.action === 'approve' || body.action === 'reject' ? body.action : null;
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;
  // Two-run discipline on approve (owner decision, 2026-07-28): the first
  // call previews the exact foods row that would be written and commits
  // nothing; a second call with dry_run absent/false actually writes it.
  const dryRun = body.dry_run === true;
  // Overrides — only meaningful for crawler rows, which don't know
  // food_type at all and sometimes have no real product name (falls back
  // to the source URL when the page had no JSON-LD).
  const brandOverride = typeof body.brand === 'string' && body.brand.trim() ? body.brand.trim() : null;
  const nameOverride = typeof body.name === 'string' && body.name.trim() ? body.name.trim() : null;
  const foodTypeOverride = typeof body.food_type === 'string' ? body.food_type.trim() : null;
  const isTreatOverride = typeof body.is_treat === 'boolean' ? body.is_treat : null;

  if (!id || !action) {
    return NextResponse.json(
      { error: 'Provide `id` and `action` ("approve" or "reject").' },
      { status: 400 }
    );
  }
  if (action === 'reject' && !note) {
    return NextResponse.json(
      { error: 'A review note is required to reject a submission.' },
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
  const crawlerRow = isCrawlerRow(row);
  const payload = row.payload;

  let ingredientsToWrite: ParsedIngredient[];
  let foodInsert: {
    brand: string;
    name: string;
    food_type: string;
    is_treat: boolean;
    suitable_age_min_months: number | null;
    suitable_age_max_months: number | null;
    suitable_size_min: string | null;
    suitable_size_max: string | null;
    price_per_kg: number | null;
    calories_per_kg: number | null;
    protein_pct: number | null;
    fat_pct: number | null;
    fibre_pct: number | null;
    moisture_pct: number | null;
    ash_pct: number | null;
    calcium_pct: number | null;
    phosphorus_pct: number | null;
    sodium_pct: number | null;
    composition_raw: string | null;
  };

  if (crawlerRow) {
    const excerpt = row.composition_raw ?? payload?.source_excerpt ?? '';
    const parsed = parseComposition(excerpt);
    if (parsed.ingredients.length === 0) {
      return NextResponse.json(
        { error: 'No ingredients could be parsed from the composition text — cannot be approved.' },
        { status: 400 }
      );
    }
    if (!foodTypeOverride || !VALID_FOOD_TYPES.includes(foodTypeOverride as FoodType)) {
      return NextResponse.json(
        {
          error: `A crawler-sourced row needs food_type set to one of: ${VALID_FOOD_TYPES.join(', ')} — the source page has no field for it.`,
        },
        { status: 400 }
      );
    }
    ingredientsToWrite = parsed.ingredients.map(toParsedIngredient);
    foodInsert = {
      brand: brandOverride ?? row.brand,
      name: nameOverride ?? row.name,
      food_type: foodTypeOverride,
      is_treat: isTreatOverride === true,
      suitable_age_min_months: null,
      suitable_age_max_months: null,
      suitable_size_min: null,
      suitable_size_max: null,
      price_per_kg: null,
      calories_per_kg: null,
      protein_pct: null,
      fat_pct: null,
      fibre_pct: null,
      moisture_pct: null,
      ash_pct: null,
      calcium_pct: null,
      phosphorus_pct: null,
      sodium_pct: null,
      composition_raw: excerpt || null,
    };
  } else {
    if (!payload || !Array.isArray(payload.ingredients) || payload.ingredients.length === 0) {
      return NextResponse.json(
        { error: 'This submission has no usable ingredient list and cannot be approved.' },
        { status: 400 }
      );
    }
    ingredientsToWrite = payload.ingredients as ParsedIngredient[];
    foodInsert = {
      brand: brandOverride ?? payload.brand,
      name: nameOverride ?? payload.name,
      food_type: foodTypeOverride ?? payload.food_type,
      is_treat: isTreatOverride ?? payload.is_treat === true,
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
      composition_raw: row.composition_raw ?? null,
    };
  }

  // Informational only, never a filter/gate — pulled verbatim from whatever
  // composition text this row ended up with, deterministic, no model call.
  const dieteticFeedingDuration = extractFeedingGuidance(foodInsert.composition_raw);

  // Re-check now, not just at submission time.
  const duplicate = await findDuplicateFood(foodInsert.brand, foodInsert.name);
  if (duplicate) {
    return NextResponse.json(
      {
        error: `"${foodInsert.brand} — ${foodInsert.name}" is already in the catalogue. Reject this submission instead of approving it.`,
        duplicate_food_id: duplicate.id,
      },
      { status: 409 }
    );
  }

  // Preserve the actual origin rather than hardcoding one (owner decision,
  // 2026-07-28): a standalone admin packet capture (/admin/foods) is a real
  // label read, same as the dog-owner flow, and must be distinguishable from
  // a third-party contributor's submission or a crawl.
  const isAdminCapture = row.contributor_label === 'admin-photo-capture';
  const ingredientSource = isAdminCapture ? 'label_photo' : 'contributor';

  let sourceDomain: string | null = null;
  if (!isAdminCapture) {
    try {
      sourceDomain = new URL(row.source_url).hostname.replace(/^www\./, '');
    } catch {
      sourceDomain = null;
    }
  }

  if (dryRun) {
    return NextResponse.json(
      {
        dry_run: true,
        proposed_food: {
          ...foodInsert,
          ingredient_source: ingredientSource,
          source_url: isAdminCapture ? null : row.source_url,
          source_domain: sourceDomain,
          dietetic_feeding_duration: dieteticFeedingDuration,
        },
        ingredients_preview: ingredientsToWrite,
      },
      { status: 200 }
    );
  }

  const { data: newFood, error: foodError } = await supabaseAdmin
    .from('foods')
    .insert({
      ...foodInsert,
      ingredient_source: ingredientSource,
      source_url: isAdminCapture ? null : row.source_url,
      source_domain: sourceDomain,
      dietetic_feeding_duration: dieteticFeedingDuration,
      // The reviewer has just checked the parsed list against the excerpt —
      // that IS the ingredient-completeness verification this status
      // records, the same way a label-photo confirmation does.
      ingredient_data_status: 'complete',
      ingredient_status_reason: isAdminCapture
        ? 'Approved by admin review from a standalone packet-photo capture, verified against the panel text at capture time.'
        : crawlerRow
        ? 'Approved by admin review from a crawled composition excerpt, checked against the verbatim source text.'
        : 'Approved by admin review from a contributor submission, checked against the verbatim source excerpt.',
      ingredient_status_checked_at: new Date().toISOString(),
      recipe_version_status: 'current',
      product_availability_status: 'available',
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
    ingredientsToWrite
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
