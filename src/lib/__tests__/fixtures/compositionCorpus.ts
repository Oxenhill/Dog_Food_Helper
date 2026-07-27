/**
 * Fixture corpus for parse_composition. Three buckets, deliberately not
 * merged, because they test different things:
 *
 * - HAND_AUTHORED: one fixture per pattern named in the Phase 2 spec, with
 *   an exact expected structure. These exist regardless of whether OPFF
 *   happens to contain an example — OPFF skews global/cat-food and under-
 *   represents UK-specific labelling (EC legal categories, "of which"
 *   nesting, Composition:/Analytical Constituents: headings).
 * - REAL_WORLD_CLEAN: real ingredients_text strings, curated from the OPFF
 *   barcode-seed fixture (fixtures/opff_barcode_seed.json) down to the ones
 *   that are actually UK/EU-labelled and not OCR-mangled. This is the
 *   "clears ~80% unaided" claim's evidence — representative of what a
 *   retailer/manufacturer page should give the crawler.
 * - KNOWN_HARD: real strings that are genuinely broken (OCR garbage, mixed
 *   languages, multi-variant labels concatenated) or exercise a documented
 *   parser limitation (nested unlabelled parenthetical groups). Kept as a
 *   robustness check — must not throw — not a correctness or coverage claim.
 *   The crawler's own reduce-and-extract step should produce cleaner input
 *   than this in production; this bucket exists so a regression here is
 *   visible without inflating the coverage number with un-fixable OCR noise.
 */

export interface HandAuthoredCase {
  description: string;
  raw: string;
}

export const HAND_AUTHORED: HandAuthoredCase[] = [
  { description: 'percentage after name, no parens', raw: 'Chicken 26%, Rice 20%, Minerals' },
  { description: 'percentage before name', raw: '26% Chicken, 20% Rice, Minerals' },
  { description: 'percentage in parens', raw: 'Chicken (26%), Rice (20%), Minerals' },
  {
    description: 'nested "of which" percentage inside parens',
    raw: 'Meat and animal derivatives (26%, of which fresh chicken 14%), Rice (20%), Minerals',
  },
  {
    description: 'leading percentage on parent with a bracketed sub-list',
    raw: '70% Meat and animal derivatives (4% turkey, 4% game), vegetables (4% carrots), minerals',
  },
  { description: 'legal category term alone, no percentage', raw: 'Cereals, Minerals, Oils and fats' },
  { description: 'legal category term with percentage', raw: 'Meat and Animal Derivatives (4%), Rice' },
  { description: 'derivatives of vegetable origin', raw: 'Derivatives of vegetable origin, Cereals' },
  { description: 'various sugars', raw: 'Various sugars, Cereals, Minerals' },
  { description: 'EC permitted additives', raw: 'Cereals, EC permitted additives, Minerals' },
  {
    description: 'additives block separated from headline ingredients',
    raw: 'Chicken 80%, Rice 20%. Additives: Vitamin A 5000 IU, Vitamin D3 500 IU',
  },
  {
    description: 'nutritional additives per kg heading',
    raw: 'Chicken 80%, Rice 20%. Nutritional additives per kg: Vitamin E 40mg, Copper 12mg',
  },
  {
    description: 'analytical constituents block is dropped entirely, not parsed as an ingredient',
    raw: 'Chicken 80%, Rice 20%. Analytical Constituents: Protein 25%, Fat 12%, Fibre 3%',
  },
  {
    description: 'guaranteed analysis (US-style heading) is dropped the same way',
    raw: 'Chicken, Rice, Peas. Guaranteed Analysis: Crude Protein (min) 26%, Crude Fat (min) 15%',
  },
  {
    description: 'qualifier in parens with no percentage becomes a note, not a percentage',
    raw: 'Chicken Fat (preserved with Mixed Tocopherols), Rice',
  },
  {
    description: '"min X%" qualifier is never promoted to inclusion_pct',
    raw: 'Cereals (min 4% rice), Meat and animal derivatives (min 4% chicken), Minerals',
  },
  {
    description: 'European decimal comma in a percentage (parenthesised — see compositionParser.ts note on bare decimal commas)',
    raw: 'Yeast (0,2%), Chicory powder (0,15%), Minerals',
  },
  { description: 'maize/corn synonym pair', raw: 'Maize, Corn, Minerals' },
  { description: 'dried egg / egg powder synonym pair', raw: 'Dried egg, Egg powder, Minerals' },
  {
    description: 'poultry meal / dehydrated poultry protein synonym pair',
    raw: 'Poultry meal, Dehydrated poultry protein, Minerals',
  },
  { description: 'Composition: label prefix is stripped', raw: 'Composition: Chicken 60%, Rice 40%' },
  { description: 'Ingredients: label prefix is stripped', raw: 'Ingredients: Chicken 60%, Rice 40%' },
  {
    description: 'legal category plus a named sub-ingredient at declared inclusion, both real UK patterns together',
    raw: 'Meat and animal derivatives (26%, of which fresh chicken 14%), Cereals, Derivatives of vegetable origin, Various sugars, EC permitted additives',
  },
];

