# Research Layer — Design

**Status:** draft for owner review
**Belongs at:** `docs/RESEARCH_LAYER_DESIGN.md`
**Date:** 2026-07-28
**Companion to:** `docs/FOOD_DISCOVERY_DESIGN.md` §6

---

## 1. Purpose

A knowledge base the system reasons **from**, not a feature users see.

It exists to do three jobs:

1. Hold current evidence on canine nutrition, allergen activity, intolerance and
   gut microbiome testing, in a form decision logic can query.
2. Make an uploaded client document *interpretable* — a gut biome panel or allergen
   test is a list of findings that means nothing without a body of knowledge to read
   it against.
3. Improve food recommendations with a stated, citable reason.

It is not client-facing. It is not a ranking gimmick. It is the difference between a
tool that matches ingredient strings and one that understands why a match matters.

---

## 2. Principles

Inherited from project doctrine, plus two new ones this layer forces.

1. **A model never authors a decision in the user path.** Same rule that governs
   composition extraction, applied one level up. The model drafts claims offline;
   approved claims drive recommendations via SQL at runtime.
2. **Every claim is traceable to a verbatim quote in a source document.** If it
   cannot be pointed at, it does not exist. Same standard as `composition_raw`.
3. **Peer review is a floor, not a ceiling.** Publication is not truth — see §5.
   Confidence comes from study design, species, independence and replication.
4. **Nothing here diagnoses.** Outputs are informational, evidence-cited, and framed
   for discussion with a vet. Structural rule for the whole layer, not a disclaimer
   on one table.
5. **Signal types stay separate.** Research, client documents and a dog's own
   observed data are never blended into a single number.

---

## 3. Architecture

**Offline claim extraction, SQL at runtime.** Decision made 2026-07-28.

```
  ingest (scheduled, no owner input)
      |
  research_documents  ->  research_chunks  ->  embeddings
      |
  claim drafting (RAG + model, OFFLINE ONLY)
      |
  research_claims  --[auto-activate if strong]-->  active
                   \-[queue if weak]------------>  owner review
      |
  RUNTIME: SQL join. claims x dog profile x food composition.
           No model. No token cost. Fully auditable.
```

RAG is used to **build** the brain. It is not the brain at request time.

Why: a model reasoning over retrieved passages per recommendation reintroduces the
exact pattern that fabricated this project's composition data — but harder to catch,
because the output is plausible prose rather than a number that contradicts a live
page. It also costs tokens on every request, forever.

The existing `research_score_cache` and `research_score_queue` tables already encode
this instinct — their comments say scoring is precomputed and "never drained inside
a user request." This design follows that.

---

## 4. Data model

### Existing, reusable

- `research_documents` — `topic, source_url, title, retrieved_at, review_status,
  superseded_by`. Global literature store. No `dog_id`/`owner_id`. Publishable.
- `research_chunks` — `document_id, content, embedding, chunk_index`. pgvector.
- `research_score_cache` / `research_score_queue` — offline scoring plumbing.

### New: `research_claims` — the core table

| field | purpose |
|---|---|
| `id` | |
| `document_id` | source, FK to `research_documents` |
| `supporting_quote` | **verbatim** text from the document. Non-negotiable. |
| `chunk_id` | where the quote came from |
| `subject_type` | `ingredient`, `nutrient`, `ingredient_class`, `processing_method`, `biome_marker` |
| `subject_value` | e.g. `hydrolysed protein`, `chicken`, `crude fibre` |
| `applies_to_condition` | nullable — e.g. `food_responsive_enteropathy`, `dermatitis` |
| `applies_to_life_stage` | nullable |
| `direction` | `supports`, `cautions_against`, `neutral`, `insufficient_evidence` |
| `effect_summary` | one sentence, plain English, shown to users |
| `evidence_grade` | see §5 |
| `study_design` | `systematic_review`, `rct`, `cohort`, `case_control`, `case_series`, `in_vitro`, `narrative_review` |
| `species` | `dog`, `cat`, `human`, `rodent`, `other` |
| `sample_size` | integer, nullable |
| `funding_independent` | boolean, nullable — null means undeclared, treated as not independent |
| `corroborating_claim_ids` | array — other claims agreeing |
| `status` | `draft`, `active`, `queued_for_review`, `rejected`, `superseded` |
| `reviewed_by`, `reviewed_at`, `review_note` | |

