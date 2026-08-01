# Research Layer Gate 4 — active claim runtime integration (2026-07-29)

## Status

Implementation, deterministic/live-data verification and authenticated
production UI verification are complete. The owner supplied an already
signed-in in-app browser session; no additional admin account or authentication
link was created.

No database migration was required or applied. No model or embedding call was
made during this gate. The required owner-side recommendation E2E created one
normal saved recommendation set for Ron.

## Outcome

The recommendation runtime now uses:

```text
dog profile + all candidate food detail
        ↓
bounded active-claim/document/chunk/condition reads
        ↓
deterministic structured matching in memory
        ↓
cited evidence on the matching recommendation
```

The request path no longer imports or calls chunk-level RAG, embedding
generation, the research score cache, or the research score queue. Historical
offline drafting and scoring code remains in the repository and is not a caller
of the recommendation route.

Research evidence is informational only in Gate 4. Every claim direction,
including `neutral`, has a ranking contribution of exactly zero. Recommendation
weights were not changed and no numeric strength was inferred from a grade.

## Pre-write verification

### Repository and shared worktree

- Required starting commit: `6f7d10e1586ef0d0dd506f6df43796a243a97e1e`.
- Initial HEAD was exactly that commit.
- A concurrent shared-worktree task subsequently advanced HEAD and
  `origin/main` to `f43e3174b5577eb7361c1d9f9ecb1bebbbb8bc1c`
  (`Improve mobile packet photo capture`).
- The new HEAD is descended from the required starting commit.
- The concurrent task's `src/lib/clientImageResize.ts` modification was left
  untouched; it was committed by that task before Gate 4 staging.

### Live claims

Exactly two claims existed:

| Claim | Status | Review | Subject | Direction |
|---|---|---|---|---|
| `43899f4f-b0a4-45d8-ae64-8a77f7ad73d9` | `active` | reviewer and timestamp present | `ingredient: green lentil` | `neutral` |
| `b9e6706a-3e50-4fd4-b220-ac70dc75f569` | `queued_for_review` | unreviewed | `nutrient: taurine` | `neutral` |

There were zero rejected claims and zero non-empty
`corroborating_claim_ids` arrays.

The active claim:

- identity:
  `6f268c891527a149e04d43a0b5a85ffa492a0b8ec0ff4766773564622fa18b70`;
- reviewer:
  `bcc4087f-c41a-42af-83ef-d97d35e4aea6`;
- reviewed at: `2026-07-29T11:57:30.393Z`;
- evidence scope: `canine_direct`;
- grade: B;
- grading metadata: incomplete (`sample_size` and
  `funding_independent` missing);
- access: abstract only;
- source title:
  `Longitudinal assessment of taurine and amino acid concentrations in dogs fed a green lentil diet.`;
- DOI: `10.1093/jas/skab315`;
- source:
  `https://pubmed.ncbi.nlm.nih.gov/34747447/`;
- document: pending review, not retracted, not superseded;
- chunk: present, belongs to the document, and still contains the supporting
  quote as an exact literal substring;
- condition/life-stage restrictions: none;
- corroborating claim IDs: empty.

The exact supporting quote is:

> the inclusion of 45% green lentil in extruded diets does not lower whole blood and plasma taurine concentrations during a 90-d period

Manual activation is therefore preserved: the evidence remains grade B,
incomplete and abstract-only rather than being silently strengthened.

### Genuine production food matches

The existing ingredient normalizer was extended with one narrow synonym group:

```text
green lentil = green lentils = whole green lentils
```

That produces exactly three structured food matches:

1. Acana Heritage Puppy & Junior —
   `9ee230ef-dec5-4e06-96cc-5cb19296859e`
2. Acana Pacifica Grain-Free —
   `089ead9a-a585-4c39-954f-451d96e033c6`
3. Acana Senior Dog —
   `4f363419-9736-4d0c-abcf-450ee9335953`

Generic lentils, red lentils, lentil fibre and green lentil fibre do not match.
The latest saved recommendation set for Harry already contained Acana Senior
Dog at rank 8, so a fresh result for that dog has a real route by which the
active evidence can become owner-visible if the food remains in the top ten.

