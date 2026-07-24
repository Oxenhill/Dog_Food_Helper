import { supabaseAdmin } from './supabase';
import { Food } from './types';

/**
 * Duplicate detection for the ingredient review queue's approval flow
 * (Phase 5, Part B item 3): normalise brand + name (case-insensitive,
 * whitespace-trimmed) and check for an existing `foods` row before merging
 * an approved queue item. Never auto-skips a match — the caller (the
 * `/api/ingredients/review` route) surfaces it back to the reviewer for
 * confirmation, per spec.
 *
 * `.ilike()` without wildcard characters is a case-insensitive exact match
 * in Postgres — combined with trimming both sides first, this covers the
 * spec's "case-insensitive, whitespace-trimmed" requirement without needing
 * a normalised generated column on `foods` (schema fidelity — Part A isn't
 * being altered for this).
 */
export async function findDuplicateFood(brand: string, name: string): Promise<Food | null> {
  const normBrand = brand.trim();
  const normName = name.trim();
  if (!normBrand || !normName) return null;

  const { data, error } = await supabaseAdmin
    .from('foods')
    .select('*')
    .ilike('brand', normBrand)
    .ilike('name', normName)
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('findDuplicateFood: lookup failed', error);
    return null;
  }
  return data ?? null;
}
