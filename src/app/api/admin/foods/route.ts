import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { buildIlikeTerm } from '@/lib/postgrestFilter';

/**
 * Admin food-database list. Admin-gated (requireAdmin — verified session +
 * user_profiles.is_admin). Returns the columns the list view needs plus a
 * derived nutrient-completeness count (how many of the 8 guaranteed-analysis
 * nutrient_pct columns are non-null) so the UI can flag foods missing
 * composition data without shipping every row's full nutrient set.
 *
 * Optional `q` filters brand OR name via ilike `%q%`. Ordered by brand, name.
 */
const NUTRIENT_FIELDS = [
  'protein_pct',
  'fat_pct',
  'fibre_pct',
  'moisture_pct',
  'ash_pct',
  'phosphorus_pct',
  'sodium_pct',
  'calcium_pct',
] as const;

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    // 404, not 403 — don't confirm the endpoint's existence to non-admins.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const q = request.nextUrl.searchParams.get('q')?.trim();

  let query = supabaseAdmin
    .from('foods')
    .select(
      `id, brand, name, food_type, price_per_kg, ${NUTRIENT_FIELDS.join(', ')}`,
    )
    .order('brand', { ascending: true })
    .order('name', { ascending: true });

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

  // The select above is built from a template literal, so supabase-js can't
  // infer a row type from it — treat rows as plain records here.
  const rows = (data ?? []) as unknown as Record<string, unknown>[];

  const foods = rows.map((row) => {
    const nutrientCount = NUTRIENT_FIELDS.reduce(
      (count, field) => count + (row[field] !== null && row[field] !== undefined ? 1 : 0),
      0,
    );
    return {
      id: row.id as string,
      brand: row.brand as string,
      name: row.name as string,
      food_type: row.food_type as string,
      price_per_kg: row.price_per_kg as number | null,
      nutrient_count: nutrientCount,
      nutrient_total: NUTRIENT_FIELDS.length,
    };
  });

  return NextResponse.json({ foods }, { status: 200 });
}