The queued taurine claim would have structured additive matches in the
catalogue if it were active, but its status makes it ineligible before matching.

### Baseline request-time AI behaviour

Before Gate 4, every recommendation request called
`retrieveResearchFor(dog_id, 5)`, which:

- generated one Vercel AI Gateway embedding;
- ran `match_research_chunks` against approved-document chunks;
- built a research-score context;
- read `research_score_cache`;
- queued cache misses into `research_score_queue`.

This happened even when no approved evidence matched. There was no
request-time text-generation call, but there was one embedding call and
chunk-level RAG. Both score-cache and score-queue tables contained zero rows at
baseline.

### Protected baseline counts

| Table | Rows |
|---|---:|
| foods | 314 |
| food_ingredients | 1,369 |
| research_documents | 30 |
| research_chunks | 695 |
| research_topic_centroids | 88 |
| research_document_relevance | 2,282 |
| dog_documents | 1 |
| dog_document_findings | 11 |
| recommendation_scoring_weights | 1 |
| condition_contraindications | 0 |
| dog_recommendation_sets | 1 |
| research_score_cache | 0 |
| research_score_queue | 0 |
| manufacturer_targets | 108 |
| manufacturer_target_domains | 37 |
| manufacturer_entities | 3 |
| terms_clause_patterns | 7 |
| crawl_targets | 313 |
| source_domain_allowlist | 12 |
| contributed_foods | 27 |

## Implementation

### Active-claim retrieval

`src/lib/activeClaimRetrieval.ts` provides the server-side runtime and pure
matching functions.

The production loader performs four bounded reads, independent of the number
of candidate foods:

1. active, canine-direct, reviewed claims;
2. the dog's recorded conditions;
3. all referenced source documents in one `IN` query;
4. all referenced chunks in one `IN` query.

Documents and chunks are loaded concurrently after the claims are known.
Matching then runs in memory across the already-batched `food_full` candidate
map. There is no query inside a candidate-food loop.

Eligibility is reasserted in memory even after database filtering:

- status is exactly `active`;
- `reviewed_by` and `reviewed_at` are present;
- scope is `canine_direct`;
- document and chunk both exist;
- the chunk belongs to the claim's document;
- the document is not retracted or superseded;
- the supporting quote is non-empty and remains a literal substring;
- access is explicitly classified as abstract-only or open-access full text;
- populated condition/life-stage restrictions match the dog.

### Subject matching

- `ingredient`: exact canonical key equality across every composition,
  sub-ingredient and declared additive row. No substring matching.
- `nutrient`: an explicit object-owned allowlist maps known subjects to the
  eight real guaranteed-analysis columns, or to exact declared rows for taurine
  and L-carnitine. Arbitrary property names and dynamic column construction are
  impossible.
- `ingredient_class`: exact match through the existing
  `INGREDIENT_CATEGORIES` value/label taxonomy. Unknown classes report
  unsupported.
- `processing_method`: exact mapping to recorded `food_type` values only.
  `extruded` is deliberately unsupported rather than guessed to mean kibble.
- `biome_marker`: unsupported; it cannot match a food without a structured
  relationship.

Condition matching is normalized exact equality, not substring inference.
Growth maps only to a puppy profile; adult and senior map exactly; missing dog
life stage suppresses a restricted claim.

### Recommendation API

Each recommendation now carries `research_evidence`, preserving:

- claim ID and immutable identity;
- subject type and value;
- direction;
- cautious effect summary;
- exact supporting quote;
- evidence grade;
- grading metadata completeness;
- access type;
- source title, DOI and source URL.

The payload also reports:

```json
{
  "research_runtime": {
    "eligible_claim_count": 1,
    "unsupported_claim_count": 0,
    "ranking_effect": "none"
  }
}
```

The old request-time `research_context` chunk similarity output is removed.

### UI

Matching recommendation cards contain a responsive reviewed-evidence section
with:

