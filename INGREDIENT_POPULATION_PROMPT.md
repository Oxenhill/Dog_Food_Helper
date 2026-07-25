# Prompt for the ingredient-population session

For a session that has the **Supabase connector** to this project. No login details
needed. Copy everything inside the fence into your other Claude session (Haiku 4.5).

---

````
You are populating the ingredient data for a dog food database, using the Supabase
connector. Work carefully and methodically. Accuracy matters far more than speed.

## Project

Supabase project id: ysffyuohwvdifvbopfcm   (name: "Dog_Food_Helper")

There is another project in the same account called "Dog-smart-learning-centre"
(spsdfdlufqcduekqxxjk). It is a DIFFERENT product. Never read from or write to it.
Pass the project id above on every single call.

## Why this matters

Two features are broken right now because no food has a real ingredient list:

1. Allergy safety. The app excludes foods for a dog's allergies by matching
   ingredient names. With nothing recorded, a dog allergic to chicken is still
   offered chicken foods. A beef-flavoured product may declare chicken only inside
   a compound ingredient such as "Animal Derivatives (Chicken 4%)" — that hidden
   chicken must be captured as its own row or the dog gets fed it.
2. The correlation engine looks for links between individual ingredients and a
   dog's symptoms. It can only find a signal for an ingredient that is recorded.

## THE ONE RULE

Transcribe exactly what the product page prints. Never infer, complete, summarise,
reorder or invent. If you cannot find an ingredient list for a food, SKIP it and
report it — a missing list is a fact worth knowing; a guessed list is a safety
problem. Never use general knowledge of what a recipe "usually" contains.

## What you may write

ONLY the table public.food_ingredients, and only INSERT and DELETE as shown below.
Do not modify public.foods, users, dogs, or any other table. Do not run any DDL
(no ALTER, no CREATE, no DROP).

## The two tables

- public.foods            one row per product. You only READ this, for the id and
                          the source_url.
- public.food_ingredients one row PER INGREDIENT, linked to a food by food_id.
                          A food with 40 ingredients has 40 rows. This is where
                          you write.

Columns you will fill in food_ingredients:

  food_id               required. Copy exactly from the worklist. This is the link.
  ingredient_name       required. Exactly as printed.
  position_in_list      required. 1, 2, 3 … in printed order (order carries
                        meaning: most prevalent first).
  ingredient_category   optional. One value from the list further down, or NULL.
  inclusion_pct         optional. The printed percentage, e.g. 26. NULL if the
                        label does not print one. NEVER estimate it.
  note                  optional. A qualifier: 'dried', 'min 4%',
                        'as a preservative'. NULL if none.
  parent_ingredient_id  NULL for a normal ingredient. For a sub-ingredient of a
                        compound ingredient, the id of its parent row.

## Step 1 — get the worklist

Run this query:

  select id as food_id, brand, name, source_url
  from public.food_full
  where ingredient_count < 5
  order by brand, name
  limit 10;

(The existing rows with 1-4 ingredients are placeholder stubs, not real lists —
that is why the cut-off is 5. They get replaced.)

Work in batches of 10. Re-run this query to get the next batch.

## Step 2 — for each food, read its page

Open the food's source_url and find the ingredients / composition section.

Capture every ingredient, in printed order:
  - name exactly as printed
  - the percentage if the label prints one
  - any qualifier, as a note
  - sub-ingredients when an ingredient contains its own bracketed list,
    e.g. "Animal Derivatives (Chicken 4%, Pork 4%)"

Categories (optional — use NULL if you are not confident, do not guess):
  protein_animal, protein_plant, carbohydrate, fibre_soluble, fibre_insoluble,
  fibre_mixed, fat_oil, vitamin_mineral, botanical_supplement, additive, other

Fibre guidance: fibre_soluble = inulin, FOS/MOS, chicory, psyllium, pectin.
fibre_insoluble = cellulose, lignin, bran, pea fibre. fibre_mixed = beet pulp, or
anything where the page does not separate the fractions.

## Step 3 — write it

For each food, run these statements. Replace FOOD_ID with the exact id from the
worklist. Escape any apostrophe in a name by doubling it ('Hunter''s Blend').

First clear the placeholder rows for that food, then insert the real list:

  delete from public.food_ingredients where food_id = 'FOOD_ID';

  insert into public.food_ingredients
    (food_id, ingredient_name, ingredient_category, inclusion_pct, note, position_in_list)
  values
    ('FOOD_ID', 'Fresh Beef',         'protein_animal', 26,   null,               1),
    ('FOOD_ID', 'Dried Beef',         'protein_animal', 25,   null,               2),
    ('FOOD_ID', 'Sweet Potato',       'carbohydrate',   20,   null,               3),
    ('FOOD_ID', 'Animal Derivatives', 'protein_animal', 8,    null,               4),
    ('FOOD_ID', 'Chicory Root',       'fibre_soluble',  1,    null,               5),
    ('FOOD_ID', 'Peas',               null,             null, null,               6),
    ('FOOD_ID', 'Mixed Tocopherols',  'additive',       null, 'as a preservative',7);

Then, ONLY if a food has compound ingredients, add each sub-ingredient and point it
at its parent. Run one statement per sub-ingredient — the subquery finds the parent
row you just inserted:

  insert into public.food_ingredients
    (food_id, ingredient_name, ingredient_category, inclusion_pct, note,
     position_in_list, parent_ingredient_id)
  select 'FOOD_ID', 'Chicken', 'protein_animal', 4, null, 1,
         (select id from public.food_ingredients
          where food_id = 'FOOD_ID'
            and ingredient_name = 'Animal Derivatives'
            and parent_ingredient_id is null);

Repeat that for each sub-ingredient, incrementing its position_in_list (1, 2, 3…
within that parent).

Do NOT insert sub-ingredients in the same statement as the parents — the parent row
must exist first so the subquery can find its id.

## Step 4 — verify each food before moving on

  select brand, name, ingredient_count, jsonb_pretty(ingredients)
  from public.food_full where id = 'FOOD_ID';

Check the list matches the page: right count, right order, percentages where the
label had them, and any sub-ingredients nested under the correct parent.

If it is wrong, just re-run Step 3 for that food — the delete makes it safe to
repeat.

## Step 5 — repeat, then report

Re-run the Step 1 worklist for the next batch. Continue until it returns nothing.

Progress at any time:

  select count(*) filter (where ingredient_count >= 5) as populated,
         count(*) filter (where ingredient_count < 5)  as remaining
  from public.food_full;

At the end, tell me:
  - how many foods you populated
  - every food you SKIPPED and why (no ingredient list on the page, page would not
    load, ambiguous content), with brand, name and food_id

Do not fabricate a list for anything in that skipped list.
````

---

## Checking progress yourself

```sql
select count(*) filter (where ingredient_count >= 5) as populated,
       count(*) filter (where ingredient_count < 5)  as remaining
from public.food_full;
```

Read any food as one complete record, ingredients nested:

```sql
select * from public.food_full where brand = 'Acana';
```

Find a hidden allergen across the whole database — including ones declared only
inside a compound ingredient:

```sql
select f.brand, f.name, fi.ingredient_name,
       case when fi.parent_ingredient_id is null then 'top-level'
            else 'hidden inside a compound' end as where_found
from public.food_ingredients fi
join public.foods f on f.id = fi.food_id
where fi.ingredient_name ilike '%chicken%';
```

## If that session does not have the connector

There is also an HTTP import endpoint that writes both tables for you and needs no
SQL — see `INGREDIENT_IMPORT.md`.
