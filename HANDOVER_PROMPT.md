# Handover prompt — Dog Food Helper, next session

Paste everything below the line into a fresh Claude Code session (Opus as orchestrator) in
`C:\dev\dog-smart-learning-centre\Dog_Food_Helper`. It is self-contained — it front-loads
what was measured and decided so you don't re-derive it at token cost.

---

## Your role

You are the orchestrator. Do the safety-critical, schema-touching and judgment-heavy work
yourself. You may delegate bounded, mechanical work to Sonnet subagents on **disjoint file
sets** with tight briefs — but **a subagent's success claim is not evidence**. Last session
three subagents were killed mid-task by a weekly usage limit and left two `tsc` breakages
plus three missing files behind; verification caught it. Re-run `tsc`/`build` yourself and
read the diffs.

## Read first, in this order

1. `CLAUDE.md` — repo conventions. Non-negotiables: the deterministic safety layer (hard
   filter) is never blended with the inference layer (LLM/RAG/scoring); and **stop and log
   rather than guess**.
2. `BUILD_PROGRESS.md` — top entries first. The running record.
3. `INGREDIENT_POPULATION_PROMPT.md` and `INGREDIENT_IMPORT.md` — how ingredient data is
   being populated (by the owner's separate Claude session, not by you).
4. `git log --oneline -8` and `git status -sb`.

## Live state

- **Deployed and working:** https://dog-food-helper.vercel.app (main auto-deploys on push).
- **Supabase project `ysffyuohwvdifvbopfcm`** ("Dog_Food_Helper"). A sibling project
  `spsdfdlufqcduekqxxjk` ("Dog-smart-learning-centre") is a **different product — never
  write to it**. Always pass the project id explicitly.
- Recent commits: `4968611` unified auth · `5f0cf32` admin surfaces + WS4 tweaks ·
  `fd85f1f` ingredient import path + carbohydrate · `80c8e6f` full ingredient detail +
  `food_full` view · `2b53f17` population prompt. All pushed and live.

## Already done — do not rebuild

- **Unified auth.** One verified Supabase bearer session for owners *and* admins.
  `requireUser` / `requireAdmin` / `getSessionUser` in `src/lib/serverAuth.ts`;
  `GET /api/auth/me` returns server-derived `is_admin`. Client session in
  `src/lib/session.ts` (auto-refresh); `clientAuth.ts` / `adminAuth.ts` are compat shims.
  Admin API routes return **404, never 403**. This closed a live impersonation hole (the
  old unverified `x-user-id` header) — confirmed fixed in production.
- **Admin area.** `/admin` dashboard, `AdminShell` nav + fail-closed guard, `AdminLink` in
  the owner header. Surfaces: foods, **condition-contraindications (safety-critical)**,
  users (with self-demote guard), research, review queue, chart art.
- **WS4 #1 and #2.** Diagnosed-date field removed; dog age captured as years + months and
  converted server-side to an approximate DOB (`ageToApproxDob`/`dobToAge` in
  `src/lib/lifeStage.ts`) so `deriveLifeStage()` is unchanged.
- **Ingredient schema + write path.** `food_ingredients` gained `inclusion_pct`, `note`,
  `parent_ingredient_id` (compound ingredients nest as real rows). New **`public.food_full`**
  view = one row per food with all ingredients nested + `est_digestible_carbohydrate_pct`.
  Admin import endpoint at `/api/admin/food-ingredients/import`.
- **Carbohydrate.** `src/lib/carbohydrate.ts` derives it by difference (NFE); `hardFilter.ts`
  supports a derived `carbohydrate_pct` contraindication rule (deterministic, no LLM).

## Data facts — measured, don't re-derive

- **265 foods**, all 8 guaranteed-analysis nutrient columns populated. Carbohydrate derivable
  for **264/265** (range ~0% raw/wet → 51% cheap senior kibble, mean 32.5%).
- **Ingredients are the gap.** At handover only 24 ingredient rows across 6 foods, all 4-item
  seed stubs — **no food has a real ingredient list.** The owner's separate session is
  populating this. **Check coverage before building anything that depends on it:**
  ```sql
  select count(*) filter (where ingredient_count >= 5) as populated,
         count(*) filter (where ingredient_count < 5)  as remaining
  from public.food_full;
  ```
- **Consequence:** the allergy hard filter matches on `ingredient_name`, so it stays inert
  until that data lands. Nested sub-ingredients ARE found by it and by the correlation engine
  (both match across all rows) — that's how a beef-flavoured food's hidden chicken is caught.
- `condition_contraindications` is deliberately **empty** — vet-gated. Health-condition
  exclusion does nothing until a rule is entered *and approved* at `/admin/contraindications`.
- `research_documents` / `research_chunks` are deliberately **empty** — do not bulk-seed
  (it activates per-food Sonnet scoring and costs credits).

## The work, in priority order

### 1. Show food contents to clients (WS4 #3) — the owner's most recent request

> *"clients need to be able to see the ingredients when a food is displayed"*

- Extend `POST /api/recommendations` to return each food's ingredients (ordered by
  `position_in_list`, with `inclusion_pct`, `note`, nested sub-ingredients) and its nutrient
  columns. `public.food_full` returns exactly this shape in one read.