- cautious effect summary;
- exact quote;
- source title and usable external link;
- DOI when present;
- evidence grade;
- complete/incomplete grading-metadata label;
- abstract-only label;
- direction;
- explicit text that the evidence is informational, does not affect the score,
  and is not veterinary advice.

Saved pre-Gate-4 payloads remain readable because the client treats a missing
`research_evidence` field as an empty array.

### Scoring boundary

`researchRankingResult()` always returns score zero for every direction and
grade. It only changes the explanatory sentence depending on whether a matching
active claim exists.

The recommendation weights table and code defaults are unchanged. There is no
supports bonus, cautions penalty, grade-to-number mapping or corroboration
inference.

Offline Gate 3 drafting and historical research score-worker files were not
deleted. Only the request-time route dependency was bypassed.

## Verification

### Focused Gate 4 regressions

Sixteen new tests cover:

- active ingredient evidence;
- active nutrient/additive evidence;
- queued, rejected and unreviewed suppression;
- retracted and superseded source suppression;
- missing document/chunk and non-literal quote suppression;
- condition and life-stage mismatch;
- canonical green-lentil matching;
- unrelated partial-name rejection;
- explicit ingredient-class taxonomy;
- recorded processing-method matching;
- unsupported processing methods and biome markers;
- incomplete grading metadata;
- abstract-only and open-access preservation;
- exact quote and source link propagation;
- zero ranking effect for all directions;
- fixed four-query retrieval across 100 candidates;
- defensive exclusion when an inactive row is returned by a data source;
- a source guard proving the recommendation route has no Gateway, embedding,
  RAG or research queue/cache dependency.

### Live read-only runtime check

The production module was executed against the live project and the three
identified food IDs for an existing adult dog.

Result:

- eligible active claims: 1;
- unsupported active claims: 0;
- all three expected foods received claim
  `43899f4f-b0a4-45d8-ae64-8a77f7ad73d9`;
- no other claim appeared.

### Full automated checks

- Full test suite: 247/247 passed.
- TypeScript: `tsc --noEmit` passed.
- Production build: `next build` exited 0 and compiled the recommendation API
  and dog page successfully.
- `next lint` could not run unattended because this repository has no ESLint
  configuration and the command opens Next.js's first-run setup prompt. The
  production build's built-in lint/type phase completed.

The build also printed the repository's pre-existing dynamic-route
static-analysis notices and sandbox network-denial messages, but completed with
exit code 0.

### Post-implementation database state

The exact live state remains:

- active: 1;
- queued for review: 1;
- rejected: 0;
- reviewed: 1;
- non-empty corroboration: 0.

Both claim statuses, reviewer IDs, review timestamps, update timestamps and
empty corroboration arrays are unchanged. Every protected research/source,
scoring, hard-filter, client-document and section-14.6 table count exactly
matches the pre-write baseline. In particular:

- score cache and queue remain empty;
- no source document, chunk, centroid, relevance, dog document, dog finding,
  weight, contraindication, food or ingredient row changed.

`dog_recommendation_sets` increased from 1 to 2 because the explicitly required
authenticated recommendation flow generated and saved Ron's result. The new
set is `7cb693a1-322f-412d-b0da-b3682d41efb1`, generated at
`2026-07-29T12:53:36.024Z`. It contains 10 recommendations and reports:

```json
{
  "research_runtime": {
    "eligible_claim_count": 1,
    "unsupported_claim_count": 0,
    "ranking_effect": "none"
  }
}
```

Only Acana Senior Dog carries research evidence in that payload. Its
`research_relevance` is `0`, and the attached claim ID is the active claim
`43899f4f-b0a4-45d8-ae64-8a77f7ad73d9`. The queued claim does not appear.

### Supabase advisors

Advisors were run after implementation:

- security: 20 existing findings (13 info, 5 warning, 2 error);
- performance: 53 existing findings (40 info, 13 warning).

No migration was applied, and no finding was introduced by Gate 4. The existing
advisor backlog remains outside this gate.

### Authenticated UI verification

The owner supplied a signed-in production session. No additional admin account
was required or created.

Admin verification at `/admin/research` confirmed:

