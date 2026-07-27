/**
 * JS mirror of the Postgres `is_valid_gtin14` function
 * (supabase/migrations/20260727112405_phase1_gtin_identity_and_integrity_guard.sql).
 * Kept in lockstep deliberately: the crawler validates a scraped barcode
 * client-side before ever writing it, rather than relying on the DB
 * constraint to silently reject it later. Test vectors are the same five
 * used to verify the SQL function.
 */

/** Strips non-digits and zero-pads to 14, mirroring foods.gtin_norm's generated column. */
export function normalizeGtin(raw: string): string | null {
  const digits = raw.replace(/\D/g, '');
  if (digits === '') return null;
  return digits.padStart(14, '0');
}

/** Mod-10 GTIN checksum. `gtin14` must already be exactly 14 digits (use normalizeGtin first). */
export function isValidGtin14(gtin14: string): boolean {
  if (!/^\d{14}$/.test(gtin14)) return false;
  const digits = gtin14.split('').map(Number);
  const checkDigit = digits[13];
  let sum = 0;
  for (let i = 0; i <= 12; i++) {
    const weight = (14 - i) % 2 === 0 ? 3 : 1;
    sum += weight * digits[i];
  }
  const computed = (10 - (sum % 10)) % 10;
  return computed === checkDigit;
}

/** Normalize + validate in one step. Returns the normalized GTIN-14, or null if invalid/absent — never throws, never guesses. */
export function validateScrapedGtin(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const normalized = normalizeGtin(raw);
  if (!normalized) return null;
  return isValidGtin14(normalized) ? normalized : null;
}