export const REAL_WORLD_CLEAN: string[] = [
  'Cereals, Chicken 15%, Beef 4%, Meat and animal derivatives, Oils and fats, Various sugars, Minerals',
  'fresh chicken meat 16%, chicken meal 13%, turkey meal 13%, red lentils, whole green peas, fresh chicken giblets (liver, heart, kidney) 6%',
  'Cereals, Derivatives of vegetable origin, Minerals, Meat and animal derivatives, Oils and fats',
  'Cereals, Vegetable protein extracts, Glycerol, Various sugars, Meat and animal derivatives (4%), Oils and fats, Minerals, Vegetables, Milk and milk derivatives',
  'Salmon Meal (32%), Potato, Sweet Potato, Pea Starch, Salmon Oil (9%), Salmon (4%), White Fish, Mackerel, Salmon Digest, Brewers Yeast, Plant Fibre, Glucosamine Sulphate (0.05%), Chondroitin Sulphate (0.03%).',
  '93 % Chicken Breast Fillet, Derivatives of vegetable origin.',
  '50% Meat and animal derivatives (4% turkey, 4% game), vegetables (4% carrots & peas), minerals.',
  '26% turkey and meat meals (6.5% dried turkey), rice, maize, barley, peas (4%), poultry fat, poultry gravy, beet pulp, linseed, minerals, seaweed (0.1%), fos (0.1%), yucca extract (0.01%).',
  'Whole rice (40%), duck meat meal (20%), naked oats, peas, whole linseed, sunflower oil, beet pulp, vitamins, minerals and trace elements',
  'Chicken fillets (65%), Chicken broth (34%), vitamins & minerals (1%)',
  'Duck (75%), Potato Flakes (4%), Carrots (2%), Peas (2%), Minerals, Dried Seaweed, Chondroitin (50mg/kg), Yucca Extract (0.005%)',
  '100% chicken.',
  'Lamb – 73.5%, Berries – 0.5%, Sunflower oil and Mineral Substances.',
  'Chicken breast, cheese, glycerin, sweet potato, sorbitol',
  '62% chicken (chicken meat, chicken liver, chicken stomach, chicken broth), 35% veal (veal lungs, veal hearts, veal broth), 3% minerals',
];

export const KNOWN_HARD: string[] = [
  // Two back-to-back unlabelled parenthetical groups — the second isn't a
  // clean "own pct + subs" shape, so this is expected to fall back to a
  // note rather than exploding into declared sub-ingredients.
  'Dried Herbs (Parsley, Rosemary, Nettle, Camomile) (0.12%, Chicory Root Extract (0.05%), Glucosamine 50mg/kg), Chondroitin (50mg/kg)',
  // Heavily OCR-mangled real capture (missing letters, run-together words).
  'meat and animal derivatives (14% ch cereals, derivatives of vegetable origi minerals, oils and fats (0.1% omega 3 pow additives technological additives: preservatives. sensory additives: colourants nutritional additives per kg: vitamin a 5000 iu, vitamin d3 500 iu, vitamin e 40mg, copper (as copper (ii) sulphate pentahydrate) 12mg. analytical constituents moisture 22.5% crude protein 31.0% crude fat 6.0% crude fibre 2.0% crude ash 6.0% storage',
  // Multiple product variants concatenated into one string (Whiskas-style
  // multi-flavour listing) with footnote asterisks mid-sentence.
  'Meat and animal derivatives (30%, including 4% chicken in the chunk*), fish and fish derivatives (including 4% cod in the chunk*), cereals, minerals, derivatives of vegetable origin, various sugars. with salmon and turkey. Composition: meat and animal derivatives (30%, including 4% turkey in the chunk*), fish and fish derivatives (including 4% salmon in the chunk), cereals, minerals.',
];
