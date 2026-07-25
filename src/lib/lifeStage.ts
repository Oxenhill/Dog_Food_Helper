import { supabaseAdmin } from './supabase';
import { LifeStage, SizeCategory } from './types';

/**
 * life_stage derivation (Phase 3, filling a Phase 1 gap)
 *
 * Part C item 1 of the technical build spec resolves this as system-derived
 * from date_of_birth + size_category against `breed_life_stage_thresholds`
 * (architecture doc §4). The `dogs.life_stage` column existed since Phase 1
 * and the dog-profile routes correctly rejected client writes to it, but
 * nothing ever actually computed it — the column has sat null. Phase 3 needs
 * life_stage as a direct scoring input (per the phase prompt), so this fills
 * that gap now rather than guessing at it inline in the scoring code.
 */

export interface LifeStageThresholds {
  size_category: SizeCategory;
  senior_from_years: number;
  adult_from_months: number;
}

export async function getLifeStageThresholds(
  sizeCategory: SizeCategory
): Promise<LifeStageThresholds | null> {
  const { data, error } = await supabaseAdmin
    .from('breed_life_stage_thresholds')
    .select('size_category, senior_from_years, adult_from_months')
    .eq('size_category', sizeCategory)
    .maybeSingle();

  if (error) throw error;
  if (!data) return null;

  return {
    size_category: data.size_category,
    senior_from_years: Number(data.senior_from_years),
    adult_from_months: Number(data.adult_from_months),
  };
}

/** Age in whole months as of `asOf` (defaults to now). */
export function ageInMonths(dateOfBirth: string, asOf: Date = new Date()): number {
  const dob = new Date(dateOfBirth);
  let months = (asOf.getFullYear() - dob.getFullYear()) * 12 + (asOf.getMonth() - dob.getMonth());
  if (asOf.getDate() < dob.getDate()) months -= 1;
  return Math.max(0, months);
}

/**
 * Converts an owner-entered approximate age (years + months) into an
 * approximate date_of_birth, so forms can collect the age people actually
 * know while `dogs.date_of_birth` / deriveLifeStage() keep working unchanged.
 *
 * Day-of-month convention: pinned to the 1st of the resulting month (not
 * today's day-of-month), so the same age input always yields the same
 * date_of_birth regardless of what day it's submitted on.
 */
export function ageToApproxDob(
  years: number,
  months: number,
  asOf: Date = new Date()
): string {
  const totalMonths = Math.max(0, Math.round(years) * 12 + Math.round(months));
  const result = new Date(Date.UTC(asOf.getUTCFullYear(), asOf.getUTCMonth(), 1));
  result.setUTCMonth(result.getUTCMonth() - totalMonths);
  const yyyy = result.getUTCFullYear();
  const mm = String(result.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(result.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

/** Inverse of ageToApproxDob: derives whole years + remaining months from a date_of_birth. */
export function dobToAge(
  dateOfBirth: string,
  asOf: Date = new Date()
): { years: number; months: number } {
  const totalMonths = ageInMonths(dateOfBirth, asOf);
  return { years: Math.floor(totalMonths / 12), months: totalMonths % 12 };
}

/**
 * Derives life_stage from date_of_birth + size_category per
 * breed_life_stage_thresholds. Returns null if either input, or the
 * thresholds reference row, is missing — callers should treat null as
 * "unknown" and fall back explicitly (never silently assume a birth date).
 */
export async function deriveLifeStage(
  dateOfBirth: string | null | undefined,
  sizeCategory: SizeCategory | null | undefined
): Promise<LifeStage | null> {
  if (!dateOfBirth || !sizeCategory) return null;

  const thresholds = await getLifeStageThresholds(sizeCategory);
  if (!thresholds) return null;

  const months = ageInMonths(dateOfBirth);
  const years = months / 12;

  if (months < thresholds.adult_from_months) return 'puppy';
  if (years >= thresholds.senior_from_years) return 'senior';
  return 'adult';
}
