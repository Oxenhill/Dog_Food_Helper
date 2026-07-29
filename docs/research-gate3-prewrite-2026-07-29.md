UI UNVERIFIED

# Research Layer Gate 3 — pre-write and pre-cost review

Date: 2026-07-29
Scope: claim drafting run 1 only
Status: awaiting explicit owner approval; no paid AI call and no database write have been made

## Gate result

The Gate 2 corpus remains intact and the first Gate 3 drafting run can be bounded to eight source chunks from eight documents. The exact proposal is frozen in `docs/research-gate3-proposed-drafting-manifest-2026-07-29.json`.

This checkpoint does not authorize drafting, claim insertion, approval, activation, corroboration, scoring, recommendation integration, or request-time AI.

## Repository and shared-worktree verification

- Required starting commit: `a347f3c92de441f1eacf2e789669e75e28df48ac`.
- At the start of this check, local `HEAD`, cached `origin/main`, and live `origin/main` all equalled the required starting commit.
- While the check was in progress, the unrelated shared task committed and pushed `57152845d44e2c2ce607aa8d3aa2af0cdce0eec0` to `main`. It is a direct child of the required starting commit.
- Live `origin/main`, local `main`, and `HEAD` now all equal `57152845d44e2c2ce607aa8d3aa2af0cdce0eec0`.
- The unrelated task's changes were not cleaned, reset, stashed, overwritten, staged, or amended by Gate 3.
- The working tree was clean immediately before these two Gate 3 proposal files were added.

## Live Gate 2 re-verification

| Invariant | Live result |
|---|---:|
| `research_documents` | 30 |
| `research_chunks` | 695 |
| `research_claims` | 0 |
| `research_topic_centroids` | 88 |
| `research_document_relevance` | 2,282 |
| OA full text / abstract only | 24 / 6 |
| Grades A / B / C / D / E | 3 / 4 / 0 / 23 / 0 |
| Grading complete / incomplete | 27 / 3 |
| Canine direct / methodology | 28 / 2 |
| Pending documents | 30 |
| Non-pending documents | 0 |
| Null chunk embeddings | 0 |
| Non-1,536-dimensional chunk embeddings | 0 |
| Duplicate document/chunk indexes | 0 |
| Chunk-count metadata mismatches | 0 |
| Centroid model mismatches | 0 |
| Relevance model/version mismatches | 0 |
| Drafting-eligible document/topic pairs | 384 |

Every live document identifier, source-payload hash, plain-text hash, access type, chunk count, and ordered chunk-content hash was compared with `.research-gate2/plan.json`. All 30 documents and all 695 chunk texts matched exactly.

The 384 eligible pairs were independently reproduced from stored relevance rows using `topic_rank <= 5 AND similarity >= 0.35`. Coverage by group is A 84, B 60, C 70, D 78, E 52, F 34, and G 6.

The current relevance rows use `text-embedding-3-small`, and each row's centroid version matches the current stored version of its topic centroid.

## Admin UI

The production route `https://dog-food-helper.vercel.app/admin/research` was opened in the authenticated-capable in-app browser early in the gate. The available browser session was not signed in and the route displayed the sign-in screen. No authenticated test-admin session was available, so the review UI is not reported as observed.

Code inspection shows that the present review screen is intended to default to `queued_for_review` and render `supporting_quote`, chunk index, source, grade, completeness, funding, and access metadata. That is not a substitute for authenticated verification.

## Selection policy

The run deliberately does not draft all 384 eligible pairs.

1. Exclude Grade E, non-canine biological evidence, and Group G.
2. Cover biological groups A-F once each, using only canine-direct documents whose result can be represented by the current claim subject types.
3. Prefer complete OA evidence and the strongest stored evidence grade, then stored relevance.
4. For each selected document/topic, examine the eight chunks closest to the topic centroid and select the highest-similarity self-contained result chunk. Exclude headings, background-only text, raw methods, and non-self-contained tables.
5. Add two calibration cases: one complete abstract-only microbiome review and one incomplete abstract-only taurine RCT.
6. Cap the run at 8 documents, 8 chunks, 8 Gateway requests, and at most 8 claims, with one chunk and one possible claim per request.
7. Run sequentially with AI SDK retries disabled.

The selected mix is six OA full-text chunks and two abstract-only chunks; grades A 2, B 1, and D 5; grading-complete 7 and incomplete 1. All are `canine_direct`.

## Exact proposed drafting inputs