### New: `dog_documents` — client uploads

Per `FOOD_DISCOVERY_DESIGN.md` and the privacy boundary: keyed to `auth.users`,
**permanently private**, never in the `catalogue` schema, RLS owner-only.

`dog_id`, `owner_id`, `document_type` (`gut_biome`, `allergen_test`, `vet_report`,
`other`), `original_filename`, `storage_path`, `extracted_text`, `lab_name`,
`collected_date`, `processing_status`.

### New: `dog_document_findings` — parsed, structured, private

One row per finding extracted from an uploaded document. `document_id`, `dog_id`,
`finding_type` (`biome_marker`, `allergen_reactive`, `allergen_clear`), `marker_name`,
`value`, `unit`, `reference_range`, `interpretation_flag` (`high`, `low`, `normal`,
`reactive`, `unclear`), `verbatim_source_text`.

Same rule as composition: **the verbatim text is stored, and nothing is recorded that
cannot be pointed at in it.**

---

## 5. Evidence grading — and why publication is not enough

Peer review filters. It does not verify.

Replication failures are well documented across biomedicine: Amgen reproduced 6 of
53 landmark cancer studies; Bayer roughly a quarter of 67; the Reproducibility
Project replicated about a third of 100 psychology findings. Every one of those was
peer-reviewed at publication.

Companion-animal nutrition carries two further problems:

- **Industry funding is common.** A claim drawn from a manufacturer-funded trial
  about that manufacturer's product class is exactly what the no-affiliate policy
  exists to exclude — arriving dressed as science.
- **Species extrapolation.** Most gut microbiome research is human or rodent.
  Applying it to dogs is an inferential step the paper did not take.

So grading is computed from objective, machine-readable metadata, not from the fact
of publication.

| grade | criteria |
|---|---|
| **A** | systematic review or meta-analysis, in dogs |
| **B** | RCT or controlled trial in dogs, independently funded, n ≥ 20 |
| **C** | cohort/case-control in dogs, OR RCT in dogs with industry funding |
| **D** | case series, small n, in vitro, or narrative review |
| **E** | non-canine species, extrapolated |

**Auto-activation rule.** A drafted claim goes live without owner review only if
**all** hold:

1. `evidence_grade` is A or B
2. `species = dog`
3. `funding_independent = true` (null does not count)
4. at least one corroborating claim from a different document
5. source document is not retracted (checked at ingest and re-checked monthly)
6. `direction` is not `cautions_against` — anything steering a user *away* from a
   food gets human eyes regardless of grade

Everything else lands in `queued_for_review`. Nothing is discarded.

This is the compromise between "learns with little input from me" and not letting a
single small industry-funded study reach a real dog. In practice the strong,
well-replicated findings — which are the ones that matter most — flow through
automatically, and the owner's attention goes only to the contested cases.

**Retraction watch:** re-check source DOIs monthly. A retracted document immediately
sets all its claims to `superseded` and raises a `system_alerts` row.

---

## 6. Ingestion

Scheduled, autonomous, from an allowlist of sources only.

**Allowlisted sources:** PubMed/PMC, named veterinary journals (JVIM, JSAP, Vet
Dermatology, BMC Vet Research, Frontiers in Vet Science), WSAVA and FEDIAF guidance
documents. Nothing outside the allowlist enters. No blogs, no manufacturer white
papers, no press releases.

**Per document:** fetch metadata and abstract or open-access full text, store in
`research_documents`, chunk, embed into `research_chunks`. Reduce before any model
sees it — same 8192-character discipline as composition extraction.

**Claim drafting:** for each document, the model proposes claims in the
`research_claims` shape, each with a verbatim quote. Assert every
`supporting_quote` is a literal substring of its chunk. Any claim failing that
assertion is discarded, not corrected — same rule as composition parsing.

**Cadence:** weekly. Logged to `cron.job_run_details`. Raises a `system_alerts` row
if two consecutive runs ingest nothing, or if the review queue exceeds a threshold.

---

## 7. Three signal types, kept separate

They have different reliability profiles and must remain distinguishable to the UI.

