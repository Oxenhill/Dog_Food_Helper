export interface FoodNameIdentity {
  id: string;
  brand: string;
  name: string;
}

/**
 * Normalisation is for comparison only. The original owner-entered text is
 * never rewritten before storage.
 */
export function normalizeFoodName(value: string): string {
  return value
    .normalize('NFKD')
    .replace(/\p{Diacritic}/gu, '')
    .toLocaleLowerCase('en-GB')
    .replace(/&/g, ' and ')
    .replace(/\bdog\s+food\b/g, ' ')
    .replace(/[^\p{Letter}\p{Number}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function removePhrase(value: string, phrase: string): string {
  if (!phrase) return value;
  return ` ${value} `.replace(` ${phrase} `, ' ').trim().replace(/\s+/g, ' ');
}

/**
 * Matches an owner-entered marketing title to a catalogue identity.
 *
 * The brand must be present, then it is removed from the free text before the
 * product names are compared in both containment directions. This covers both
 * "catalogue has the short title" and "catalogue has the longer title"
 * without accepting a one-word product match from the wrong brand.
 */
export function foodMatchesFreetext(
  freetext: string,
  food: Pick<FoodNameIdentity, 'brand' | 'name'>
): boolean {
  const normalizedFreetext = normalizeFoodName(freetext);
  const normalizedBrand = normalizeFoodName(food.brand);
  const normalizedName = normalizeFoodName(food.name);

  if (!normalizedFreetext || !normalizedBrand || !normalizedName) return false;
  if (!` ${normalizedFreetext} `.includes(` ${normalizedBrand} `)) return false;

  const ownerProductName = removePhrase(normalizedFreetext, normalizedBrand);
  if (ownerProductName.length < 4 || normalizedName.length < 4) return false;

  return ownerProductName.includes(normalizedName) || normalizedName.includes(ownerProductName);
}

export function findFoodMatches<T extends FoodNameIdentity>(
  freetext: string,
  foods: readonly T[]
): T[] {
  return foods.filter((food) => foodMatchesFreetext(freetext, food));
}
