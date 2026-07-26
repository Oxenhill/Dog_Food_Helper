# Handover prompt — Dog Food Helper, next session

Paste everything below the line into a fresh Claude Code session (Opus as orchestrator) in
`C:\dev\dog-smart-learning-centre\Dog_Food_Helper`. It is self-contained — it front-loads
what was measured and decided so you don't re-derive it at token cost.

**Written:** 2026-07-26, after commits `75df1f1` (features + full Gateway migration) and
`248f893` (deployment record). Both pushed and **live**.

---

## Your role

You are the orchestrator. Do the safety-critical, schema-touching and judgment-heavy work
yourself. You may delegate bounded, mechanical work to Sonnet subagents on **disjoint file
sets**, but **a subagent's success claim is not evidence** — re-run `tsc`/`build` yourself
and read the diffs.

Two cautions from the last session, both of which mattered:

1. **Verification caught two bugs that `tsc` and `build` were blind to.** A cache lookup
   with two ~270-value `IN()` lists silently returned `400 Bad Request`, and the fail-soft
   path reported it as "not yet scored" for every food — the cache would never have hit in
   production and *nothing would have looked broken*. **Exercise the real path against the
   real database; a green build proves nothing about behaviour.**
2. **Don't argue from documentation — go and measure.** The Gateway's batch support was
   settled by probing six endpoints, not by reading docs (which were ambiguous and
   contradicted by a third-party source).

## Read first, in this order

1. `CLAUDE.md` — non-negotiables: the deterministic safety layer (hard filter) is never
   blended with the inference layer; **stop and log rather than guess**.