| signal | strength | weakness |
|---|---|---|
| **Research claims** | reliable in aggregate, citable | weak for any individual dog |
| **Client documents** | specific to this dog | provenance unverifiable; lab quality varies; interpretation contested |
| **Dog's own logged data** | strongest evidence about *this* dog | statistically weak alone; confounded |

They are never summed into one number. A recommendation shows which signals
contributed and how, or it shows none.

`dog_ingredient_suspects` already models the third correctly — "inference layer only,
must never be used as a hard filter, not a diagnosis." That rule extends to all
three.

---

## 8. Runtime decision path

No model. One query shape.

1. Build the dog's profile: restrictions, health conditions, life stage, and
   findings from `dog_document_findings`.
2. Join `research_claims` where `status = 'active'` and the claim's subject matches
   an ingredient or nutrient present in (or absent from) the food, and
   `applies_to_condition` matches a condition the dog has.
3. Surface matched claims as **reasons**, each with its `effect_summary`,
   `evidence_grade` and a link to the source document.
4. Claims may **inform ranking**. They may not hard-filter. The only hard filters
   remain: a named ingredient matching a recorded restriction, and vet-approved
   `condition_contraindications`.

A recommendation should be able to say: *"Contains hydrolysed protein. Research
grade B suggests this may help dogs with food-responsive enteropathy — [source].
Discuss with your vet."* And it should be able to show exactly which row that came
from.

---

## 9. Cost model

- **Ingestion + claim drafting:** offline, batched, weekly. Bounded by paper volume,
  not by user traffic.
- **Embeddings:** one-off per chunk.
- **Runtime:** zero model cost. SQL only.
- **Re-scoring:** only when a claim changes status or a food's composition changes.

This is the property that makes the layer affordable on a self-funded project. A
live-RAG design would scale cost with users; this one does not.

---

## 10. Regulatory boundary

Diagnosis and treatment of disease in animals is reserved to veterinary surgeons
under the Veterinary Surgeons Act 1966. A tool that reads a gut biome panel and
directs a diet for a diagnosed condition approaches that line.

Structural consequences, not wording choices:

- No claim output is phrased as an instruction. Language is `may`, `is associated
  with`, `research suggests`.
- Every claim-driven statement carries its evidence grade and source.
- Every claim-driven statement carries a "discuss with your vet" prompt.
- Claims never hard-filter. Only recorded restrictions and vet-approved
  contraindications do.
- `condition_contraindications` stays human/vet-authored. It has 0 approved rows
  today; that table is the only place clinical gating is permitted, and it must not
  be machine-populated.

*Not legal advice. Worth a solicitor's view before launch given the client-facing
health context.*

---

## 11. Client document extraction

### 11.1 Doctrine

**One reconnaissance pass per lab, emitting a reusable parser.** Identical to the
domain-selector pattern already proven on food sites: a human-supervised pass over a
real report produces selectors and field maps; those run thereafter with no model
involved. A model never parses a client report at runtime.

Consequences:

- A lab format that has not had a recon pass is **not accepted**. The upload is
  stored, `processing_status = 'unsupported_lab'`, and the owner is alerted. It is
  never guessed at.
- Every extracted finding stores `verbatim_source_text`. If a value cannot be
  pointed at in the document text, it is not written.
- Never repair a name by inference. Never infer a missing value.

### 11.2 Profiled labs

Two real reports reviewed 2026-07-28.

**Biome4Pets Ltd — fully extractable.**

Values sit in the text layer as labelled numbers, with reference ranges printed
alongside. Both the value and its interpretation band are verbatim-traceable.

```
Bacteroidetes: 37.4%   Fusobacteria: 32.3%   Firmicutes: 23.2%
Proteobacteria: 6.1%   Bacteroidales: 37%    Clostridia: 20%   Prevotella: 14%
Shannon Diversity Score: 2.9    bands: Low (<1.9)  Medium (1.9–2.5)  High (>2.5)
Species Richness: 258           bands: Low (<400)  Moderate (400–650)  Healthy (>650)
Dysbiosis Pattern Score: 0.6
```

Also carries a narrative veterinary summary and a classification
(`Imbalanced (Level 2)`). Populates `reference_range` and `interpretation_flag`
directly from the document rather than by inference.

**BIOME9 (GutDiscovery®) — partial only.**

