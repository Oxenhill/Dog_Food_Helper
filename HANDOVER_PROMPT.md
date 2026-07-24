# Handover prompt — Dog Food Helper: finish the build, then redesign the UI

Paste everything below this line into a fresh Claude Code session running on **Opus** as the
orchestrating model. This document is self-contained — it front-loads everything discovered in
the prior session so you don't have to re-derive it at token cost.

---

## Your role

You are the orchestrator for this session, running as Opus. Delegate implementation-heavy,
parallelizable, or narrowly-scoped subtasks to cheaper models (Sonnet for most coding work, Haiku
for simple/rote tasks) via the Agent tool's `model` parameter, rather than doing everything
yourself at Opus cost. Keep your own context focused and avoid unnecessary large re-reads of
files you've already seen — Claude Code's prompt caching means a stable, un-thrashed context is
what actually saves tokens; there is no separate manual "enable caching" step. Where you need
several independent, similarly-shaped LLM calls done as part of your own engineering process
(not the app's — see below), prefer parallel subagent dispatch over serial one-by-one calls.

**Batch API note:** the app itself already correctly uses Anthropic's direct Message Batches API
for one specific job (`src/lib/batchApiHelper.ts`, the weekly food-discovery cron) — this was a
deliberate architecture decision made last session (Vercel AI Gateway has no batch/async-discount
equivalent, confirmed via Vercel's own docs) and should stay as-is. Don't try to move it onto the
Gateway or onto some other batching mechanism. This is unrelated to how *you* (the orchestrator)
should manage your own token efficiency during this session.

## Read first, in this order

1. `CLAUDE.md` (this repo's own conventions — build sequence, non-negotiable design principles,
   the "stop and log rather than guess" rule)
2. `BUILD_PROGRESS.md` in full, especially the last three dated entries at the top (sign-in/
   sign-up flow + critical Vercel/Supabase misconfiguration, AI Gateway migration, dog profile UI)
   — these describe everything the immediately-prior session did and found
3. Run `git log --oneline -15` and `git status -sb` to confirm the state matches this document
4. Current live state: **main branch, pushed, deployed to Vercel at
   `https://dog-food-helper.vercel.app`** (project under the "dog-smart-s-projects" Vercel team —
   note the Vercel MCP tool available in the prior session could only see a *different* Vercel
   project belonging to a separate sibling app, "dog-smart-learning-centre"/Dog Smart Studio, not
   this one — don't assume MCP tool access to the actual dog-food-helper Vercel project without
   checking first). Supabase project `ysffyuohwvdifvbopfcm` ("Dog_Food_Helper") is the correct,
   live backing project — RLS enabled on all tables, `is_admin` role exists, email confirmation on
   signup was **turned off** by the owner this session (their choice, to remove a Supabase
   email-rate-limit blocker — see BUILD_PROGRESS.md for the tradeoff they accepted).

## Hard-won context from the prior session — don't rediscover these at cost

- **A second Supabase project exists in the same org**: `spsdfdlufqcduekqxxjk` ("Dog-smart-
  learning-centre" / Dog Smart Studio — a *completely separate product*, governed by a different
  top-level CLAUDE.md at the repo-container level). The Vercel env vars for this app were once
  found pointing at the *wrong* project (that one) — verified fixed by the owner and confirmed via
  live log evidence this session, but if you ever see a Postgres/PostgREST error mentioning a
  table that "shouldn't" be missing (e.g. `user_profiles` not found), check which Supabase project
  the request actually reached before assuming a code bug. Never run destructive or write queries
  against `spsdfdlufqcduekqxxjk` under any circumstances — it isn't this app's data.
- **Vercel AI Gateway migration (this session, unverified live):** `src/lib/ingredientOcr.ts`,
  `src/lib/researchScoring.ts`, `src/lib/embeddingPipeline.ts` were migrated from direct
  Anthropic/OpenAI/Voyage calls to Gateway-routed calls (plain `"provider/model"` strings via
  `ai@7`'s `generateObject`/`embed`). Confirmed live model ids via
  `GET https://ai-gateway.vercel.sh/v1/models` (no auth needed to check this yourself):
  `anthropic/claude-haiku-4.5`, `anthropic/claude-sonnet-5`, `openai/text-embedding-3-small`.
  **This has never been exercised against a real Gateway call** — no `AI_GATEWAY_API_KEY` or
  provider key was available in the prior sandbox. Before anything else in this area: confirm
  "OIDC Federation" is enabled on the actual Vercel project (Project Settings — this is required
  for `VERCEL_OIDC_TOKEN` to exist at all, confirmed via Vercel's own docs it is **not** on by
  default), or get an `AI_GATEWAY_API_KEY` set. Then actually test: submit an ingredient photo,
  request recommendations for a dog with retrieved research chunks, run
  `npm run seed:phase4` for embeddings.
- **`ANTHROPIC_HAIKU_MODEL` vs `AI_GATEWAY_HAIKU_MODEL` — deliberately different env vars, not a
  naming accident.** The first is a raw dated Anthropic API id, read only by the direct-API batch
  job (`foodDiscovery.ts`); the second is a Gateway `"provider/model"` string, read only by the
  now-migrated OCR file. Reusing one var for both would silently break whichever reads it under
  the wrong format assumption — keep them separate.
- **The dog-profile UI was entirely missing until this session** — `/dogs`, `/dogs/new`,
  `/dogs/[dogId]` (hub page, which also gives `POST /api/recommendations` its first-ever UI) were
  just added and are **unverified against real data** (only smoke-tested locally with a fake
  session id against a placeholder Supabase key). Test the full flow end-to-end first: sign up →
  land on `/dogs` → create a dog → reach its hub → get recommendations → confirm real, sensible
  results come back (not an error swallowed into an empty list).
- **Local `.env` in this checkout has some real values and some placeholders** —
  `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` were literal placeholder strings as of the last
  session (blocks any local write-path testing). Check current state; if still placeholders, test
  against the deployed Vercel app instead of locally, or ask the owner for real local values.
- **`node_modules` corruption from interrupted installs has hit almost every prior phase** — if
  `npm run build`/`tsc` fails with a module-resolution error unrelated to your own changes, try a
  clean `rm -rf node_modules package-lock.json && npm install` before assuming it's a code bug.
  This was necessary (and worked cleanly) during the AI Gateway migration.
- **Dev-server gotcha:** if you run `npm install` (adding/removing/upgrading dependencies) while a
  `next dev` process is already running from before the install, the running process will serve
  stale/broken module resolution errors. Restart the dev server after any dependency change.

## Workstream 1 — finish the build properly

Functional gaps identified but not yet closed, roughly in priority order:

1. **Verify the AI Gateway migration and dog-profile UI live** (see above) — this is the most
   important thing to do first, since two entire subsystems were built/changed without live
   verification.
2. **Dog profile management is create-only.** `PUT /api/dogs/[dogId]` exists (life_stage
   re-derivation on DOB/size change already handled server-side) but there's no edit form. No
   delete route or UI exists either.
3. **`dog_restrictions`/`dog_health_conditions` have API routes (`/api/restrictions`, Phase 1) but
   no management UI** — an owner currently cannot add/view their dog's allergies or health
   conditions anywhere in the interface, which also means the hard-filter safety layer
   (`src/lib/hardFilter.ts`) has no way to be populated by a real user yet.
4. **Long-standing safety gap, flagged since Phase 3, still unresolved:**
   `dog_health_conditions` rows are fetched but never used to exclude anything from
   recommendations (only ingredient-restriction hard-filtering works). Needs either a
   `condition_contraindications` reference table or nutrient columns on `foods` before this can
   be built — this is a genuine data-model gap, not a coding gap; read Phase 3's BUILD_PROGRESS.md
   note before guessing at a mapping.
5. **No real admin/session auth beyond what exists** — `serverAdminAuth.ts`'s `is_admin` check is
   solid, but confirm it's actually being exercised correctly against the live schema (e.g. the
   admin bootstrap via `ADMIN_EMAILS` — the owner confirmed this is set in Vercel and used it to
   become the first admin this session; verify `user_profiles.is_admin = true` actually landed for
   their account).
6. **Batch API (weekly food-discovery job) still unverified against a real batch** — flagged since
   Phase 6, request/response shape implemented from documentation only.
7. **Everything else still open from Phase 6's own "Needs owner input" and "Final review flags"
   sections** in `BUILD_PROGRESS.md` — re-read that list rather than assuming it's stale; check
   what the owner has since confirmed vs. what's still pending (legal/GDPR review, Bristol/BCS
   chart illustrations, wellness taxonomy research backing, etc.).

Do not skip straight to cosmetic work while safety-relevant gaps (item 4, item 3) remain open —
per this repo's own CLAUDE.md, the hard-filter/inference safety separation is a non-negotiable
principle. Flag anything ambiguous in `BUILD_PROGRESS.md` under "Needs owner input" rather than
guessing, exactly as every prior phase in this file has done.

## Workstream 2 — make the UI beautiful

The owner's own words: **"the UI is currently ugly."** Every page in this app so far has been
built with plain, generic Tailwind utility classes (`bg-blue-600`, `rounded-lg`, `shadow`) and
zero deliberate visual identity — functional, not designed.

**Load the `frontend-design` skill before starting this workstream** — it's listed as an
available skill in this environment specifically for "distinctive, intentional visual design"
work and choices that don't read as templated defaults. Use it to establish an actual aesthetic
direction (typography, color, spacing rhythm) rather than continuing the current default-Tailwind
look, then apply that consistently across every page: landing (`/`), signin/signup, the dog
list/create/hub pages, the logging flows (baseline, quick-log, recalibrate, red-flag), photo
submissions, and the admin pages (review queue, chart illustrations).

Constraints to respect while redesigning:
- Don't touch the underlying data-fetching/API logic in any page — this is a visual/structural
  pass, not a rebuild. If a page's current information architecture is genuinely wrong (not just
  ugly), flag it rather than silently restructuring data flow along with visuals.