2. `BUILD_PROGRESS.md` — top entries first.
3. `INGREDIENT_POPULATION_PROMPT.md` / `INGREDIENT_IMPORT.md` — how ingredient data is
   populated (by the owner's separate Claude session, not by you).
4. `git log --oneline -8` and `git status -sb`.

## Live state

- **Deployed:** https://dog-food-helper.vercel.app (main auto-deploys; ~30s last time).
- **Supabase `ysffyuohwvdifvbopfcm`** ("Dog_Food_Helper"). Sibling `spsdfdlufqcduekqxxjk`
  ("Dog-smart-learning-centre") is a **different product — never write to it.** Always pass
  the project id explicitly.
- **ALL AI goes through the Vercel AI Gateway.** There is **no `ANTHROPIC_API_KEY` in this
  platform and there never should be** — owner instruction, 2026-07-26. `batchApiHelper.ts`
  was deleted. Verified: `grep -rn "process.env.ANTHROPIC" src/` returns nothing.
- **The Gateway has no batch endpoint.** Probed live: `/v1/messages/batches`, `/v1/batches`,
  `/v1/files`, `/v1/openai/batches`, `/v1/anthropic/v1/messages/batches`, `/batches` — all
  404, with and without auth; `/v1/messages` returns 400 (reached). **Do not re-litigate
  this and do not reintroduce a direct Anthropic call to chase the batch discount.**

### Data facts (measured 2026-07-26 — re-check, population is ongoing)

- **272 foods.** Ingredient coverage was **31 populated / 2 stubs / 239 empty** and climbing
  fast (24 rows → 766 rows during one session). Re-check before building on it:
  ```sql
  select count(*) filter (where c >= 5) populated, count(*) filter (where c between 1 and 4) stub,
         count(*) filter (where c = 0) none
  from (select f.id, count(fi.id) c from public.foods f
        left join public.food_ingredients fi on fi.food_id = f.id group by f.id) t;
  ```
- `condition_contraindications` deliberately **empty** (vet-gated). `research_documents` /
  `research_chunks` deliberately **empty**.
- Baseline to restore after testing: **auth.users 4, user_profiles 4 (1 admin), dogs 4**, and
  `dog_recommendation_sets` / `research_score_cache` / `research_score_queue` all **0**.

---

## PRIORITY 1 — Bristol Type 4 image (owner-reported; diagnosed, NOT fixed)

**Fully root-caused. Do not re-investigate from scratch.**

**Symptom:** Bristol Type 4 doesn't display. Earlier none displayed; now all show except Type 4.

**Diagnosis (confirmed by direct inspection):**
- `bristol/4.png` **exists in Storage** — HTTP 200, 235,544 bytes. The upload succeeded.
- `manifest.json` is **missing the `"4"` key**. `GET /api/charts/illustrations` returns
  1, 2, 3, 5, 6, 7.

**Root cause:** `uploadChartIllustration()` in `src/lib/chartIllustrationStorage.ts` does a
**read-modify-write on a shared JSON blob**:

```ts
await upload(path, buffer);             // file written (this part worked)
const manifest = await readManifest();  // READ
manifest[chartType][value] = publicUrl; // MODIFY
await writeManifest(manifest);          // WRITE whole blob, upsert
```

Upload several images concurrently (or in quick succession) and two handlers read the same
manifest version, each add their own key, and **the last write wins — silently dropping the
other's entry.** That matches the reported sequence exactly: early uploads clobbered each
other ("none showed"), and the final clobber lost Type 4.

**Recommended fix — delete the manifest; derive the index by listing the bucket.** Paths are
already deterministic (`${chartType}/${value}${ext}`), so **the bucket contents ARE the
index**. Replace `readManifest()` with `supabaseAdmin.storage.from(BUCKET).list(chartType)`
and build the map from the filenames. This removes the second source of truth, makes the race
structurally impossible, and **self-heals the current state** — Type 4 reappears immediately
because the file is already there, with no re-upload needed.

If the owner wants it working *before* that refactor: re-uploading Type 4 on its own will
stick (nothing concurrent to race with). That's a workaround, not the fix.

**Also check:** `bcs` is `{}` — no body-condition images uploaded yet. Confirm with the owner
whether that's expected or whether those uploads were lost the same way. The `Stool Images/`
folder in the repo root (8 PNGs) is **untracked and deliberately uncommitted** — ask before
adding binaries to git.

---

## PRIORITY 2 — Photo-upload strategy (owner deciding; costing already done)

The owner asked whether owner-submitted photos are cheaper than AI scraping, and whether
front+back of packet are both needed. **The costing was done — don't redo it.** What they
were told:

- **Per-item AI cost is effectively identical.** Photo OCR ≈ **$0.005/image** (~$0.008 for
  front+back in one call); page scrape ≈ **$0.008/food** (backfill, 20k chars) or
  ~$0.0035/page (discovery, 6k chars — but many crawled pages aren't products, so cost per
  *food gained* is higher). Across all 272 foods the difference is **a pound or two, once.**
  **Cost is not the deciding factor.**
- **The real cost is human review, and it falls on the owner.** Owner photos **must** go
  through `ingredient_review_queue` and may never auto-merge (CLAUDE.md principle #4). Tier 1
  scrapes auto-merge after duplicate/field checks. That asymmetry, not tokens, is what makes
  photos expensive.
- **Photos win on truth and coverage:** the actual packet the dog eats (right variant,
  current recipe), and foods with no website at all (raw, butcher, local brands). Scrapes win
  on volume and zero human effort.

**Known gap if the photo path is chosen:** `OcrExtractionSchema` in `src/lib/ingredientOcr.ts`
extracts brand, product_name, ingredients, age_suitability, weight_range, price, notes — it
**does NOT extract the guaranteed analysis** (protein/fat/fibre/moisture/ash/phosphorus/
sodium/calcium). The scrape path does. **Photos therefore currently produce less complete
records than scraping.** Any photo-first strategy must extend that schema first, or the
composition pie and the nutrient hard filter get nothing from photo-sourced foods.

**Multi-image (front + back):** the owner is right — brand/variety are front-of-packet while
composition and analytical constituents are back-of-packet. `extractIngredientsFromImage()`
currently accepts **one** image. Send 2–3 images in **one** model call (front, back, and
optionally the feeding guide for `calories_per_kg`, which drives DER and nutritional scoring)
— one call is cheaper than several (shared prompt, single output) and lets the model
cross-reference front-of-pack claims ("Chicken 26%") against the back-of-pack list.

**If anonymous / no-account upload is chosen, handle these — flag them, don't silently ship:**
- An unauthenticated endpoint that spends money per request is a **financial-abuse vector**.
  Needs rate limiting, size caps and bot mitigation before it goes live.
- Photos can contain incidental personal data (faces, addresses on delivery boxes) → GDPR
  applies even without an account. EXIF stripping exists (`src/lib/imageExif.ts`) — verify it
  runs on this path.
- **Anonymous submissions produce no food↔dog outcome link**, which is the entire value of the
  correlation engine. Fine if the goal is purely to grow the catalogue; useless for learning
  what works. Confirm the owner intends that trade.

**Treats:** `DogFoodEvent` already supports `event_type: 'main_food' | 'treat'` with
`food_or_treat_id`. But `FoodType` is `'raw'|'kibble'|'cold_pressed'|'cooked'|'wet'|'other'`
— there is **no treat concept in the `foods` catalogue**. Adding treats needs a data-model
decision (a `food_type` value vs. a separate table vs. a boolean flag) — **owner decision,
don't assume.** Treats also matter to the correlation engine: an unlogged treat is a confound.

---

## PRIORITY 3 — Carried forward

- **`AI_GATEWAY_API_KEY` must be set in Vercel, or OIDC Federation enabled.** Every AI path
  returns a clear 503 without it. **Check this first if any AI feature looks broken in
  production.** `ANTHROPIC_API_KEY` can be deleted from the Vercel project — nothing reads it.
- **`/api/cron/research-scoring` is not in `vercel.json`.** Only schedule it once a real
  research corpus exists (no-op while empty). `?dry=1` reports queue depth **free**;
  `?limit=N` caps spend.
- **Food discovery is now synchronous**, one cron invocation (50 pages max, 4 concurrent).
  **Never run live** — the domain allowlist is empty. Watch the first real run for
  function-timeout headroom.
- **The research-score worker has run exactly once** (one owner-approved call). Not yet
  exercised at volume.
- **ESLint and autoprefixer are entirely uninstalled** (`eslint`, `eslint-config-next`,
  `autoprefixer`, `postcss` all absent from package.json). Deliberately not bundled into a
  feature deploy. Separate change: `npm install -D eslint eslint-config-next autoprefixer
  postcss`, add `.eslintrc.json` = `{"extends":"next/core-web-vitals"}`, re-add autoprefixer
  to `postcss.config.js`, then diff the CSS output.
- Unchanged: single-dog "Remove = anonymise vs hard-erase" GDPR confirmation · `/docs/*` still
  missing from the checkout · Supabase Auth "leaked password protection" off ·
  `wellness_indicator_reference` research backing · legal/GDPR review · vet-approved
  `condition_contraindications` rules · Haiku/OCR path **still never exercised with a real
  photo**.

## What was completed last session (don't rebuild)

- **Owner-facing food detail.** `src/lib/foodFull.ts` over the `public.food_full` view;
  `GET /api/foods/[foodId]`; `/foods/[foodId]` page; `IngredientList.tsx`. Ordered list is the
  primary content, sub-ingredients nest, percentages shown only where the label printed one,
  empty state never fabricates.
- **`CompositionPie.tsx`** — dependency-free SVG, six guaranteed-analysis fractions, validated
  palette, keyed table labelling every segment, luminance-picked label colour, renders nothing
  when the panel is incomplete.
- **Persisted recommendations.** `dog_recommendation_sets`; `GET /api/recommendations?dog_id=`;
  Regenerate action; `owner_id` nulled alongside the dog on removal/account deletion.
- **Research scoring off the request path.** `researchScoring.ts` (shared prompt/schema, calls
  no model) · `researchScoreCache.ts` (read + queue) · `researchScoreWorker.ts` +
  `/api/cron/research-scoring`. Key = `context_hash` (dog profile + chunk ids) **plus a
  separate `food_fingerprint` column**. **Do NOT fold the fingerprint into `context_hash`** —
  that was tried, and it gives every food a distinct hash, forcing two ~270-value `IN()` lists
  that overrun PostgREST's URL limit.
- **Full Gateway migration.** `foodDiscovery.ts` and `ingredientBackfill.ts` converted and
  collapsed from two-phase batch jobs to single synchronous runs; `batchApiHelper.ts` and
  `/api/cron/food-discovery/process` deleted.

## How to work here

**Design system.** Read `src/app/globals.css` (`.app-shell`, `.container-page`, `.card`,
`.btn-*`, `.field/.label/.input`, `.eyebrow/.page-title/.section-title/.metric`, `.badge-*`,
`.signal-*`, `.callout-info/.callout-disclaimer/.callout-alarm`) and `tailwind.config.ts`
(`pine`, `paper`, `surface`, `ink`; `font-display` Bricolage Grotesque, `font-sans`/`font-mono`
IBM Plex). **Every metric — scores, dates, £, counts, %, ages — renders in `font-mono` via
`.metric`.** Keep the red-flag register deliberately loud. Exemplars: `src/app/page.tsx`,
`src/components/CompositionPie.tsx`.

**Charts:** load the `dataviz` skill. The composition palette is **already validated** —
`#2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4, #008300`, fixed slot order, with a
non-dismissable contrast WARN that **obligates visible labels**. Don't re-derive it. Never pie
the ingredient list.

**Auth:** `requireAdmin` (admin routes return **404, never 403**) / `requireUser` from
`@/lib/serverAuth`; clients attach `sessionAuthHeaders()` from `@/lib/session`.

**Live-testing recipe (no AI cost):** `npm run build` → `npx next start -p 31xx` (pick a free
port) → throwaway account via `POST /api/auth/signup` → promote with
`update public.user_profiles set is_admin = true where id = '...'` → exercise with `curl` →
**delete the test user and restore every row you touched**, verified with a count query. Every
session so far has left the database exactly as found — keep that discipline. Another session
may be writing `food_ingredients` concurrently; **never bulk-delete from it.**

The in-app browser's `form_input` doesn't reliably trigger React controlled inputs — drive
forms with real keystrokes or call the API directly. If `tsc` reports missing modules for a
route you deleted, `rm -rf .next` (stale generated types).

## Constraints

- **Owner-gated:** anything spending real API credits (ask first, with a cost estimate);
  destructive or security-broadening Supabase actions. Pushing to main was permitted last
  session for completed, verified work — confirm if unsure. Haiku 4.5 is $1/MTok in,
  $5/MTok out.
- Never invent clinical mappings, nutrient values, ingredients, credentials, or citations.
- Don't bulk-seed research. Don't reintroduce synchronous per-food model calls into a request.
- Preserve the deterministic-vs-inference safety separation.