Health indicator scores are in the text layer and extractable
(`Carbohydrate digestion 14%`, `Fibre digestion 17%`, and further indicators for
lipid digestion, gut inflammation and immunity).

Phylum and genus abundances — the primary data — exist **only as bar charts**. The
text layer yields the 12 core genus names and the axis ticks
(`0 2 4 6 8 10 13 16 19 22 25 28`) and no per-genus values. Those numbers are not
recoverable from the PDF text.

*Handling:* extract indicators, mark abundances explicitly unavailable, set
`processing_status = 'partial'`. A half-read report must never present as complete.

### 11.3 Ligature loss — a real parsing trap

BIOME9's PDF drops `fi`/`ff`/`tt` ligatures on text extraction:

| extracted | actual |
|---|---|
| `Suerella` | `Sutterella` |
| `eiciency`, `eectively` | `efficiency`, `effectively` |
| `fay acids` | `fatty acids` |
| `dierent` | `different` |

A naive parser writes mangled organism names that silently fail to match any
reference vocabulary — and a silent mismatch is worse than a loud failure.

**Rule:** normalise every extracted organism name against a canonical genus and
phylum vocabulary. Fuzzy-match to suggest, never to auto-accept. Anything unmatched
goes to owner review with the raw string preserved. Do not repair by inference.

### 11.4 Status values

`pending` → `extracted` (all expected fields captured) | `partial` (some fields
unavailable by format, recorded as unavailable) | `needs_review` (unmatched names or
failed assertions) | `unsupported_lab` | `failed`.

### 11.5 Onboarding a new lab

1. Owner supplies one real report from that lab.
2. Recon pass: map fields, identify which values are text-layer versus chart-only,
   record ligature or encoding quirks.
3. Emit a parser + field map, committed to the repo, versioned by lab.
4. Assertion suite: parse the sample report, confirm every extracted value is a
   literal substring of the document text.
5. Only then is that lab accepted at upload.

### 11.6 A note on lab interpretation

Lab reports contain the lab's own conclusions and, frequently, product
recommendations tied to them. Store their findings; do not import their
interpretations as claims.

Lab conclusions enter `dog_document_findings` as **measurements**. Any causal
reading of those measurements must come from `research_claims`, graded per §5. A
lab's own narrative is commercially interested and carries no evidence grade — it is
not a source the claim layer accepts.

---

## 12. Open questions

1. **Full-text access.** Much veterinary research is paywalled. Abstracts alone
   support weaker claims. Is institutional or paid access available, or is the layer
   abstract-and-open-access only? This materially affects claim quality.
2. ~~**Biome lab formats.**~~ **Answered 2026-07-28** — see §11. Biome4Pets and
   BIOME9 profiled from real reports. Remaining sub-question: which *other* labs do
   clients use? Each needs its own recon pass before its reports are accepted.
3. **Corroboration threshold.** Auto-activation requires one corroborating claim.
   Is one enough, or two?
4. **Grade E claims.** Keep non-canine extrapolations as visible-but-flagged, or
   exclude them entirely?
5. **Seed corpus.** Which 20–30 papers should bootstrap the layer? Owner-selected
   seeds calibrate everything downstream.

---

## 13. Sequence

1. `dog_documents` + `dog_document_findings` tables, RLS, private bucket, upload UI.
   Store and display only — nothing reads them yet.
   *(Steps 1–2 are the scope for the first implementation session. See §14.)*
2. Biome4Pets parser (§11.2) — the fully-extractable format, so the pipeline is
   proven end to end on the easy case first. Then BIOME9 at `partial`.
3. `research_claims` table + admin review screen. No ingestion yet.
3. Manual seed: 20–30 owner-chosen papers ingested, chunked, embedded.
4. Claim drafting against the seed corpus. Owner reviews all of them — this
   calibrates the extractor and the grading.
5. Auto-activation rule enabled once drafting quality is proven on the seed.
6. Scheduled ingestion from the source allowlist.
7. Runtime join: claims surfaced as reasons on recommendations.
8. Document findings wired into the profile used at step 7.

---

## 14. Notes for an implementing agent

Written for an agent that has not seen this project before. Everything here is fact
verified against the live database, not assumption.

### 14.1 Stack

