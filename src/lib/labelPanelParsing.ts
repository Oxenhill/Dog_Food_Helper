/**
 * Deterministic text fixes applied to the model's transcription, using the
 * verbatim composition_panel_text as ground truth — same philosophy as
 * labelVerification.ts (don't trust the model's word alone when the source
 * text is right there to check against).
 */

/**
 * Resolves a trailing asterisk footnote marker ("carrots*") against its
 * legend elsewhere in the panel text ("(*dried)") and folds it into the
 * ingredient name ("carrots (dried)"). Owner finding, 2026-07-28 (Platinum
 * Click-Bits): composition_raw carried the legend but the ingredient names
 * kept the bare marker, which is meaningless once separated from its
 * definition.
 *
 * A marker with no findable legend is left as printed — never dropped — and
 * reported in `needsReview` so a human can resolve it.
 */
export function resolveIngredientFootnotes(
  ingredients: string[],
  panelText: string | null
): { resolved: string[]; needsReview: string[] } {
  const needsReview: string[] = [];
  if (!panelText) {
    // No panel text to resolve against — leave markers as printed rather
    // than guessing, and flag every one for review.
    for (const name of ingredients) {
      if (/\*\s*$/.test(name.trim())) needsReview.push(name);
    }
    return { resolved: ingredients, needsReview };
  }

  // Common legend shapes: "(*dried)", "* dried", "*Dried." at the end of the
  // composition sentence, keyed to a single asterisk — this codebase's
  // capture pipeline only ever sees one marker level in practice so far.
  const legendMatch = panelText.match(/\(\s*\*\s*([^)]{2,80})\)/) ?? panelText.match(/\*\s*([A-Za-z][^.\n]{1,80})[.\n]/);
  const legend = legendMatch ? legendMatch[1].trim().replace(/\.$/, '') : null;

  const resolved = ingredients.map((name) => {
    const trimmed = name.trim();
    if (!/\*\s*$/.test(trimmed)) return name;
    if (!legend) {
      needsReview.push(name);
      return name;
    }
    const base = trimmed.replace(/\*\s*$/, '').trim();
    return `${base} (${legend})`;
  });

  return { resolved, needsReview };
}

/**
 * Pulls a feeding-guide sentence ("Daily feeding amount: 30-40 Click-Bits
 * per 10 kg bodyweight per day") out of the verbatim panel text, verbatim.
 * Informational only — see foods.dietetic_feeding_duration's column
 * comment; this must never be used as a filter or a gate.
 */
export function extractFeedingGuidance(panelText: string | null): string | null {
  if (!panelText) return null;
  const match = panelText.match(
    /((?:daily feeding (?:amount|guide)|feeding (?:guide|instructions?|recommendation))[^.\n]*\.)/i
  );
  return match ? match[1].trim() : null;
}
