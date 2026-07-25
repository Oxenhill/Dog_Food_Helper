# Prompt for the ingredient-population session

Copy everything inside the fence below into your other Claude session (Haiku 4.5).
Fill in the two credential placeholders first.

---

````
You are populating the ingredient data for a dog food database. Work carefully and
methodically. Accuracy matters far more than speed.

## Why this matters

Two features are currently broken because no food has a real ingredient list:

1. Allergy safety. The app excludes foods for a dog's allergies by matching
   ingredient names. With no ingredients recorded, a dog allergic to chicken is
   still offered chicken foods. A beef-flavoured product may declare chicken only
   inside a compound ingredient such as "animal derivatives" — that hidden chicken
   must be captured or the dog gets fed it.
2. The correlation engine looks for links between individual ingredients and a
   dog's symptoms. It can only find a signal for an ingredient that is recorded.

## THE ONE RULE

Transcribe exactly what the product page prints. Never infer, complete, summarise,
reorder or invent. If you cannot find an ingredient list for a food, SKIP that food
and report it — a missing list is a fact worth knowing; a guessed list is a safety
problem. Do not use general knowledge of what a recipe "usually" contains.

## Credentials

BASE_URL = https://dog-food-helper.vercel.app
EMAIL    = <<<PUT THE ADMIN EMAIL HERE>>>
PASSWORD = <<<PUT THE ADMIN PASSWORD HERE>>>

## Step 1 — sign in (once)

POST {BASE_URL}/api/auth/signin
Content-Type: application/json
{"email": "EMAIL", "password": "PASSWORD"}

Take session.access_token from the response. Send it on every later request as:
  Authorization: Bearer <access_token>

If you get 404 on the admin endpoints below, the account is not an admin — stop and
report that.

## Step 2 — get the worklist

GET {BASE_URL}/api/admin/food-ingredients/import?missing=1
Authorization: Bearer <access_token>

You get back a list of foods, each with:
  food_id      <- the unique id. YOU MUST SEND THIS BACK UNCHANGED.
  brand, name  <- for your reference when reading the page
  source_url   <- the product page to read
  ingredient_count

Work through the list in order, in batches of 10 foods.

## Step 3 — for each food, read its page and transcribe

Open the food's source_url and find the ingredients / composition section.

Capture, for every ingredient in the list:
  - the name, exactly as printed
  - the percentage, if the label prints one (e.g. "Fresh Chicken (26%)" -> 26)
  - any qualifier as a note (e.g. "dried", "min 4%", "as a preservative")
  - sub-ingredients, when an ingredient contains a bracketed list of its own
    (e.g. "Animal Derivatives (Chicken 4%, Pork 4%)")

Keep the printed order. Order carries meaning — ingredients are listed most
prevalent first.

Optionally tag each ingredient with ONE category from this exact list (omit it if
you are not confident — do not guess):
  protein_animal, protein_plant, carbohydrate, fibre_soluble, fibre_insoluble,
  fibre_mixed, fat_oil, vitamin_mineral, botanical_supplement, additive, other

Fibre guidance: fibre_soluble = inulin, FOS/MOS, chicory, psyllium, pectin.
fibre_insoluble = cellulose, lignin, bran, pea fibre. fibre_mixed = beet pulp or
anything where the page does not separate the fractions.

## Step 4 — send it back

POST {BASE_URL}/api/admin/food-ingredients/import
Authorization: Bearer <access_token>
Content-Type: application/json

{
  "items": [
    {
      "food_id": "PASTE THE EXACT food_id FROM THE WORKLIST",
      "ingredients": [
        { "name": "Fresh Chicken", "inclusion_pct": 26, "category": "protein_animal" },
        { "name": "Dried Chicken", "inclusion_pct": 25, "category": "protein_animal" },
        { "name": "Sweet Potato", "inclusion_pct": 20, "category": "carbohydrate" },
        {
          "name": "Animal Derivatives",
          "inclusion_pct": 8,
          "category": "protein_animal",
          "sub_ingredients": [
            { "name": "Chicken", "inclusion_pct": 4, "category": "protein_animal" },
            { "name": "Pork", "inclusion_pct": 4, "category": "protein_animal" }
          ]
        },
        { "name": "Chicory Root", "inclusion_pct": 1, "category": "fibre_soluble" },
        { "name": "Mixed Tocopherols", "category": "additive", "note": "as a preservative" }
      ]
    }
  ]
}

Notes on the payload:
- Always identify the food by food_id. Do not rely on brand/name matching.
- An ingredient with no percentage: just omit inclusion_pct. Never estimate one.
- A plain string is allowed for a bare ingredient: "Peas" is valid shorthand.
- Up to 10 foods per request while you are working through batches.
- You do not need to know anything about the database structure. This one endpoint
  writes everything for you.

## Step 5 — check the response

The response reports per item: matched, ingredients_written, and any error.
  - "No matching food found."   -> the food_id was wrong; recheck the worklist
  - "Unknown category ..."      -> you used a category not on the list above
  - "Empty ingredient list ..." -> you sent nothing; skip the food instead
Re-send only the items that failed.

Re-sending the same food is safe: it replaces that food's ingredients rather than
duplicating them.

## Step 6 — repeat and report

Re-run the Step 2 worklist to see the remaining count drop. Continue until it
reaches zero or only skipped foods remain.

At the end, give me:
  - how many foods you populated
  - the list of foods you SKIPPED and why (no ingredient list on the page, page
    would not load, ambiguous content) with their brand, name and food_id

Do not fabricate an ingredient list for any food in that skipped list.
````

---

## Checking progress from your side

```
GET /api/admin/food-ingredients/import?missing=1     shrinking total
```

Or in Supabase SQL:

```sql
select count(*) filter (where ingredient_count >= 5) as populated,
       count(*) filter (where ingredient_count < 5)  as remaining
from public.food_full;
```

To read any single food as one complete record, ingredients nested:

```sql
select * from public.food_full where brand = 'Acana';
```