- Add an **owner-facing** food detail view — the existing `/admin/foods/[foodId]` is admin
  only. The full ordered ingredient list is the primary information on the page.
- Handle foods with no ingredients yet (most of them at handover): show nutrients, say the
  ingredient list isn't recorded yet. **Never fabricate one.**

### 2. Composition pie chart (WS4 #4) — groundwork done, finish it

**Load the `dataviz` skill first.** Established last session:

- A pie is **legitimate here**: the anti-pattern is pies for *comparing close values*;
  part-to-whole at a glance with **≤ 6 segments** is explicitly allowed. Guaranteed analysis
  is exactly 6 (protein, fat, fibre, moisture, ash, derived carbohydrate) summing to ~100%.
- **Do NOT pie the ingredients** (20–40 items, far past the ~7-class ceiling). Ingredients get
  the ordered list. If you want an ingredient visual, use a horizontal stacked bar of only
  those with `inclusion_pct` plus an explicit "remainder not specified on label" segment —
  never imply the label stated what it didn't.
- **Palette already validated — reuse, don't re-derive:**
  `#2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4, #008300` (categorical slots 1–6, fixed order).
  Result: **ALL CHECKS PASS**, with one **WARN: contrast vs surface below 3:1 for aqua,
  yellow, magenta**. That warning is **not dismissable** — it obligates **visible labels or a
  table view**, so direct-label every segment with name and value. Re-run if you add dark mode:
  ```
  node scripts/validate_palette.js "#2a78d6,#eb6834,#1baf7a,#eda100,#e87ba4,#008300" --mode light
  ```
  (run from the dataviz skill's base directory)
- Build as **dependency-free inline SVG** — avoids node_modules-corruption risk, keeps the app
  portable. Values render in `.metric`. Omit the pie entirely when nutrient data is absent
  rather than drawing an empty circle.

### 3. Persist recommendations per owner + dog (WS4 #5)

Recommendations must be saved and shown on return without regenerating (cost and UX). Add a
persistence table (e.g. `dog_recommendation_sets`: owner_id, dog_id, generated_at, payload),
save on generate, have the dog hub load the latest saved set with an explicit **Regenerate**
action. Design alongside item 4 — the cached research scores land in the same place.

### 4. Research scoring → Batch API (WS3 #2)

Owner decision, recorded in memory. Research scoring currently fires **one Sonnet call per
candidate food per request** whenever approved research exists (dormant now — research is
empty). Move to offline precompute: a batch job writes research-relevance scores into a cache
keyed by (food, research version); the live recommendation reads the cached score. Reuse
`src/lib/batchApiHelper.ts` (direct Anthropic Message Batches — the AI Gateway has **no** batch
endpoint; do not move it onto the Gateway).

**Blocker:** `ANTHROPIC_API_KEY` is empty in `.env`, so no batch job runs locally.
`AI_GATEWAY_API_KEY` is set and works for synchronous calls.

### 5. Audit AI call sites (WS3 #3)

`ingredientOcr`, `researchScoring`, `embeddingPipeline`, `foodDiscovery` — batching,
caching/idempotency, bounded concurrency, honest fallbacks. The Haiku/OCR path has still never
been exercised with a real photo.

### 6. Carried-forward (WS5) — re-read `BUILD_PROGRESS.md`, don't assume stale

`autoprefixer` install + re-add to `postcss.config.js` · choose an ESLint config (`next lint`
prompts interactively) · single-dog "Remove = anonymise vs hard-erase" GDPR confirmation ·
`/docs/*` still missing from the checkout · Supabase Auth "leaked password protection" toggle ·
Bristol/BCS artwork · `wellness_indicator_reference` research backing · legal/GDPR review ·
Batch API live verification (24h).

Also: `src/lib/ingredientBackfill.ts` + `/api/admin/ingredient-backfill` exist and type-check
but have **never been run** (needs the Anthropic key). The owner chose to populate by hand
instead — leave them unless asked.

## How to work here

**Design system — build all UI on it.** Read `src/app/globals.css` for the component-class
vocabulary (`.app-shell`, `.container-page`, `.card`, `.btn-*`, `.field/.label/.input`,
`.eyebrow/.page-title/.section-title/.metric`, `.badge-*`, `.signal-better/.signal-worse/
.signal-steady`, `.callout-info/.callout-disclaimer/.callout-alarm`) and `tailwind.config.ts`
for tokens (`pine`, `paper`, `surface`, `ink`, signal colors; `font-display` Bricolage
Grotesque, `font-sans` IBM Plex Sans, `font-mono` IBM Plex Mono). **Every metric — scores,
dates, £, counts, %, ages — renders in `font-mono` via `.metric`.** That's the signature. Keep
the red-flag/urgent register deliberately loud. Exemplars: `src/app/page.tsx`,
`src/app/signin/page.tsx`, `src/components/ContraindicationsAdmin.tsx`.

**Admin route pattern:**
```ts
import { requireAdmin } from '@/lib/serverAuth';
const admin = await requireAdmin(request);
if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });
```
Owner routes use `requireUser`. Client fetches attach `sessionAuthHeaders()` from
`@/lib/session`.

**Live-testing recipe that works** (no AI cost):
1. `npm run build`, then `npx next start -p 31xx` (pick a free port — 3000/3100 are often taken).
2. Create a throwaway account via `POST /api/auth/signup`.
3. Promote it with SQL: `update public.user_profiles set is_admin = true where id = '...'`.
4. Exercise endpoints with `curl`.
5. **Delete the test user and restore any rows you touched**, then verify with a count query.
   Every session so far has left the database exactly as found — keep that discipline.

The in-app browser's `form_input` doesn't reliably trigger React controlled inputs — drive
forms with real keystrokes or call the API directly. If `tsc`/`build` fails with an unrelated
module-resolution error, `rm -rf node_modules package-lock.json && npm install`.

## Constraints

- **Owner-gated:** pushing to main (it auto-deploys), destructive or security-broadening
  Supabase actions, and anything spending real API credits. Ask first, with a cost estimate.
  Haiku 4.5 is $1/MTok in, $5/MTok out; Message Batches is 50% off.
- Never invent clinical mappings, nutrient values, ingredients, credentials, or citations —
  extract or flag, never guess.
- Don't bulk-seed research; don't leave synchronous per-food Sonnet scoring on.
- Preserve the deterministic-vs-inference safety separation.

## Definition of done

Clients can see a food's full ingredient list and a validated, directly-labelled composition
pie; recommendations persist per owner+dog with a Regenerate action; research scoring reads a
precomputed cache instead of calling Sonnet per food; carried-forward items done or explicitly
re-logged under "Needs owner input". No new `tsc`/`build` errors, verified at mobile and
desktop widths, `BUILD_PROGRESS.md` updated with a dated entry, and a handover covering
outcome / files / verification / decisions / risks / owner-review / best next task.