- Keep the red-flag/urgent-symptom styling clearly distinct and alarming (per Phase 2's explicit
  design requirement) — don't let a general design-system pass flatten that into the same visual
  register as routine logging.
- Mobile and desktop layouts both matter — dog owners will use this from their phone mid-walk.
- Keyboard access, focus states, and basic a11y shouldn't regress during the redesign.
- This is a decision-support health tool for a dog, not a lifestyle/consumer app — the tone should
  read as credible and calm, not flashy. Keep the disclaimer/evidence-honesty language exactly as
  written; don't let a visual pass soften language that was deliberately chosen for liability/
  honesty reasons (see CLAUDE.md's "Confidence honesty" principle).

## Definition of done for this handover

- Workstream 1's item 1 (live verification of both major unverified subsystems) is complete with
  actual evidence (screenshots, logs, or a described real test run), not just "the code looks
  right."
- Every other item in Workstream 1 is either done, or explicitly logged in `BUILD_PROGRESS.md`
  under "Needs owner input" with a clear reason it wasn't done.
- The UI redesign covers every page listed above, is checked in both a mobile and desktop
  viewport, and doesn't introduce any new `npm run build`/`tsc` errors.
- `BUILD_PROGRESS.md` is updated with a new dated entry describing what changed, same convention
  as every entry already in that file.
- End with the standard handoff format this repo's CLAUDE.md asks for: outcome, files changed,
  verification performed, decisions made, risks/blockers, and owner-review items.
