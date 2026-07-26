import { INGREDIENT_CATEGORIES } from './ingredientCategories';

/**
 * The prompt a contributor pastes into their own AI chat session.
 *
 * Single source of truth: rendered on /contribute behind a Copy button so the
 * owner distributes one link rather than a link plus a document that will drift
 * out of step with the validator.
 *
 * Written for a chat session, which shapes two things:
 *   - It cannot POST, so it ends by printing JSON for the human to paste back.
 *     Everything about the output format serves that copy step.
 *   - Its web access may be absent, blocked by a site, or defeated by a
 *     JS-rendered ingredient block. That is the dangerous case: an assistant
 *     that cannot read the label will often produce a plausible list from
 *     general knowledge instead of stopping. The prompt therefore makes
 *     "I could not read it" an explicit, expected, welcome outcome — and the
 *     server-side excerpt cross-check (src/lib/contributedFoods.ts) is what
 *     enforces it when the prompt is not enough.
 */
export function buildContributorPrompt(baseUrl: string): string {
  const knownUrl = `${baseUrl.replace(/\/$/, '')}/api/contribute/known`;
  const categoryLines = INGREDIENT_CATEGORIES.map(
    (c) => `  ${c.value}  —  ${c.hint}`
  ).join('\n');

  return `You are helping build the food database for Bowl, a tool that helps dog owners
choose food for dogs with allergies, intolerances and health conditions.

Your job: find UK dog food products that are NOT yet in the database, and record
each one accurately from its manufacturer page.

Accuracy matters far more than quantity. Ten carefully transcribed foods are
worth more than fifty guessed ones. Aim for about 10 in this session.

=== THE ONE RULE ===

Transcribe what the product page actually prints. Never infer, complete,
summarise, reorder or invent anything.

This data decides which foods are shown to a dog with a diagnosed allergy. If a
food's ingredient list is wrong, a dog gets fed something that harms it. A
missing food is a small loss. A wrong food is a real risk.

So:
- If you cannot load or read a page, SAY SO and skip that food. Do not
  reconstruct the ingredient list from what that recipe usually contains.
  "I could not read three of these" is a good, useful answer.
- If a figure is not printed, use null. Never a typical value for that kind
  of food.
- Keep the ingredient order exactly as printed. Order carries meaning: the
  first ingredient is the most prevalent.

=== STEP 1: see what is already there ===

Fetch this page first:

  ${knownUrl}

It lists every food already in the database, one per line. Do not submit any of
these — pick products that are not on the list. Good places to look for gaps:
smaller UK brands, raw and cold-pressed makers, vet/prescription ranges, and
own-brand ranges from UK pet retailers.

=== STEP 2: read each product page ===

For each new product, open its page on the MANUFACTURER's own site where
possible, and find:

- the ingredient list (often headed "Composition" or "Ingredients")
- the analysis panel (usually headed "Analytical Constituents", sometimes
  "Guaranteed Analysis" or "Typical Analysis")

If the page will not load, or the ingredient list is not in the text you can
see, skip the food and note it at the end. Do not guess.

If you cannot browse the web at all, say so — the person you are helping can
paste the page text in for you instead.

=== STEP 3: output ===

Print ONE json code block, and nothing else after it except your short notes on
anything you skipped. The person you are helping will copy that block, so it
must be complete, valid JSON and must not be split across several blocks.

\`\`\`json
{
  "foods": [
    {
      "brand": "Example Brand",
      "name": "Grain Free Salmon & Potato Adult",
      "food_type": "kibble",
      "source_url": "https://examplebrand.co.uk/products/grain-free-salmon",
      "source_excerpt": "Composition: Dried Salmon (26%), Potato, Peas, Salmon Oil (4%), Beet Pulp, Brewer's Yeast, Minerals, Vitamins",
      "is_treat": false,
      "ingredients": [
        { "name": "Dried Salmon", "inclusion_pct": 26, "category": "protein_animal" },
        { "name": "Potato", "category": "carbohydrate" },
        { "name": "Peas", "category": "carbohydrate" },
        { "name": "Salmon Oil", "inclusion_pct": 4, "category": "fat_oil" },
        { "name": "Beet Pulp", "category": "fibre_mixed" },
        { "name": "Brewer's Yeast", "category": "botanical_supplement" },
        { "name": "Minerals", "category": "vitamin_mineral" },
        { "name": "Vitamins", "category": "vitamin_mineral" }
      ],
      "protein_pct": 26,
      "fat_pct": 15,
      "fibre_pct": 2.5,
      "ash_pct": 8,
      "moisture_pct": 8,
      "calcium_pct": 1.4,
      "phosphorus_pct": 1.1,
      "sodium_pct": 0.3,
      "calories_per_kg": 3650,
      "price_per_kg": 5.99,
      "suitable_age_min_months": 12,
      "suitable_age_max_months": null,
      "suitable_size_min": null,
      "suitable_size_max": null
    }
  ]
}
\`\`\`

=== FIELD RULES ===

REQUIRED for every food — a food missing any of these is rejected:

  brand             The manufacturer, as they write it.
  name              The specific product/variety name.
  food_type         One of: kibble, wet, raw, cold_pressed, cooked, other.
  source_url        The exact page you read. This is the evidence; it gets
                    checked.
  ingredients       The list, in printed order, most prevalent first.
  source_excerpt    The ingredient text COPIED VERBATIM from the page,
                    including the "Composition:" heading if present.

About source_excerpt — this is the important one. It is checked automatically
against your ingredient list. If the names you list do not appear in it, the
food is rejected. Copy the real text; do not tidy it, translate it, shorten it
or rewrite it. If you cannot copy it, you cannot submit that food.

INGREDIENTS — each entry is either a plain string ("Potato") or an object:

  name              Required. Exactly as printed.
  inclusion_pct     The printed percentage only, e.g. 26 for "Salmon (26%)".
                    Omit if the label prints no percentage. Never estimate.
  note              A printed qualifier: "dried", "min 4%", "as a
                    preservative".
  category          Optional, from the list below. Omit if unsure — a wrong
                    category is worse than none.
  sub_ingredients   For a compound ingredient, its named parts. THIS MATTERS:
                    a beef-flavoured food may declare chicken only inside
                    "Meat and Animal Derivatives (Chicken 4%)". A dog allergic
                    to chicken must still be protected from that food, so
                    record the inner ingredient:

                      { "name": "Meat and Animal Derivatives",
                        "inclusion_pct": 20,
                        "sub_ingredients": [ { "name": "Chicken", "inclusion_pct": 4 } ] }

Categories:
${categoryLines}

OPTIONAL — use null, or leave the field out entirely, when not printed:

  protein_pct, fat_pct, fibre_pct, ash_pct, moisture_pct,
  calcium_pct, phosphorus_pct, sodium_pct
                    From the analysis panel. Numbers only: 24.5 for "24.5%".
                    "Crude protein" is protein_pct, "crude oils and fats" or
                    "fat content" is fat_pct, "crude ash" or "inorganic
                    matter" is ash_pct. Do not confuse ash with fibre.
                    These are used to check whether a food is safe for a dog
                    with kidney disease, pancreatitis or a similar diagnosis,
                    so an invented figure is worse than a missing one.
  calories_per_kg   Only if stated. If the page gives kcal per 100g, multiply
                    by 10 and use that. If it gives kcal per cup, skip it.
  price_per_kg      In GBP, from the manufacturer's own listed price and pack
                    size. Omit if the page has no price.
  suitable_age_min_months, suitable_age_max_months
                    Only if the page states an age range. "Adult" alone is
                    usually 12 and null. "Puppy" is usually 0 to 12. Do not
                    invent a maximum for a food that does not state one.
  suitable_size_min, suitable_size_max
                    One of: toy, small, medium, large, giant. Only if the page
                    states a size range, e.g. "for small breeds".
  is_treat          true for a treat, chew, dental stick, biscuit, topper or
                    supplement; false for a food meant as a complete diet.
                    A page saying "complementary pet food" is usually a treat;
                    "complete pet food" is a meal. Getting this wrong means a
                    dog could be recommended dental sticks as its whole diet,
                    so if the product is not clearly a complete meal, set true.

=== FINALLY ===

After the json block, list in plain English:
- any products you skipped and why (page would not load, no ingredient list
  printed, could not tell whether it was a complete food);
- anything you were unsure about.

Do not pad the list to reach a number. A short, honest batch is exactly what is
wanted.`;
}
