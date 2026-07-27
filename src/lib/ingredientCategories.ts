/**
 * Ingredient category vocabulary for `food_ingredients.ingredient_category`.
 *
 * The column already existed but had no defined vocabulary and is null
 * everywhere. Categories matter for the owner's actual use case: a gut-biome or
 * metabolic protocol needs to know WHICH carbohydrates and — critically — WHICH
 * FIBRE TYPES a food contains, because a guaranteed-analysis panel cannot show
 * either. "Crude fibre" understates total dietary fibre and says nothing about
 * whether a fibre is soluble/prebiotic (inulin, FOS, psyllium, beet pulp) or
 * insoluble (cellulose, lignin) — only the ingredient list can distinguish them.
 *
 * This is a STRUCTURAL classification of ingredients, not clinical guidance. It
 * asserts nothing about whether an ingredient is good or bad for any dog. Any
 * actual exclusion still has to come from an approved condition_contraindications
 * rule (see src/lib/hardFilter.ts).
 *
 * Categories are advisory: `ingredient_category` stays nullable, and an import
 * that omits it is valid. Unrecognised values are rejected rather than silently
 * stored, so the vocabulary can't drift.
 */

export const INGREDIENT_CATEGORIES = [
  {
    value: 'protein_animal',
    label: 'Animal protein',
    hint: 'Meat, fish, egg, meat meal, organ.',
  },
  {
    value: 'protein_plant',
    label: 'Plant protein',
    hint: 'Pea protein, soya, potato protein, maize gluten.',
  },
  {
    value: 'carbohydrate',
    label: 'Carbohydrate / starch',
    hint: 'Rice, potato, maize, wheat, oats, tapioca, sweet potato.',
  },
  {
    value: 'fibre_soluble',
    label: 'Fibre — soluble / prebiotic',
    hint: 'Inulin, FOS/MOS, chicory, psyllium, pectin. Fermentable; feeds gut flora.',
  },
  {
    value: 'fibre_insoluble',
    label: 'Fibre — insoluble',
    hint: 'Cellulose, lignin, bran, pea fibre. Bulking; largely non-fermentable.',
  },
  {
    value: 'fibre_mixed',
    label: 'Fibre — mixed / unspecified',
    hint: 'Beet pulp and similar where the page does not separate the fractions.',
  },
  { value: 'fat_oil', label: 'Fat / oil', hint: 'Chicken fat, salmon oil, sunflower oil.' },
  {
    value: 'vitamin_mineral',
    label: 'Vitamin / mineral',
    hint: 'Added vitamins, chelated minerals, calcium carbonate.',
  },
  {
    value: 'botanical_supplement',
    label: 'Botanical / supplement',
    hint: 'Herbs, glucosamine, probiotics, yeast, seaweed.',
  },
  {
    value: 'additive',
    label: 'Additive',
    hint: 'Preservatives, antioxidants, colourings, palatants.',
  },
  {
    value: 'legal_category',
    label: 'Generic legal category (source unspecified)',
    hint:
      'A legally-permitted category declaration ("Animal fats", "Minerals", "Cereals" — see compositionParser.LEGAL_CATEGORY_TERMS) rather than a named ingredient. The actual source is not identified by the label — never treat this as ruling out a specific allergen.',
  },
  { value: 'other', label: 'Other / unclear', hint: 'Use when the page is genuinely ambiguous.' },
] as const;

export type IngredientCategory = (typeof INGREDIENT_CATEGORIES)[number]['value'];

export const INGREDIENT_CATEGORY_VALUES: string[] = INGREDIENT_CATEGORIES.map((c) => c.value);

export function isIngredientCategory(value: unknown): value is IngredientCategory {
  return typeof value === 'string' && INGREDIENT_CATEGORY_VALUES.includes(value);
}

export function categoryLabel(value: string | null | undefined): string {
  if (!value) return '—';
  return INGREDIENT_CATEGORIES.find((c) => c.value === value)?.label ?? value;
}
