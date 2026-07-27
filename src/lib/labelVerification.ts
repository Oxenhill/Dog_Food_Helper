/**
 * Cross-checks a numeric field the model extracted against the verbatim OCR
 * panel text it also transcribed (`composition_panel_text` in
 * labelExtraction.ts) — the same shape of defense the crawler pipeline
 * already applies to ingredient NAMES (see checkExcerptSupport in
 * contributedFoods.ts), extended to numbers.
 *
 * Owner finding, 2026-07-28: a Royal Canin Hypoallergenic label-photo
 * submission carried calories_per_kg = 3900 that appears on neither photo —
 * the model produced a plausible-looking number from general knowledge of
 * the product rather than reporting it as unreadable. Nothing on the
 * label-photo path checked a numeric value against anything before it was
 * written to `foods`, unlike ingredient names on the crawler path.
 *
 * The rule: a numeric field not findable in the panel text is dropped
 * (written as null), never written on the strength of the model's word
 * alone. No panel text at all means nothing can be verified, so every
 * non-null numeric field is rejected in that case.
 */

/** Strip thousands-separator commas ("3,900" -> "3900") before substring matching. */
function normaliseNumericText(text: string): string {
  return text.toLowerCase().replace(/(\d),(?=\d{3}(\D|$))/g, '$1');
}

/**
 * True if `value` appears in `panelText` as a written number, tolerating the
 * common integer/one-decimal-place variance a label or an OCR pass
 * introduces (21 vs 21.0, 3900 vs 3,900).
 */
export function numberAppearsInText(value: number, panelText: string): boolean {
  const haystack = normaliseNumericText(panelText);
  const candidates = new Set<string>([
    String(value),
    value.toFixed(0),
    value.toFixed(1),
    value.toFixed(2),
  ]);
  for (const candidate of candidates) {
    if (haystack.includes(candidate)) return true;
  }
  return false;
}

export interface NumericFieldCheck {
  verified: Record<string, number | null>;
  rejected: string[];
}

/**
 * Verifies every non-null value in `fields` against `panelText`. Rejected
 * (unverifiable) fields come back null; `rejected` names which ones so the
 * caller can record why and downgrade the food's data status.
 */
export function verifyNumericFields(
  fields: Record<string, number | null>,
  panelText: string | null | undefined
): NumericFieldCheck {
  const verified: Record<string, number | null> = {};
  const rejected: string[] = [];
  const text = panelText?.trim() || null;

  for (const [key, value] of Object.entries(fields)) {
    if (value === null || value === undefined) {
      verified[key] = null;
      continue;
    }
    if (!text || !numberAppearsInText(value, text)) {
      verified[key] = null;
      rejected.push(key);
      continue;
    }
    verified[key] = value;
  }

  return { verified, rejected };
}