- the green-lentil claim appears under Active with its exact quote, neutral
  direction, grade B, incomplete-grading label, abstract-only label, title, DOI
  and PubMed link;
- the taurine claim appears under Queued with its real
  `queued_for_review` status, grade D, complete-grading label, open-access label
  and exact source quote;
- no review action or claim mutation was performed.

Owner verification used Ron's dog page, not the admin screen. A fresh
recommendation request returned Acana Senior Dog at rank 8 with the approved
green-lentil evidence. The other nine foods showed the explicit no-match
message and no evidence card. The active card displayed:

- the cautious effect summary and exact supporting quote;
- grade B, neutral direction, incomplete grading metadata and abstract-only
  status;
- the source title, DOI and a working link to the expected PubMed record;
- the informational-only, zero-score and not-veterinary-advice statements.

The PubMed target resolved successfully. The evidence layout remained readable
at 1440×900 and 390×844, with no horizontal evidence-card overflow, and browser
console error/warning logs were empty.

Ron’s page separately displayed an existing Lab reports/documents error
(`Unexpected token '<', "<!DOCTYPE "... is not valid JSON`). It was present
outside the recommendation evidence flow, produced no console log entry during
the Gate 4 request, and was left untouched as an unrelated issue in the shared
worktree.

## What is usable in production

In production, the reviewed green-lentil claim is deterministically usable as
cited, zero-weight evidence on the three identified Acana foods whenever one
appears in the returned top ten for a compatible dog. The authenticated Ron
flow proves the complete production path: Acana Senior Dog appeared at rank 8
with the active evidence, exact citation and honest metadata labels.

The queued taurine claim is not usable and cannot leak, even though catalogue
foods have matching taurine additive rows.

Unknown ingredient classes, unrecorded processing concepts and biome markers
have no production food match and are reported unsupported instead of guessed.

## What remains before evidence may influence ranking

A separately reviewed scoring policy is still required. At minimum it must
define:

- which directions may affect ranking;
- how multiple independent claims establish corroboration;
- how access limitations and incomplete grading metadata constrain use;
- whether and how evidence grade can affect confidence without inventing
  numeric strength;
- veterinary/clinical review of any bonus or penalty policy;
- tests preventing one claim, neutral evidence, abstract-only evidence or
  manually activated incomplete evidence from being over-weighted.

Gate 4 intentionally implements none of those ranking decisions.

## Research Brain continuation — local implementation checkpoint (2026-07-30)

### Status

Owner edit-before-approval, source-paper display, and the requested runtime
integration coverage are implemented and locally verified. The edit RPC and
its related foreign-key index are live. The owner explicitly authorised the
bounded quality-audit cleanup on 2026-08-01; it completed transactionally and
preserved every ingestion job and its audit trail. No literature was approved.

### Repository verification

- Branch: `codex/mobile-pack-capture`.
- Starting continuation HEAD: `7f89bf41bbf3ea6b5893f94abd7a7becc03bd675`
  (`Checkpoint in-app research brain workflow`).
- `313b973c48e38e797df0f09467f99f50cd511410` and Gate 4 starting commit
  `6f7d10e1586ef0d0dd506f6df43796a243a97e1e` are both ancestors.
- Refreshed `origin/main` remains an ancestor of the branch; the branch is one
  local checkpoint commit ahead.
- The pre-existing uncommitted Behive assessment in
  `docs/research-brain-handoff-2026-07-29.md` was preserved and not folded into
  implementation edits.
- Live migration history contains
  `research_brain_workflow` and `research_cluster_review_transaction` exactly
  once. Neither was reapplied.

### Queued-cluster quality audit

The read-only live audit found exactly 40 queued, unreviewed clusters containing
42 queued source claims:

| Subject type | Clusters |
|---|---:|
| ingredient | 17 |
| nutrient | 3 |
| processing method | 20 |

| Direction | Clusters |
|---|---:|
| supports | 22 |
| cautions against | 11 |
| neutral | 5 |
| insufficient evidence | 2 |

Context/member distribution:

