/**
 * Carbohydrate estimation for dog foods ("carbohydrate by difference" / NFE).
 *
 * Guaranteed-analysis panels almost never print carbohydrate. The standard
 * method used across pet nutrition is nitrogen-free extract — subtract the
 * measured fractions from 100:
 *
 *     carbohydrate ≈ 100 − protein − fat − fibre − moisture − ash
 *
 * WHAT THIS NUMBER IS NOT — read before relying on it:
 *
 * 1. It is a COARSE SCREEN, subordinate to the ingredient list. It cannot say
 *    WHICH carbohydrate (rice, potato, maize, peas, sugar) — and for a
 *    gut-biome protocol the identity of the ingredient is the active variable,
 *    not a single aggregate percentage. The ingredient list is the primary
 *    data; this figure only helps rank/screen once that exists.
 * 2. Fibre is subtracted here, so fibre is not being counted as carbohydrate —
 *    but the printed "crude fibre" figure captures mostly INSOLUBLE fibre
 *    (cellulose, lignin) and understates total dietary fibre. Soluble and
 *    prebiotic fibres (beet pulp fractions, inulin/FOS, psyllium) are largely
 *    missed, so they fall into this NFE figure and it therefore OVERSTATES
 *    digestible carbohydrate. Fibre type is not derivable from the panel at
 *    all — only the ingredient list shows it.
 * 3. It is a DERIVED ESTIMATE, never a label value, and must always be
 *    presented as "estimated".
 *
 * It is deterministic arithmetic on already-recorded values — no LLM, no
 * inference — so it is safe to use inside the deterministic hard-filter layer
 * without blurring the safety/inference separation.
 *
 * Returns null when any input is missing (we never partially guess). Values are
 * clamped to 0 and flagged when the printed fractions sum to more than 100 —
 * which happens with rounded label figures and indicates a data-quality issue
 * rather than a genuinely negative carbohydrate content.
 */

export interface CarbohydrateEstimate {
  /** Estimated carbohydrate %, clamped to >= 0. */
  percent: number;
  /** True when the source fractions summed to > 100 (rounded/inconsistent label data). */
  overSubscribed: boolean;
}

export interface CarbohydrateInputs {
  protein_pct?: number | null;
  fat_pct?: number | null;
  fibre_pct?: number | null;
  moisture_pct?: number | null;
  ash_pct?: number | null;
}

const REQUIRED: (keyof CarbohydrateInputs)[] = [
  'protein_pct',
  'fat_pct',
  'fibre_pct',
  'moisture_pct',
  'ash_pct',
];

/**
 * Estimate carbohydrate % by difference. Returns null if any required fraction
 * is missing — an incomplete panel cannot produce an honest estimate.
 */
export function estimateCarbohydrate(food: CarbohydrateInputs): CarbohydrateEstimate | null {
  let sum = 0;
  for (const key of REQUIRED) {
    const value = food[key];
    if (typeof value !== 'number' || !Number.isFinite(value)) return null;
    sum += value;
  }

  const raw = 100 - sum;
  return {
    percent: Math.max(0, Math.round(raw * 10) / 10),
    overSubscribed: raw < 0,
  };
}

/** Convenience: the estimated percentage alone, or null. */
export function carbohydratePct(food: CarbohydrateInputs): number | null {
  return estimateCarbohydrate(food)?.percent ?? null;
}

/**
 * Coarse banding for display. Thresholds are presentational only — they are NOT
 * clinical guidance and must never drive an exclusion on their own. A real
 * carbohydrate restriction belongs in an approved condition_contraindications
 * rule with a vet-chosen threshold.
 */
export type CarbBand = 'low' | 'moderate' | 'high';

export function carbBand(percent: number): CarbBand {
  if (percent < 20) return 'low';
  if (percent < 40) return 'moderate';
  return 'high';
}
