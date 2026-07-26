import { FoodType, SizeCategory } from './types';
import { ParsedIngredient, parseIngredientList, flattenIngredientNames } from './ingredientPayload';

/**
 * Validation for a third-party food contribution.
 *
 * The threat this file exists to handle is NOT a dishonest contributor. It is
 * that pet-food product pages commonly render their ingredient block via JS, a
 * plain fetch returns a shell, and an assistant asked to transcribe a list it
 * could not actually read will often produce a plausible one from general
 * knowledge of the recipe. That output looks exactly like a good submission,
 * and it lands in the table the allergy hard filter reads.
 *
 * So every food must carry `source_excerpt`: the ingredient text verbatim, as
 * printed. Two things then become possible that prose instructions alone cannot
 * achieve:
 *   1. An automated cross-check — the parsed ingredient names must actually
 *      appear in the excerpt (see checkExcerptSupport). A list reconstructed
 *      from memory fails this, because it will not match the page's exact
 *      wording, ordering artefacts and qualifiers.
 *   2. A two-second human review — the reviewer diffs the parsed list against
 *      the excerpt on one screen, rather than reopening the product page.
 */

const VALID_FOOD_TYPES: FoodType[] = ['raw', 'kibble', 'cold_pressed', 'cooked', 'wet', 'other'];
const VALID_SIZES: SizeCategory[] = ['toy', 'small', 'medium', 'large', 'giant'];

export const MAX_FOODS_PER_SUBMISSION = 25;
/** Per-token cap over a rolling hour. A real contributor batch is well under this. */
export const MAX_FOODS_PER_HOUR = 120;

const MAX_TEXT = 300;
const MIN_EXCERPT_LENGTH = 40;
const MAX_EXCERPT_LENGTH = 6000;

/**
 * Share of top-level ingredient names that must be findable in the excerpt.
 * Not 100%: legitimate submissions differ in small ways — "Vitamins & Minerals"
 * against "Vitamins and Minerals", a trailing "(4%)" split off into
 * inclusion_pct, an en-dash. 0.8 tolerates that while still failing a list that
 * was not read off this page at all.
 */
const EXCERPT_SUPPORT_THRESHOLD = 0.8;

export interface ContributedNutrients {
  protein_pct: number | null;
  fat_pct: number | null;
  fibre_pct: number | null;
  moisture_pct: number | null;
  ash_pct: number | null;
  calcium_pct: number | null;
  phosphorus_pct: number | null;
  sodium_pct: number | null;
}

export interface ValidatedContribution {
  brand: string;
  name: string;
  food_type: FoodType;
  source_url: string;
  source_excerpt: string;
  ingredients: ParsedIngredient[];
  is_treat: boolean;
  suitable_age_min_months: number | null;
  suitable_age_max_months: number | null;
  suitable_size_min: SizeCategory | null;
  suitable_size_max: SizeCategory | null;
  price_per_kg: number | null;
  calories_per_kg: number | null;
  nutrients: ContributedNutrients;
  /** Names not found in the excerpt. Empty is ideal; surfaced to the reviewer. */
  unsupported_ingredient_names: string[];
}

export type ValidationOutcome =
  | { ok: true; value: ValidatedContribution }
  | { ok: false; error: string };