- 16 clusters have no applicability context and therefore remain suppressed by
  runtime logic;
- 22 have one required context;
- 2 have two required contexts;
- 38 have one source claim;
- 2 have two source claims;
- no cluster is active or reviewed.

Nineteen fresh queued clusters were demonstrably mis-taxonomised:

- 2 chronic-enteropathy propositions labelled `cooked` even though the quoted
  intervention is an elimination/therapeutic/antigen-restricted diet;
- 6 cobalamin propositions whose quotes establish food cobalamin content but
  whose measured outcome was drafted as serum cobalamin concentration;
- 7 diabetic-dog propositions labelled `cooked` although the quotes compare a
  homemade diet with a commercial diet and do not establish cooking as the
  intervention;
- 1 antibiotic/dysbiosis proposition labelled `cooked`;
- 1 acidic-urine/urolith proposition labelled `kibble`;
- 2 hydrolysis propositions labelled `cooked`.

Immediately before deletion, the scope was requeried and all 19 clusters were
still fresh, queued, unreviewed, and attached only to the recorded population
jobs. With explicit owner approval, one guarded transaction removed the 19
clusters, their 20 isolated queued claims, and 20 claim embeddings. It
preserved all 19 job rows and appended 19 deterministic discard records across
the six affected jobs' `result_summary` values. Post-transaction checks found
zero target clusters and no affected claim or embedding residue. Existing
reviewed and legacy claims were outside the transaction.

### Owner edit-before-approval

`supabase/migrations/20260730120629_edit_research_evidence_cluster.sql`
defines the transactional edit boundary:

- only `draft`/`queued_for_review`, unreviewed clusters can be edited;
- an expected `updated_at` value prevents stale writes;
- the proposition identity and label are recomputed server-side;
- identity collisions are rejected rather than merged silently;
- all applicability rows are replaced in the same transaction;
- report-field and life-stage contexts are allowlisted;
- the last authenticated admin editor and edit time are recorded separately
  from review metadata;
- execution is revoked from `public`, `anon`, and `authenticated`, and granted
  only to `service_role`.

`src/lib/researchEvidenceReview.ts` centralises the runtime-aligned subject,
direction, outcome, processing-method, nutrient, report-field, and life-stage
validation. Biome markers cannot become food subjects, combined ingredients
are rejected, summaries must remain one cautious sentence, and advice or
certainty wording is rejected.

`src/app/api/admin/research/processing/route.ts` validates an authenticated
admin edit, computes the collision-safe identity, and calls the transaction.
It also attaches each claim's source document to the cluster response.

`src/components/ResearchKnowledgeAdmin.tsx` now provides:

- editable subject type/value;
- editable measured outcome type/value;
- editable direction and cautious summary;
- add/remove editing for up to eight required applicability contexts;
- explicit warning that a no-context cluster remains runtime-suppressed;
- source paper title, honest access type, usable link, grade metadata, and
  literal quote in every review card;
- separate save and approve actions, with saved edits remaining inactive.

Active, rejected, and superseded clusters never appear in the edit surface.
Approval and rejection continue to use the existing separate review
transaction.

### Runtime integration coverage

The expanded tests now cover:

- an active reviewed cluster plus an accepted dog finding appears;
- queued and rejected clusters do not appear;
- an active claim in an inactive or unreviewed cluster does not appear;
- a no-context cluster is suppressed;
- an uncertain dog finding is suppressed;
- exact quote, source title/link, and access status reach the response;
- `uploaded_full_text_private` is preserved;
- the recommendation runtime imports no Gateway, drafting, embedding, RAG,
  cache, or queue dependency;
- all ten bounded data-source reads occur once across 100 food candidates,
  with no per-food query;
- neutral and every other evidence direction retain zero ranking effect;
- edit identity/allowlists/cautious-summary rules are deterministic;
- the edit transaction retains queued-only, concurrency, collision, atomic
  applicability, editor-metadata, and service-role guards.

### Local verification

