import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { deriveDataState, dataStateMessage, type DataState } from '@/lib/dataState';

/**
 * GET /api/catalogue — public, unauthenticated food browse (DECISION 4,
 * owner, 2026-07-28).
 *
 * Reads ONLY through public.catalogue_browse_rows(), a wrapper that itself
 * selects from catalogue.foods / catalogue.food_ingredients — never
 * public.foods / public.food_ingredients directly. This keeps browse and
 * the ODbL-published dataset identical by construction: the same
 * source_domain_allowlist exclusion catalogue.foods already applies (see
 * eefe5a6, 20260728160000) is the only filter deciding what exists here.
 *
 * This is a catalogue, not a recommendation: no score, no dog context, no
 * ranking language. See DATA_BOUNDARY.md and NO_AFFILIATE_POLICY.md.
 */
export const dynamic = 'force-dynamic';

const VALID_STATES: DataState[] = ['no_ingredients', 'opaque', 'clean'];
const STATE_SORT_RANK: Record<DataState, number> = { clean: 0, opaque: 1, no_ingredients: 2 };

interface CatalogueRow {
  id: string;
  brand: string;
  name: string;
  food_type: string;
  is_treat: boolean;
  source_url: string | null;
  price_per_kg: number | null;
  calories_per_kg: number | null;
  composition_is_opaque: boolean | null;
  composition_opaque_terms: string[] | null;
  has_ingredients: boolean;
}

export async function GET(request: NextRequest) {
  try {
    const { data, error } = await supabaseAdmin.rpc('catalogue_browse_rows');
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const rows = (data ?? []) as CatalogueRow[];

    const params = request.nextUrl.searchParams;
    const brandFilter = params.get('brand')?.trim() || null;
    const foodTypeFilter = params.get('food_type')?.trim() || null;
    const isTreatParam = params.get('is_treat');
    const stateFilter = params.get('state');

    if (stateFilter && !VALID_STATES.includes(stateFilter as DataState)) {
      return NextResponse.json(
        { error: `state must be one of: ${VALID_STATES.join(', ')}` },
        { status: 400 }
      );
    }

    // Facet options computed from the FULL unfiltered set, so the filter
    // dropdowns never shrink to only what the current filter already shows.
    const brands = Array.from(new Set(rows.map((r) => r.brand))).sort();
    const foodTypes = Array.from(new Set(rows.map((r) => r.food_type))).sort();

    let filtered = rows.map((r) => {
      const state = deriveDataState(r.has_ingredients, r.composition_is_opaque === true);
      return {
        food_id: r.id,
        brand: r.brand,
        name: r.name,
        food_type: r.food_type,
        is_treat: r.is_treat,
        source_url: r.source_url,
        price_per_kg: r.price_per_kg,
        calories_per_kg: r.calories_per_kg,
        data_state: state,
        data_state_message: dataStateMessage(state, r.composition_opaque_terms),
      };
    });

    if (brandFilter) filtered = filtered.filter((r) => r.brand === brandFilter);
    if (foodTypeFilter) filtered = filtered.filter((r) => r.food_type === foodTypeFilter);
    if (isTreatParam === 'true') filtered = filtered.filter((r) => r.is_treat === true);
    if (isTreatParam === 'false') filtered = filtered.filter((r) => r.is_treat === false);
    if (stateFilter) filtered = filtered.filter((r) => r.data_state === stateFilter);

    // Default sort (DECISION 4): state C first, then B, then A; brand/name
    // alphabetical within each state.
    filtered.sort((a, b) => {
      const stateDiff = STATE_SORT_RANK[a.data_state] - STATE_SORT_RANK[b.data_state];
      if (stateDiff !== 0) return stateDiff;
      const brandDiff = a.brand.localeCompare(b.brand);
      if (brandDiff !== 0) return brandDiff;
      return a.name.localeCompare(b.name);
    });

    return NextResponse.json(
      {
        foods: filtered,
        total: filtered.length,
        facets: { brands, food_types: foodTypes },
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Catalogue browse error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
