# Next session — Dog Food Helper

Paste everything below the line into a fresh Claude Code session in
`C:\dev\dog-smart-learning-centre\Dog_Food_Helper`.

**This is a build plan, not a status report.** Everything already shipped this session
(the PDF-worker fix, per-chunk species filtering on PDF uploads, auto-draft-on-import,
the awaiting-processing/already-tried UI fix, and the approved-evidence audit script) is
recorded in `BUILD_PROGRESS.md` — read it for context, but do not spend the session
re-confirming it. What follows is the one real design gap that audit surfaced and needs
fixing.

---

## The one thing to understand before you start

**`research_scoring_enabled` is still `false`.** Nothing below affects a live
recommendation today, and this session should not flip that switch — it's a separate,
bigger, owner-gated decision (see `BUILD_PROGRESS.md`'s Gate 5 entries). This work is
about the *quality of the data that's waiting behind the switch*, not about turning it on.

The owner approved a batch of research through the review queue (43 active claims / 39
active clusters as of 2026-08-03) and asked whether it "landed properly" and was
"actually useful and usable." A read-only audit (`scripts/researchApprovedEvidenceAudit.ts`
— already built, rerun it, don't rewrite it) found structural integrity is 100% clean, but
real-world usability is not: only 14 of 43 approved claims (33%) can currently attach to
any food in the 314-food catalog via `activeClaimRetrieval.ts`'s `matchClaimSubject()`.

Of the 29 that don't match:
- **27 are just catalog-coverage gaps** — real ingredients (`Bacillus velezensis C-3102`,
  poultry offal meal, collagen, various press cakes) that genuinely aren't in any
  catalogued food yet. Confirmed absent from `food_ingredients`, not a matching bug.
  **This is not something to build** — it resolves as the catalog grows. Don't touch it.
- **2 are a real, structural matching gap** — this is the actual task.

---

## PRIORITY 1 — Allergen-family terms don't match real ingredient strings

**The concrete failure.** A claim from "Canine atopic dermatitis: detailed guidelines for
diagnosis and allergen identification" has `subject_type: 'ingredient'`,
`subject_value: 'wheat'` (and a sibling claim for `'soy'`), both `cautions_against`. The
catalog has real wheat/soy-derived ingredients — confirmed via
`select distinct ingredient_name from food_ingredients where ingredient_name ilike '%wheat%' or ingredient_name ilike '%soy%'`
→ `Ground whole grain wheat`, `Whole grain wheat`, `Wheatfeed`, `soya oil`,
`hydrolysed soya protein isolate`, `Soybean meal`. None of these ever exact-match the bare
word "wheat" or "soy" after `canonicalIngredientKey()` normalization
(`src/lib/compositionParser.ts:196`), and there's no synonym-group entry bridging them
(`SYNONYM_GROUPS`, same file, ~line 96 — only true interchangeable-name pairs like
`['maize', 'corn']`, nothing allergen-family-shaped). `ingredient_class` matching
(`src/lib/ingredientCategories.ts`) doesn't help either — its categories are broad
nutritional roles (`protein_plant`, `carbohydrate`, `fat_oil`, etc.), not allergen
families. So common allergy-avoidance research — a genuinely important, common category —
lands approved and then sits orphaned.

**The precedent that solves this already exists elsewhere in this codebase, and it's
worth copying rather than reinventing.** `src/lib/hardFilter.ts:380` and `:400` match a
dog's restriction/contraindication substance against `food_ingredients.ingredient_name`
with a plain SQL `ILIKE '%substance%'` — a *substring* match, not an exact canonical-key
match. That's exactly why the safety-critical hard-filter layer already handles "wheat" →
"Ground whole grain wheat" correctly today (confirmed: `ILIKE '%wheat%'` matches all three
wheat variants above) while `activeClaimRetrieval.ts`'s exact-match research-evidence path
does not. **These two systems currently use two different matching strategies for what is
conceptually the same question ("does this food contain X").** That's worth understanding
fully before choosing a fix, not assuming one is simply a bug and the other correct.

**Do not touch `compositionParser.ts`'s shared `canonicalIngredientKey`/`SYNONYM_GROUPS`
casually.** Check first what else calls it (`grep -rn "canonicalIngredientKey\|SYNONYM_GROUPS" src/`)
before changing its behavior — it's used by `activeClaimRetrieval.ts`'s exact-ingredient
matching for every subject type, not just allergens, and a broadened match there could
change matching precision for claims that currently rely on exact identity being strict.
`hardFilter.ts` does **not** import it (confirmed — greps clean), so the safety layer is
unaffected by this either way; that's good to state plainly to the owner, since "does this
touch the allergy safety filter" is the first question they'll ask.

**Recommended shape (confirm or revise once you've read the above yourself):** build a
small, curated, additive layer specific to `activeClaimRetrieval.ts` — analogous to the
existing `NUTRIENT_MATCH_RULES` allowlist pattern (`src/lib/activeClaimRetrieval.ts:43`) —
mapping a handful of common allergen-family terms (start with `wheat`, `soy`; the owner
will likely want `dairy`/`milk`, `egg`, `chicken`, `beef`, `corn`, `lamb` too, since more
allergy papers will hit the same wall) to either (a) a curated list of known compound
ingredient-name substrings to match against, or (b) reusing `hardFilter.ts`'s proven
`ILIKE`-style substring approach scoped only to this allowlist, not applied to every
ingredient claim generally. Keep the blast radius narrow: this should change matching for
allergen-family-shaped claims only, not loosen exact-match behavior for everything else.

**Build:**
1. Read `matchClaimSubject()` in full (`src/lib/activeClaimRetrieval.ts:135-188`) and the
   `NUTRIENT_MATCH_RULES` pattern above it before writing anything.
2. Add the allergen-family allowlist and wire it into the `ingredient` branch of
   `matchClaimSubject` as a fallback when exact `canonicalIngredientKey` equality fails —
   or as its own path if that reads more clearly. Your call once you've seen the code.
3. Unit tests: cover at minimum the real wheat/soy case above, plus a case proving the
   fallback does NOT fire for an unrelated ingredient sharing a substring accidentally
   (learn from `hardFilter.ts`'s own false-positive risk — e.g. would "milk" wrongly match
   "milk thistle"? decide deliberately, don't let it happen unnoticed).
4. Re-run `npx tsx --env-file=.env scripts/researchApprovedEvidenceAudit.ts` — the two
   wheat/soy claims should move from the orphaned list into "matches at least one food
   today." That's the acceptance check; the script already exists, don't rewrite it.
5. Full quality gate: `npm test`, `NODE_OPTIONS="--max-old-space-size=8192" npx tsc -p tsconfig.json --noEmit`
   (needs the larger heap — a plain `tsc --noEmit` run OOMs on this repo, that's normal,
   not a sign you broke something).
6. Update `BUILD_PROGRESS.md` with what you built and the audit's before/after numbers.

**Acceptance:** the wheat and soy claims (and any other allergen-family terms you add)
resolve to `matches: true` against the real foods that contain them; `npm test` and `tsc`
stay clean; `hardFilter.ts` is untouched and its own tests (if any) still pass; the audit
script's "orphaned" list shrinks by exactly the allergen-family cases, not by loosening
matching for anything else.

---

## Facts you can rely on (measured 2026-08-03 — re-check anything you build on)

- **Supabase project: `ysffyuohwvdifvbopfcm`.** A sibling project `spsdfdlufqcduekqxxjk`
  exists in the same org — **different product, never write to it.** Always pass the
  project id explicitly if using Supabase tools.
- **`research_scoring_enabled` is `false`** on the single `recommendation_scoring_weights`
  row. Don't flip it as part of this work.
- **43 active research claims, 39 active clusters, 0 queued.** Structural integrity
  audited clean: no orphaned cluster memberships, no missing source documents/chunks, no
  quote drift.
- **314 foods in the catalog**, checked exhaustively against every active claim.
- **`research_chunks` has 1215 rows** — bigger than this project's PostgREST default
  row cap. Any ad hoc Supabase-JS `.select()` without `.range()`/pagination on a table
  that could exceed ~1000 rows will silently truncate and produce a false finding — the
  audit script already paginates correctly; copy that pattern
  (`fetchAllRows` helper near the top of `scripts/researchApprovedEvidenceAudit.ts`) for
  anything new you query in bulk.
- **Deployed:** https://dog-food-helper.vercel.app — `main` auto-deploys via Vercel's
  GitHub integration, live in under a minute.

## Constraints

- Never invent clinical mappings, ingredient synonyms, or allergen groupings not
  supportable by how real ingredient labels are actually written — if you're unsure
  whether "dairy" should catch "whey protein concentrate," check real catalog strings via
  Supabase before hardcoding an assumption, the same way this handoff checked wheat/soy.
- Keep the deterministic hard-filter/inference-layer separation (CLAUDE.md principle #1)
  intact — this task lives entirely in the inference/scoring side
  (`activeClaimRetrieval.ts`), never in `hardFilter.ts`.
- Don't bulk-seed more research to test this — the existing 43 claims are enough to
  validate against.
- Commit and push only with the owner's go-ahead, same as every prior session this week —
  ask, don't assume silence means yes, but don't over-ask either: a straightforward code
  fix with tests and a clean audit re-run is the kind of thing to just ship once done and
  report the result, not relitigate step by step.
