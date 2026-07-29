# Claude Code Conventions for Bowl (by Dog Smart)

## Project Context
**Product:** **Bowl** — a decision-support tool for dog owners to get personalized food recommendations based on their dog's health, restrictions, and individual response patterns.

**Brand (owner-set, 2026-07-26 — do not paraphrase or reword these):**
- Name: **Bowl**
- Tagline: **Every dog is different. Every choice matters.**
- Attribution: **by Dog Smart**
- Logo assets: `Logo/` (source, as supplied) and `public/bowl-logo.{png,svg}` (served).
  The full square lockup carries the tagline and attribution, so it is used where
  there is room to read it — landing hero, sign-in, sign-up. Headers use a compact
  text wordmark ("Bowl") because the lockup is illegible at 15px.

**Tech Stack:**
- Frontend: Next.js (App Router) on Vercel
- Database: Supabase (Postgres + pgvector for embeddings, UK/EU region for GDPR)
- AI routing: Vercel AI SDK
  - Claude Haiku 4.5 for vision/OCR extraction (cheap, high-volume)
  - Claude Sonnet 5 for RAG synthesis and recommendation scoring
  - Claude Opus 4.8 reserved for complex correlation reasoning if needed
- Scheduled jobs: Supabase Edge Functions + pg_cron (weekly food discovery), or Vercel cron for longer-running tasks

---

## Documentation & State Tracking

**Read these before every session:**
- `/docs/dog-food-platform-plan.md` — Architecture & build plan (§1-12, especially §2 hard-filter/inference separation, §4 data model, §5-6 scoring/correlation)
- `/docs/technical-build-spec.md` — Schema (Part A), API contract (Part B), resolved decisions (Part C), phase prompts (Part E)
- `/docs/legal-compliance-review.md` — GDPR, liability, data handling, disclaimers
- `BUILD_PROGRESS.md` — Persistent state across sessions (what's complete, what's blocked, owner input needed)

**Critical rule:**
If anything in the docs is ambiguous or you need to make an assumption the docs don't cover, **stop and log it in BUILD_PROGRESS.md under "Needs owner input"** rather than guessing and continuing. This keeps errors from compounding silently.

---

## Build Sequence (6 Phases)

Follow the sequence in the architecture doc §8 and technical build spec Part E. Each phase is complete before starting the next; use the phase prompts from Part E as your starting point for each session.

1. **Phase 1:** Auth, profiles, hard-filter safety layer, manual food dataset
2. **Phase 2:** Baseline & monitoring (Bristol/BCS charts, logging UI, red-flag escalation)
3. **Phase 3:** Recommendation engine v1 (hard filters + nutritional/lifestyle scoring, no RAG yet)
4. **Phase 4:** RAG research layer (embedding pipeline, research integration)
5. **Phase 5:** Photo/OCR ingestion (ingredient_review_queue, Tier 2 workflow)
6. **Phase 6:** Weekly discovery job (Batch API, Tier 1 scraping), correlation engine, inactivity auto-deletion

---

## Key Design Principles (Non-negotiable)

1. **Safety layer separation** (§2 of architecture doc): hard-filter logic (SQL, deterministic, allergies/health conditions) is completely separate from inference layer (LLM, RAG, scoring). Never blend them.

2. **Baseline-relative tracking** (§4 of architecture doc): body condition and general wellness log *shift from baseline* (better/worse/no change) + optional chart recalibration. Stool is the explicit event-level exception added 2026-07-29: baseline stores the representative score set and usual count range; monitoring stores one exact score per actual stool; daily worst/median/count/spread are derived at read time and compared with baseline.

   Diet attribution is always the complete flat component set for one versioned period. No component is primary; role and ordinal share are descriptive only. Allergen exposure is the union across every component, and one opaque component makes the whole diet unconfirmable. Rotating/intermittent periods are not switches and never enter switch-derived reasoning.

3. **Metric-specific lag windows** (architecture doc §4, technical build spec Part A): digestive metrics settle ~10 days post-food-switch, energy/weight ~21 days, coat/skin ~56 days. Use `metric_minimum_lag_days` reference table—don't hardcode one lag value for everything.

4. **Never auto-merge unreviewed OCR** (§7 of architecture doc): owner-submitted photos go through `ingredient_review_queue` *always*, never directly into `foods`/`food_ingredients`. Tier 1 (brand-page scrapes) can auto-merge after duplicate/field checks only.

5. **Data deletion semantics** (§10 of architecture doc): hard-delete owner personal data (account, email, identifying info). Anonymise (nullable `owner_id`) dog records so they keep contributing to research/pooled signals.

6. **Confidence honesty** (§9 of architecture doc): don't inflate confidence ratings to make the product feel authoritative. If a correlation is based on 3-5 logs, label it `low_sample` and surface the sample size. Overstating confidence is a liability risk.

---

## Data conventions

`food_ingredients.position_in_list` is PARENT-SCOPED, not global rank. Children restart at 1 under each `parent_ingredient_id`. Top-level rows have `parent_ingredient_id IS NULL` and are the only rows whose position means prevalence order. Any query or report touching `position_in_list` MUST project `parent_ingredient_id` alongside it. Grouping by `(food_id, position_in_list)` alone produces phantom duplicates and phantom rank inversions. This has caused three wrong diagnoses.

---

## Reply style

Reply in caveman style: fragments, no articles, no preamble, no restating instructions. Findings and numbers only.