| Slot | PMID | Group/topic | Rank | Document similarity | Chunk | Chunk similarity | Access | Grade | Complete | Characters |
|---|---:|---|---:|---:|---|---:|---|---|---|---:|
| Coverage A | 25313818 | A / energy-requirements | 1 | 0.580538 | `0492b7f9-c0e2-4d17-9f68-0a0ad97e6c64` / 19 | 0.537807 | OA full text | A | yes | 1,605 |
| Coverage B | 34514619 | B / antibiotic-microbiome | 1 | 0.766645 | `bae9168c-7c7d-4026-b73e-d42d347334c0` / 22 | 0.766645 | OA full text | D | yes | 981 |
| Coverage C | 35264164 | C / undeclared-ingredients | 1 | 0.694039 | `10845aee-f230-456a-b280-a23ca2adec72` / 1 | 0.619300 | OA full text | D | yes | 1,036 |
| Coverage D | 36142319 | D / osteoarthritis | 1 | 0.590451 | `960240fe-133a-420a-b021-e71038c2fe1a` / 21 | 0.529164 | OA full text | A | yes | 974 |
| Coverage E | 36482834 | E / serum-taurine | 1 | 0.580440 | `b4852480-303e-4897-9173-dbf2119fd9fb` / 20 | 0.466250 | OA full text | D | yes | 1,546 |
| Coverage F | 40624095 | F / gut-brain-anxiety | 1 | 0.623904 | `01d18f15-36a3-4de2-b843-df5a38ade90a` / 0 | 0.623904 | OA full text | D | yes | 1,724 |
| Abstract calibration | 33653538 | B / diet-microbiome | 1 | 0.648677 | `b09f963d-f52b-4b34-b34d-b684ddd5de43` / 0 | 0.648677 | Abstract | D | yes | 758 |
| Incomplete calibration | 34747447 | E / serum-taurine | 3 | 0.485574 | `440c468b-9071-4bdf-a19e-35afed66594f` / 2 | 0.466759 | Abstract | B | no | 233 |

The exact IDs, titles, DOIs, hashes, grading fields, funding fields, centroid versions, and per-request estimates are in the proposed manifest.

## Model and cost

The proposed Gateway-qualified model is `anthropic/claude-sonnet-5`, invoked through the Vercel AI Gateway using the AI SDK's Gateway model string. No Anthropic SDK, Anthropic key, or Anthropic endpoint will be used.

The choice favours reliable constrained extraction, literal-quote handling, and cautious semantic drafting over the cheapest possible model. The repository already uses this exact Gateway model for its offline research-scoring worker, so the route is compatible with the existing architecture.

The live Gateway catalogue contained 307 models when checked. It listed this model at $0.000002 per input token and $0.00001 per output token, with regional rates of $0.0000022 and $0.000011. Vercel states that Gateway token pricing has no markup and that the public catalogue is the current pricing source.

- 8 sequential Gateway requests.
- 6,537 estimated input tokens from 26,139 characters.
- 320 maximum output tokens per request; 2,560 maximum output tokens total.
- Estimated base ceiling: $0.038674.
- Estimated regional ceiling: $0.0425414.
- Requested authorization ceiling: $0.05.
- Longest modeled request: 3,891 characters, below the 8,192-character input limit.
- Actual input/output tokens and actual cost will be reported separately from these estimates.

No asynchronous Batch API was found in the current Vercel AI Gateway documentation. The proposed execution is therefore a controlled offline Gateway job with concurrency one, not a direct provider batch.

## Deterministic validation and review

The model may return only the seven permitted fields. Each request may return one claim or null. After drafting, the runner will:

- reject every quote that is not a literal substring of its exact stored chunk;
- reject unsupported population, proposition, direction, advice, over-generalisation, and invalid enum values;
- require one cautious plain-English sentence;
- copy source, access, grading, completeness, funding, and scope metadata deterministically;
- preserve nulls;
- deduplicate exact quotes and normalized propositions within a document;
- cluster likely cross-document proposition duplicates for owner review without asserting corroboration;
- write raw Gateway results and expanded temporary manifests only under an ignored Gate 3 working directory;
- present every accepted and discarded proposal before any claim write.

## Design gaps that block insertion

### Group G representation

`research_claims.subject_type` only represents ingredient, nutrient, ingredient class, processing method, or biome marker. It cannot accurately represent methodology appraisal. Group G is excluded from drafting and insertion rather than being forced into a biological schema.

### Safe idempotency

`research_claims` currently has no deterministic claim identity and no uniqueness constraint capable of making an approved insertion manifest safely repeatable. Application-level duplicate checks alone are not concurrency-safe.

The recommended later fix is a deterministic application-generated SHA-256 identity over the immutable canonical claim fields, backed by a database uniqueness constraint. No migration has been created or applied at this checkpoint. The exact migration and immutable approved claim manifest will be shown for the second owner approval before any schema or claim write.

### Review status

The existing admin contract uses `queued_for_review`, and the live enum also includes `queued`. Gate 3 will use `queued_for_review`; no claim will be active.

## Approval requested

Explicit approval is requested for:

1. the exact eight-input manifest;
2. `anthropic/claude-sonnet-5` through Vercel AI Gateway only;
3. eight sequential requests, no SDK retries, one possible claim per request;
4. a maximum estimated charge of $0.05;
5. deterministic validation and generation of a proposed immutable claim manifest only.

This approval would not authorize any database migration or claim insertion. After drafting and validation, Gate 3 will stop again and present every accepted and discarded proposal, actual token usage and cost, and the proposed idempotency migration for a second explicit owner decision.