- Full test suite: 271/271 passed.
- TypeScript: `tsc --noEmit` passed.
- Production build: `next build` exited 0.
- `git diff --check` passed apart from expected line-ending warnings.
- The build emitted the repository's existing dynamic-route static-analysis
  diagnostics but completed successfully.

### Live migration, rollback, advisors, and invariants (2026-08-01)

- Live migration history now records `edit_research_evidence_cluster` and
  `index_research_cluster_last_editor` exactly once, in addition to the two
  previously applied Research Brain migrations.
- A transactionally rolled-back live exercise proved that a valid queued edit
  succeeds while stale writes, active-cluster edits, the excluded
  `Bacteriodetes` report context, and identity collisions fail. The rollback
  left cluster and review state unchanged.
- Security advisor: 20 existing findings (13 info, 5 warning, 2 error) and no
  Research Brain edit finding. The unrelated existing RLS-disabled errors are
  `manufacturer_entities` and `terms_clause_patterns`; remediation:
  [Supabase RLS-disabled linter guidance](https://supabase.com/docs/guides/database/database-linter?lint=0013_rls_disabled_in_public).
- Performance advisor: 66 existing findings (53 info, 13 warning). The
  follow-up refresh recognises the edit migration's `last_edited_by` covering
  index: it is no longer reported as an unindexed foreign key and appears only
  as a new, not-yet-used index. Existing unindexed-FK remediation reference:
  [Supabase unindexed-FK guidance](https://supabase.com/docs/guides/database/database-linter?lint=0001_unindexed_foreign_keys).
- After the authorised cleanup, claims are exactly 1 active and 23 queued;
  clusters are exactly 21 queued and none reviewed or active. Both legacy
  claims retain their exact
  status, reviewer, review timestamp, note, and update timestamp. All
  `corroborating_claim_ids` arrays remain empty.
- Protected corpus counts remain 30 documents, 695 chunks, 88 centroids, and
  2,282 relevance rows. Cache and queue remain empty. The background workflow
  has 19 job audits, 21 clusters, 22 memberships, 12 applicability rows, and
  368 Voyage embeddings (346 chunks and 22 queued claims). Six jobs retain the
  19 quality-audit discard records.
- Lenny remains one `partial` Biome4Pets document with 11 findings: 10
  `accepted` and the `Bacteriodetes` typo still `needs_review` and excluded.

### Production deployment and owner scope calibration (2026-08-01)

- Commit `72296c3` was pushed to `main`; Vercel reported success and the
  production footer served the same commit.
- The authenticated admin research page loaded the ingestion controls, 21
  queued proposition cards, edit-before-review controls, exact quotes, honest
  access labels, source-paper titles, and working PubMed links. Nothing was
  approved.
- During that review, the owner identified Salmonella contamination cards as
  outside Bowl's purpose: they measured a manufacturing/product-sample issue,
  not how an individual dog responds to chicken or another candidate food.
- The same rule identified seven out-of-scope queued propositions: four food
  contamination/pathogen cards, two category-level label-accuracy cards, and
  one ingredient composition-variability card. The authenticated owner review
  rejected all seven with explicit scope notes; the records remain auditable.
- Live state is now 14 queued and 7 rejected clusters; claims are 1 active, 16
  queued, and 7 rejected. Existing corroboration remains empty.
- `enforce_research_decision_scope` is live. Its database constraint preserves
  rejected audit rows but prevents contamination, manufacturing, labelling,
  recall, and composition-audit outcomes from being draft, queued, or active.
  A live exception-handled test confirmed a queued contamination update is
  refused without changing the row.
- Background drafting now requires a tested food exposure and a clinical,
  biological, digestibility/nutrient-status, behavioural, or performance
  outcome measured in dogs. Incidental ingredients and food-product audits are
  deterministically rejected. The same shared rule also blocks owner edits and
  approval requests, and the admin UI explains the boundary.
- Updated verification: 275/275 tests, TypeScript, production build, and
  `git diff --check` all pass.

The scope correction still needs to be committed, pushed, deployed, and
rechecked in the authenticated desktop/mobile browser. Lenny's owner report
and the final matching/nonmatching recommendation checks remain pending for
that production pass.