/** Lowercase, collapse whitespace, normalise the punctuation labels vary on. */
function normaliseForMatch(text: string): string {
  return text
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[‐-―]/g, '-')
    .replace(/[^a-z0-9%.\-/ ]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Which of these ingredient names cannot be found in the excerpt.
 *
 * Substring matching on normalised text, deliberately lenient about what
 * surrounds a name: the excerpt is the raw printed block, so a name will be
 * embedded in commas, percentages and parentheses.
 */
export function checkExcerptSupport(
  names: string[],
  excerpt: string
): { unsupported: string[]; supportedRatio: number } {
  const haystack = normaliseForMatch(excerpt);
  const unsupported: string[] = [];

  for (const name of names) {
    const needle = normaliseForMatch(name);
    if (!needle) continue;
    if (!haystack.includes(needle)) unsupported.push(name);
  }

  const total = names.length || 1;
  return { unsupported, supportedRatio: (total - unsupported.length) / total };
}

function readText(value: unknown, field: string, max = MAX_TEXT): ValidationOutcome | string {
  if (typeof value !== 'string' || value.trim() === '') {
    return { ok: false, error: `\`${field}\` is required.` };
  }
  const trimmed = value.trim();
  if (trimmed.length > max) {
    return { ok: false, error: `\`${field}\` exceeds ${max} characters.` };
  }
  return trimmed;
}

/**
 * Optional number in a range. Absent/null stays null; a present-but-invalid
 * value is an error rather than a silent null, so a contributor mistake is
 * reported instead of quietly discarding data they did read off the page.
 */
function readOptionalNumber(
  value: unknown,
  field: string,
  min: number,
  max: number
): { value: number | null } | { error: string } {
  if (value == null || value === '') return { value: null };
  const num = typeof value === 'number' ? value : Number(value);
  if (!Number.isFinite(num)) return { error: `\`${field}\` must be a number or null.` };
  if (num < min || num > max) {
    return { error: `\`${field}\` must be between ${min} and ${max} (got ${num}).` };
  }
  return { value: num };
}

function readOptionalSize(
  value: unknown,
  field: string
): { value: SizeCategory | null } | { error: string } {
  if (value == null || value === '') return { value: null };
  if (typeof value !== 'string' || !VALID_SIZES.includes(value as SizeCategory)) {
    return { error: `\`${field}\` must be one of: ${VALID_SIZES.join(', ')}, or null.` };
  }
  return { value: value as SizeCategory };
}

export function validateContribution(raw: unknown): ValidationOutcome {
  if (!raw || typeof raw !== 'object') {
    return { ok: false, error: 'Each food must be an object.' };
  }
  const item = raw as Record<string, unknown>;

  const brand = readText(item.brand, 'brand');
  if (typeof brand !== 'string') return brand;
  const name = readText(item.name, 'name');
  if (typeof name !== 'string') return name;

  // --- food_type -----------------------------------------------------------
  const foodType = typeof item.food_type === 'string' ? item.food_type.trim() : '';
  if (!VALID_FOOD_TYPES.includes(foodType as FoodType)) {
    return {
      ok: false,
      error: `\`food_type\` must be one of: ${VALID_FOOD_TYPES.join(', ')}.`,
    };
  }

  // --- source_url ----------------------------------------------------------
  // Required and must be a real http(s) URL: it is the evidence a reviewer
  // opens, and an unverifiable submission has no value.
  const sourceUrlRaw = readText(item.source_url, 'source_url', 2000);
  if (typeof sourceUrlRaw !== 'string') return sourceUrlRaw;
  let sourceUrl: string;
  try {
    const parsed = new URL(sourceUrlRaw);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: '`source_url` must be an http(s) web address.' };
    }
    sourceUrl = parsed.toString();
  } catch {
    return { ok: false, error: `\`source_url\` is not a valid web address: ${sourceUrlRaw}` };
  }

  // --- ingredients ---------------------------------------------------------
  const parsedList = parseIngredientList(item.ingredients);
  if ('error' in parsedList) return { ok: false, error: parsedList.error };

  // --- source_excerpt ------------------------------------------------------
  if (typeof item.source_excerpt !== 'string' || item.source_excerpt.trim() === '') {
    return {
      ok: false,
      error:
        '`source_excerpt` is required — paste the ingredient text exactly as printed on the page. A list with no excerpt cannot be checked and is not accepted.',
    };
  }
  const excerpt = item.source_excerpt.trim().slice(0, MAX_EXCERPT_LENGTH);
  if (excerpt.length < MIN_EXCERPT_LENGTH) {
    return {
      ok: false,
      error: `\`source_excerpt\` is too short (${excerpt.length} characters) to be a real ingredient list.`,
    };
  }

  // The cross-check. Top-level names only: a sub-ingredient's wording is often
  // absorbed into its parent's parentheses, so requiring nested names to match
  // independently would fail correct submissions.
  const topLevelNames = parsedList.value.map((i) => i.name);
  const { unsupported, supportedRatio } = checkExcerptSupport(topLevelNames, excerpt);
  if (supportedRatio < EXCERPT_SUPPORT_THRESHOLD) {
    return {
      ok: false,
      error:
        `Only ${Math.round(supportedRatio * 100)}% of the ingredients appear in the pasted label text — ` +
        `these do not: ${unsupported.slice(0, 8).join(', ')}. ` +
        'This usually means the list was not read directly off the page. Re-copy the ingredient text exactly as printed, or skip this food.',
    };
  }

  // --- optional numerics ---------------------------------------------------
  const optional: Record<string, [unknown, number, number]> = {
    price_per_kg: [item.price_per_kg, 0, 500],
    // 8000 kcal/kg is above any real dry food; the cap only catches unit slips
    // (kcal per 100g entered as per kg, and similar).
    calories_per_kg: [item.calories_per_kg, 100, 8000],
    suitable_age_min_months: [item.suitable_age_min_months, 0, 360],
    suitable_age_max_months: [item.suitable_age_max_months, 0, 360],
    protein_pct: [item.protein_pct, 0, 100],
    fat_pct: [item.fat_pct, 0, 100],
    fibre_pct: [item.fibre_pct, 0, 100],
    moisture_pct: [item.moisture_pct, 0, 100],
    ash_pct: [item.ash_pct, 0, 100],
    calcium_pct: [item.calcium_pct, 0, 100],
    phosphorus_pct: [item.phosphorus_pct, 0, 100],
    sodium_pct: [item.sodium_pct, 0, 100],
  };

  const numbers: Record<string, number | null> = {};
  for (const [field, [value, min, max]] of Object.entries(optional)) {
    const result = readOptionalNumber(value, field, min, max);
    if ('error' in result) return { ok: false, error: result.error };
    numbers[field] = result.value;
  }

  const sizeMin = readOptionalSize(item.suitable_size_min, 'suitable_size_min');
  if ('error' in sizeMin) return { ok: false, error: sizeMin.error };
  const sizeMax = readOptionalSize(item.suitable_size_max, 'suitable_size_max');
  if ('error' in sizeMax) return { ok: false, error: sizeMax.error };

  if (
    numbers.suitable_age_min_months != null &&
    numbers.suitable_age_max_months != null &&
    numbers.suitable_age_min_months > numbers.suitable_age_max_months
  ) {
    return { ok: false, error: '`suitable_age_min_months` is greater than the maximum.' };
  }

  // Unsupported nested names are still worth showing a reviewer even when the
  // submission passes, so they are recorded rather than dropped.
  const allNames = flattenIngredientNames(parsedList.value);
  const fullCheck = checkExcerptSupport(allNames, excerpt);

  return {
    ok: true,
    value: {
      brand,
      name,
      food_type: foodType as FoodType,
      source_url: sourceUrl,
      source_excerpt: excerpt,
      ingredients: parsedList.value,
      is_treat: item.is_treat === true,
      suitable_age_min_months: numbers.suitable_age_min_months,
      suitable_age_max_months: numbers.suitable_age_max_months,
      suitable_size_min: sizeMin.value,
      suitable_size_max: sizeMax.value,
      price_per_kg: numbers.price_per_kg,
      calories_per_kg: numbers.calories_per_kg,
      nutrients: {
        protein_pct: numbers.protein_pct,
        fat_pct: numbers.fat_pct,
        fibre_pct: numbers.fibre_pct,
        moisture_pct: numbers.moisture_pct,
        ash_pct: numbers.ash_pct,
        calcium_pct: numbers.calcium_pct,
        phosphorus_pct: numbers.phosphorus_pct,
        sodium_pct: numbers.sodium_pct,
      },
      unsupported_ingredient_names: fullCheck.unsupported,
    },
  };
}
