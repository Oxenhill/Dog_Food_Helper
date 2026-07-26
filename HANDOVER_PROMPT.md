# Next session — Dog Food Helper

Paste everything below the line into a fresh Claude Code session (Opus orchestrating) in
`C:\dev\dog-smart-learning-centre\Dog_Food_Helper`.

**This is a build plan, not a status report.** Everything already shipped is in
`BUILD_PROGRESS.md` — read it for context, but do not spend the session re-confirming it.
What follows is the work that is *left*, in the order it should be done, with the reasoning
that makes each piece necessary.

---

## The one thing to understand before you start

**The correlation engine cannot produce a single result today, and never will until food
linkage exists.** Measured on the live database 2026-07-26:

| | |
|---|---|
| dogs | 4 |
| dogs with `current_food_id` set | **0** |
| log entries | 12 |
| log entries with `food_id_active` | **0** |
| `dog_food_events` rows ever | **0** |
| `ingredient_outcome_signals` rows | **0** |

The chain is: the dog form captures `current_food_freetext` (free text) and never sets
`current_food_id` → `food_id_active` falls back to that null → `computeCorrelationsForDog()`
filters on `food_id_active is not null` and matches nothing → zero signals, permanently.

This is the same failure shape as the allergy filter being inert for want of ingredient data:
a whole subsystem that is built, tested, and structurally unable to do anything because
nothing populates its input. **Everything in Priority 1–3 below exists to fix that**, and the
owner arrived at the same conclusion from the product side ("we need a way of a user being
able to say 'I've changed foods and this is what I've changed to'").

Do not start on refinements until a dog's logs can actually be attributed to a food.

---

## PRIORITY 1 — Make food attribution real

**Goal:** every log entry can be tied to what the dog was actually eating.

**Already there, unused:** `POST /api/food-events/start` and `/api/food-events/end` exist and
work. **Nothing in the UI calls them** (`grep -rn "food-events" src/app src/components` →
nothing). `dog_food_events` has `event_type ('main_food' | 'treat')`, `food_or_treat_id`,
`food_or_treat_freetext`, `started_at`, `ended_at`, `in_transition_until`.

**Build:**
1. **"What is your dog eating now?"** — on the dog hub and in dog creation. Pick a real food
   (search the 272-row catalogue) or scan a packet via the existing `/foods/add` flow. Sets
   `dogs.current_food_id`, and opens a `dog_food_events` row with `event_type='main_food'`.
   Keep `current_food_freetext` working as a fallback for a food genuinely not in the
   catalogue, but treat it as a prompt to scan the packet rather than a resting state.
2. **"I've changed foods"** — the owner's explicit ask. Closes the current main_food event
   (`ended_at`) and opens the new one. Capture `in_transition_until` (a switch is usually
   phased over ~7 days) because logs inside a transition are confounded by *both* foods and
   should be weighted accordingly, not treated as clean evidence for the new one.
3. **Backfill `food_id_active` at log time** from the open main_food event rather than from
   `dogs.current_food_id`, so the value reflects what was true *on the log date* rather than
   what is true now. `src/lib/lagWindow.ts` already computes this field — change its source.

**Acceptance:** create a dog, set its food, log a few entries, switch food, log more — then
`select food_id_active, count(*) from dog_log_entries group by 1` shows both foods.

---

## PRIORITY 2 — Treat logging (owner's design, captured verbatim in intent)

Treats are now catalogued (`foods.is_treat`, excluded from meal recommendations) but there is
**no way to log that one was given.** The owner's requirements:

- **Occasion-based, not daily.** "Treats… are unlike the cadence of daily foods." Do not model
  a treat as a food period with a start and end. Model it as a discrete event on a date —
  `dog_food_events` with `event_type='treat'` already fits, using `started_at` as the occasion
  and leaving `ended_at` null.
- **Opt in / opt out.** Most owners will not log every treat, and a half-kept treat log is
  worse than none because it produces confident-looking correlations from partial data. Store
  the preference per dog (a `treat_logging_enabled` column on `dogs`, or a small preferences
  table) and **make the correlation engine aware of which dogs have it on** — see Priority 3.
- **Prompt when it matters.** "If there's evidence of poor stools and gas then we should
  prompt them to start logging treats." Implement as a conditional nudge, not a nag: when a
  dog has recent `stool_score` / `gas_frequency` / `gas_odor` logs trending worse and treat
  logging is off, surface a calm prompt explaining *why* it would help — an unlogged treat is
  the most common hidden variable behind exactly those symptoms. Use the existing
  `.callout-info` register; this is a suggestion, not a red flag.

**Acceptance:** a dog with treat logging on can record "gave X today" in two taps; a dog with
it off is never nagged unless the stool/gas trend condition fires; the prompt appears once and
can be dismissed.

---

## PRIORITY 3 — Rework the correlation engine around food *changes*

This is the owner's central insight and it changes the method, not just the inputs:

> "the correlation engine should be looking for ingredients that are common across changes…
> what might it be in a food that isn't agreeing with your dog"

**What it does now** (`src/lib/correlationEngine.ts`): for each log with an active food, it
credits *every ingredient in that food* with the logged trend, then computes
`(better − worse) / total` per ingredient. Every ingredient in a 30-item list gets identical
credit, so a food with a long list produces 30 equally-weighted signals that mean very little.

**Why a food change is better evidence.** A switch is a natural experiment. If a dog improves
after moving from food A to food B:
- ingredients in **both** A and B cannot explain the change — they are controlled for;
- ingredients **only in A** (removed) are candidates for what was causing the problem;
- ingredients **only in B** (added) are candidates for what helped.

That set difference is a far stronger signal than presence-alone, and it is computable from
data you will have once Priority 1 lands. It also directly answers the owner's question, which
is diagnostic ("what in this food disagrees with my dog"), not merely associative.

**Build:**
1. Detect switch points from `dog_food_events` (a main_food event ending and another starting).
2. For each switch, compare the outcome window **before** vs **after** (respecting
   `metric_minimum_lag_days` per metric — digestive ~10d, energy/weight ~21d, coat/skin ~56d;
   `src/lib/lagWindow.ts` already holds this) and skip logs inside `in_transition_until`.
3. Compute added / removed / retained ingredient sets between the two foods, including nested
   sub-ingredients (both `hardFilter` and the current engine already match across all rows, so
   a compound ingredient's contents are visible).
4. Write signals **attributed to the added or removed set**, not to every ingredient present.
5. **Treats are a confounder.** For a dog with treat logging ON, treat ingredients given in
   the window must be included in the candidate set — a change attributed to a food switch may
   actually be a new treat. For a dog with logging OFF, say so in the confidence output rather
   than silently assuming no treats were given.

**Keep the existing honesty discipline.** The current `correlation_strength` is documented as a
directional heuristic, not a real coefficient, with sample-size confidence flags
(`low_sample` 3–5, `preliminary` 6–15, `established` 16+) and nothing written below 3. Preserve
that. A switch-based signal from a single switch is **one observation**, however clean — it must
not be presented as established.

**Acceptance:** a dog that switches food and improves produces signals naming the ingredients
that actually changed, with a sample size reflecting the number of switches, and a stated
caveat when treat logging was off.

---

## PRIORITY 4 — Smaller items, in rough value order

- **Retire or repurpose the old photo flow.** `/dogs/[dogId]/submissions` still stores photos
  and queues every submission for admin review. The dog hub now points at `/foods/add`
  instead (no storage, owner-confirmed). Decide: delete it, or keep it as an admin-only path.
  Leaving both is the worst option — two flows with different privacy behaviour.
- **A real packet has never been through `/foods/add`.** It was verified with *rendered*
  labels: clean, flat, high contrast. A crinkled bag in kitchen light is the real test. Ask
  the owner to try one before this is promoted to their client base.
- **~13s for a two-image read.** Fine for a deliberate add, slow if clients are asked to scan a
  whole cupboard. Consider a progress state or an optimistic UI before any bulk ask.
- **ESLint and autoprefixer are entirely uninstalled** (`eslint`, `eslint-config-next`,
  `autoprefixer`, `postcss` all absent from package.json). Deliberately never bundled into a
  feature deploy. Do it as its own change: `npm install -D eslint eslint-config-next
  autoprefixer postcss`, add `.eslintrc.json` = `{"extends":"next/core-web-vitals"}`, re-add
  autoprefixer to `postcss.config.js`, then diff the CSS output before and after.
- **`/api/cron/research-scoring` is not scheduled** in `vercel.json`. Only schedule it once a
  real research corpus exists — it is a no-op while `research_documents` is empty. `?dry=1`
  reports queue depth for free; `?limit=N` caps spend.
- **Food discovery has never run live** (the domain allowlist is empty). It is now synchronous,
  50 pages max, 4 concurrent, one Haiku call per page. Watch the first real run for
  function-timeout headroom.
- Unchanged and still owner-gated: single-dog "Remove = anonymise vs hard-erase" GDPR
  confirmation · vet-approved `condition_contraindications` rules (health-condition exclusion
  does nothing until one is approved) · `/docs/*` missing from the checkout · Supabase Auth
  "leaked password protection" off · `wellness_indicator_reference` research backing · legal
  and GDPR review.

---

## Facts you can rely on (measured 2026-07-26 — re-check anything you build on)

- **Deployed:** https://dog-food-helper.vercel.app — main auto-deploys, live in ~40s.
- **Supabase `ysffyuohwvdifvbopfcm`.** The sibling `spsdfdlufqcduekqxxjk` is a **different
  product — never write to it.** Always pass the project id explicitly.
- **`AI_GATEWAY_API_KEY` is set in Vercel and confirmed working in production** (the extract
  endpoint returns 400 validation, not 503 missing-auth). **There is no `ANTHROPIC_API_KEY`
  anywhere and there must never be** — owner instruction. `grep -rn "process.env.ANTHROPIC"
  src/` returns nothing.
- **The Gateway has no batch endpoint.** Probed: `/v1/messages/batches`, `/v1/batches`,
  `/v1/files`, `/v1/openai/batches`, `/v1/anthropic/v1/messages/batches`, `/batches` — all
  404 with and without auth; `/v1/messages` returns 400. **Settled. Do not re-litigate, and do
  not reintroduce a direct Anthropic call to chase the batch discount.**
- **272 foods, and only 31 have verified ingredient data.** Your other session's audit records
  why each failed: `identity_ambiguous` 134 (the name maps to several recipes),
  `ambiguous_formula` 70 (published formula conflicts with the stored one),
  `source_unavailable` 37 (domain gone). **None of those are fixable by better scraping** —
  which is the real argument for packet photos, not cost (per-item cost is near-identical:
  ~$0.005/photo vs ~$0.008/scrape).
- **Baseline to restore after testing:** auth.users 4, user_profiles 4 (1 admin), dogs 4,
  foods 272, `research_*` and `research_score_*` all 0. **One `dog_recommendation_sets` row
  belongs to a REAL user (dog "Harry") — do not delete it.** Check before any cleanup delete;
  another session may also be writing `food_ingredients` concurrently, so never bulk-delete
  from it.

## How to work here

**Verification is the job.** Two bugs shipped-and-caught this week were invisible to `tsc` and
`build`: a cache lookup that returned 400 because two ~270-value `IN()` lists overran the URL
limit (the fail-soft reported it as "not scored" and nothing looked broken), and an API route
Next had silently prerendered at build time so uploads never appeared until a redeploy.
**Exercise the real path against the real database.** A green build proves nothing about
behaviour, and a subagent's success claim is not evidence.

**Measure, don't argue from docs.** The Gateway batch question was settled by probing six
endpoints after the documentation proved ambiguous and a third-party source was wrong.

**Design system.** `src/app/globals.css` (`.card`, `.btn-*`, `.field/.label/.input`,
`.eyebrow/.page-title/.section-title/.metric`, `.badge-*`, `.signal-*`, `.callout-*`) and
`tailwind.config.ts` (`pine`, `paper`, `surface`, `ink`; Bricolage Grotesque display, IBM Plex
sans/mono). **Every metric — scores, dates, £, counts, %, ages — renders in `font-mono` via
`.metric`.** Red-flag register stays deliberately loud. Exemplars: `src/app/page.tsx`,
`src/components/CompositionPie.tsx`, `src/components/LabelCapture.tsx`.

**Charts:** load the `dataviz` skill. The composition palette is already validated —
`#2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4, #008300`, fixed slot order, with a
non-dismissable contrast WARN that obligates visible labels. Don't re-derive it. Never pie an
ingredient list.

**Auth:** `requireAdmin` (admin routes return **404, never 403**) / `requireUser` from
`@/lib/serverAuth`; clients attach `sessionAuthHeaders()` from `@/lib/session`.

**Live-testing recipe (no AI cost):** `npm run build` → `npx next start -p 31xx` → throwaway
account via `POST /api/auth/signup` → promote with `update public.user_profiles set is_admin =
true where id='...'` → exercise with `curl` → **delete the test rows and verify with a count
query.** Every session so far has left the database exactly as found. If `tsc` reports missing
modules for a route you deleted, `rm -rf .next`.

**Constraints:** ask before spending API credits (give a cost estimate — Haiku 4.5 is $1/MTok
in, $5/MTok out); never invent clinical mappings, nutrient values, ingredients or citations;
don't bulk-seed research; don't put a model call back into a request path; keep the
deterministic hard filter separate from the inference layer.
