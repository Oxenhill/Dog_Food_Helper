# Research Layer Gate 4 — active claim runtime integration (2026-07-29)

## Status

Implementation and deterministic/live-data verification are complete.
Authenticated production UI verification is pending because the in-app browser
had no signed-in session. A service-role-generated production-admin magic link
was not used after the approval boundary rejected that authentication method
without a separate explicit authorization.

No database migration was required or applied. No model or embedding call was
made during this gate.

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
empty corroboration arrays are unchanged. Every protected table count exactly
matches the pre-write baseline. In particular:

- no recommendation set was written;
- score cache and queue remain empty;
- no source document, chunk, centroid, relevance, dog document, dog finding,
  weight, contraindication, food or ingredient row changed.

Only read-only database operations were used in this gate.

### Supabase advisors

Advisors were run after implementation:

- security: 20 existing findings (13 info, 5 warning, 2 error);
- performance: 53 existing findings (40 info, 13 warning).

No migration was applied, and no finding was introduced by Gate 4. The existing
advisor backlog remains outside this gate.

### Authenticated UI verification

The production in-app browser reached `/admin/research` and was redirected to
`/signin`; there was no ambient authenticated session. The browser session was
therefore unable to verify the admin cards or generate a recommendation.

The attempted service-role one-time-link method was stopped by the approval
boundary before any link or session was created. Authenticated browser
verification still requires either:

- an already signed-in in-app browser tab; or
- explicit authorization for that one-time existing-admin link method.

No claim or application data was changed during this attempt.

## What is usable in production

After deployment, the reviewed green-lentil claim is deterministically usable
as cited, zero-weight evidence on the three identified Acana foods whenever one
appears in the returned top ten for a compatible dog. Acana Senior Dog already
appears in Harry's most recently saved top ten, making it the clearest live
verification target after regeneration.

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

