# Populating food ingredient lists

Hand this file to the session that will fill in the ingredient data.

## Why this matters

Right now **no food in the database has a real ingredient list**. 259 of 265 foods have
none at all; the other 6 carry 4-item seed stubs (e.g. "Beef, Beef Meal, Lamb, Peas")
that are placeholders, not labels.

Two things depend on this data and are currently inert:

1. **The allergy hard filter.** `src/lib/hardFilter.ts` excludes foods for a dog's
   allergies by matching `food_ingredients.ingredient_name`. With no ingredients
   recorded it matches nothing — a dog allergic to chicken is currently offered
   chicken foods.
2. **Carbohydrate and fibre questions.** A guaranteed-analysis panel cannot tell you
   *which* carbohydrate a food uses (rice vs potato vs maize vs peas), and it cannot
   tell you fibre **type** at all. "Crude fibre" on a label is mostly insoluble fibre;
   soluble/prebiotic fibres (inulin, FOS, chicory, psyllium, beet pulp) do not show up
   there. For gut-biome work the ingredient identity is the active variable — the
   ingredient list is the only place it exists.

## The rule

**Transcribe, never infer.** Copy the ingredient list exactly as printed on the
product page, in the printed order (most prevalent first — order is stored and carries
meaning). Do not summarise, group, truncate, reorder, or complete a partial list from
general knowledge of the recipe. If a page does not show an ingredient list, skip that
food and report it — an absent list is a fact worth knowing, a guessed one is a safety
problem.

## How to write the data

Everything goes through one admin-gated endpoint. No SQL needed.

### 1. Authenticate

```
POST /api/auth/signin      { "email": "...", "password": "..." }
```

Use the returned `session.access_token` as `Authorization: Bearer <token>` on every
call below. The account must have `user_profiles.is_admin = true`.

### 2. Get the worklist

```
GET /api/admin/food-ingredients/import?missing=1
```

Returns every food still needing ingredients, each with `food_id`, `brand`, `name`,
`source_url` (the page to read), and its current `ingredient_count`. Also returns the
valid `categories` list.

### 3. Write ingredients

```
POST /api/admin/food-ingredients/import
```

```json
{
  "items": [
    {
      "brand": "Acana",
      "name": "Regional Red",
      "ingredients": [
        { "name": "Beef", "category": "protein_animal" },
        { "name": "Whole red lentils", "category": "protein_plant" },
        { "name": "Chicory root", "category": "fibre_soluble" },
        "Mixed tocopherols"
      ]
    }
  ]
}
```

- Match a food by `food_id` (preferred, unambiguous) **or** by exact `brand` + `name`.
- An ingredient may be a plain string or an object with `name`, and optionally
  `category`, `inclusion_pct`, `note`, and `sub_ingredients`.
- `inclusion_pct` is the printed percentage (0–100). **Never estimate one** — omit
  it if the label doesn't state it.
- `sub_ingredients` nest under a compound ingredient, e.g.
  `"Animal Derivatives (Chicken 4%)"`. This is how hidden allergens get caught: a
  beef-flavoured food may only declare chicken inside a compound. Both the allergy
  filter and the correlation engine match names across **all** rows, so a nested
  ingredient is still found.
- Up to 100 items per request, 200 ingredients per food.

### Reading it back as one record

`public.food_full` is a view giving one row per food with all ingredients nested
inside (percentages, notes, sub-ingredients), plus an estimated digestible-carbohydrate
figure:

```sql
select * from public.food_full where brand = 'Acana';
```

### Behaviour you can rely on

| Situation | What happens |
|---|---|
| Food already has ingredients | Rows are **replaced**, not appended — safe to re-run |
| Empty `ingredients` array | Rejected; existing rows are **never** wiped |
| Unknown `category` value | Whole item rejected with the allowed list |
| `brand`+`name` matches 2+ foods | Rejected — pass `food_id` instead |
| No matching food | Reported per-item as `"No matching food found."` |
| Not an admin | `404` |

The response reports per item: `matched`, `ingredients_written`, and any `error`, so
you can retry only what failed.

## Categories

Structural classification only — this says nothing about whether an ingredient is good
or bad for any dog. Any actual exclusion still comes from an approved
`condition_contraindications` rule.

| Value | Use for |
|---|---|
| `protein_animal` | Meat, fish, egg, meat meal, organ |
| `protein_plant` | Pea protein, soya, potato protein, maize gluten |
| `carbohydrate` | Rice, potato, maize, wheat, oats, tapioca, sweet potato |
| `fibre_soluble` | Inulin, FOS/MOS, chicory, psyllium, pectin (fermentable, prebiotic) |
| `fibre_insoluble` | Cellulose, lignin, bran, pea fibre (bulking) |
| `fibre_mixed` | Beet pulp and similar where fractions aren't separated |
| `fat_oil` | Chicken fat, salmon oil, sunflower oil |
| `vitamin_mineral` | Added vitamins, chelated minerals, calcium carbonate |
| `botanical_supplement` | Herbs, glucosamine, probiotics, yeast, seaweed |
| `additive` | Preservatives, antioxidants, colourings, palatants |
| `other` | Genuinely ambiguous |

## Checking progress

```
GET /api/admin/food-ingredients/import?missing=1   → shrinking `total` as you go
GET /api/admin/overview                            → dashboard counts
```

## Note on the automated path

`src/lib/ingredientBackfill.ts` can do this extraction automatically via the Anthropic
Message Batches API (~£1.50 for all 265 foods). It is built and type-checks but has
**not** been run — it needs a direct `ANTHROPIC_API_KEY`, which is currently empty (the
AI Gateway key that is present has no batch endpoint). Populating by hand through the
endpoint above needs no API key and no spend.
