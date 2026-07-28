import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { buildIlikeTerm } from '@/lib/postgrestFilter';

/**
 * GET /api/foods — owner-facing catalogue search.
 *
 * Exists so an owner can say what their dog is actually eating by picking the
 * real catalogue row rather than typing free text. Free text can't be joined
 * to an ingredient list, so a free-text food contributes nothing to
 * attribution; the picker is what makes the correlation engine possible.
 *
 * Distinct from /api/admin/foods, which is admin-gated and returns
 * record-review fields (nutrient completeness). This one is available to any
 * signed-in owner but is NOT anonymous — foods are shared reference data, not
 * per-owner rows, so there is no ownership filter, just a verified session.
 *
 * Query params:
 *   q      — matches brand OR name, case-insensitive substring
 *   type   — 'meal' (default, excludes treats) | 'treat' | 'all'
 *   limit  — 1..100, default 25
 */
const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 100;

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const params = request.nextUrl.searchParams;
    const q = params.get('q')?.trim();
    const type = params.get('type') ?? 'meal';
    const requestedLimit = Number(params.get('limit'));
    const limit =
      Number.isFinite(requestedLimit) && requestedLimit > 0
        ? Math.min(Math.round(requestedLimit), MAX_LIMIT)
        : DEFAULT_LIMIT;

    if (!['meal', 'treat', 'all'].includes(type)) {
      return NextResponse.json(
        { error: `Invalid type: ${type}. Expected meal, treat or all.` },
        { status: 400 }
      );
    }

    let query = supabaseAdmin
      .from('foods')
      .select('id, brand, name, food_type, is_treat, price_per_kg')
      .order('brand', { ascending: true })
      .order('name', { ascending: true })
      .limit(limit);

    // A chew is never dinner: the meal picker must not offer treats, the same
    // separation hardFilter.ts applies to the recommendation candidate set.
    if (type === 'meal') query = query.eq('is_treat', false);
    if (type === 'treat') query = query.eq('is_treat', true);

    if (q) {
      // Quoted so a comma, parenthesis or quote in the search term (e.g. a
      // product name like "Cod, Pumpkin & Orange") can't be parsed as a
      // logic-tree separator by PostgREST's .or().
      const term = buildIlikeTerm(q);
      query = query.or(`brand.ilike.${term},name.ilike.${term}`);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ foods: data ?? [], limit }, { status: 200 });
  } catch (error) {
    console.error('Food search error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