Next.js / TypeScript on Vercel (project `dog-food-helper`). Supabase Postgres 17
(project ref `ysffyuohwvdifvbopfcm`). Repo `Oxenhill/Dog_Food_Helper`.

### 14.2 Fixed constraints you cannot choose

- `research_chunks.embedding` is already **`vector(1536)`**. The embedding model is
  therefore pinned to a 1536-dimension model. Do not alter the column; other
  scaffolding assumes it.
- `pgvector` 0.8.2 and `pg_cron` 1.6.4 are installed. **`pg_net` is not** — nothing
  can make an outbound HTTP call from inside Postgres. Ingestion and embedding must
  run in an Edge Function or a Next.js route, not in a database function.
- `research_documents`, `research_chunks`, `research_score_cache` and
  `research_score_queue` already exist and are empty. Reuse them; do not recreate.
- `user_profiles.is_admin` is the admin flag. Verify it **server-side** on every
  request. Never trust a client-supplied admin claim.
- `contributed_foods` has RLS enabled with **zero policies** — a cautionary example.
  Client-side reads against it return nothing. Do not repeat that pattern: any new
  table gets explicit policies.

### 14.3 Project doctrine that governs this work

These are not stylistic preferences. Each was learned expensively.

1. **A model never authors a value that reaches the database.** A model may write an
   extractor or draft a claim for review. It may never be the thing that decides a
   stored value is correct.
2. **Verbatim or nothing.** Every `research_claims.supporting_quote` must be asserted
   a literal substring of its source chunk. Every `dog_document_findings` value must
   be a literal substring of the document text. Assertion failure discards the row —
   it never repairs it.
3. **Never infer a missing value.** Null is a legitimate, preferred answer.
4. **Two-run discipline on anything that writes.** Run 1 parses and prints what it
   would write, and writes nothing. The owner reviews. Run 2 commits.
5. **Raw HTML and raw PDFs never enter a model context.** Reduce first; assert the
   reduced text is under 8192 characters before any model sees it.
6. `food_ingredients.position_in_list` is **parent-scoped**, not a global rank.
   Children restart at 1 under each `parent_ingredient_id`. Any query touching it
   must project `parent_ingredient_id` alongside. This has caused three wrong
   diagnoses. Relevant when claims are matched against food composition.

### 14.4 Privacy boundary — non-negotiable

`dogs.owner_id` references `auth.users`. Everything keyed to it is permanently
private: `dogs`, all `dog_*` tables, `user_profiles`, `contributed_foods`.

`dog_documents` and `dog_document_findings` join that set. They must:

- be owner-scoped by RLS on `auth.uid() = owner_id`
- never appear in the `catalogue` schema or any view in it
- be added to the private-table list checked by `public.run_scheduled_assertions()`

A daily `pg_cron` job runs that assertion and writes failures to `system_alerts`. It
is live and it has caught a real boundary regression. Confirm your migration leaves
it passing.

Publishing anything keyed to `auth.users` would be a UK GDPR breach. This is the one
constraint with no acceptable trade-off.

### 14.5 Scope of the first session

**Sequence steps 1 and 2 only** (§13): the two document tables with RLS and a private
bucket, the upload UI, and the Biome4Pets parser.

Do **not** build in this session: `research_claims`, ingestion, embeddings, claim
drafting, or any change to recommendation, scoring or `hardFilter` code. Nothing
reads `dog_documents` yet.

### 14.6 Do not touch — parallel work in progress

Another agent is working in the same repository on food discovery. Avoid:

`manufacturer_targets`, `manufacturer_target_domains`, `manufacturer_entities`,
`terms_clause_patterns`, `crawl_targets`, `source_domain_allowlist`,
`contributed_foods`, `foods`, `food_ingredients`, the `catalogue` schema, the
`manufacturer-recon` Edge Function, and anything under `/admin` other than a new
route you create.

If your work appears to require touching any of these, stop and say so.

### 14.7 Reference material

Two real lab reports were reviewed to produce §11. The Biome4Pets format extracts
fully from the PDF text layer; BIOME9 does not — its abundance data exists only in
chart images. Build Biome4Pets first. Request the sample reports from the owner
before writing the parser; do not build against the field list in §11.2 alone.

Steps 1–2 are safe to build now. Step 4 is the quality gate for everything after it.
