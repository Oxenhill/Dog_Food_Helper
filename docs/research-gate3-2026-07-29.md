# UI UNVERIFIED — Research Layer Gate 3 drafting run 1 (2026-07-29)

The production research-admin route redirected to `/signin`. No authenticated
test-admin session was available, so the review screen's display of queued
claims and exact quotes was not observed. Intended behavior seen in source code
is not presented as UI verification.

## Outcome

Gate 3 drafting run 1 is complete for Supabase project
`ysffyuohwvdifvbopfcm`.

- Eight bounded offline drafting calls used Vercel AI Gateway only, with
  Gateway-qualified model `anthropic/claude-sonnet-5`.
- Five structured proposals were returned. Strict review retained two and
  discarded three; two other calls returned null and one failed at the output
  limit without returning JSON.
- The owner approved exactly two immutable claim identities and the
  deterministic identity migration.
- Two claims were inserted as `queued_for_review`. Zero claims were approved or
  activated.
- The immediate repeat inserted zero rows and reported two exact skips.
- `corroborating_claim_ids` is empty for both claims. The similar taurine
  propositions are a review cluster only; independent corroboration is not
  asserted.

This gate stops before claim approval, activation, auto-activation,
corroboration-driven activation, scoring, recommendations or runtime
integration.

## What was built

- Bounded Gate 3 drafting and deterministic validation code:
  `src/lib/researchGate3.ts` and `scripts/researchGate3Run.ts`.
- Immutable pre-cost, drafting-amendment, owner-review, proposed-claim and
  owner-approval manifests under `docs/`.
- A repeatable approved-manifest insertion runner:
  `src/lib/researchGate3Database.ts` and `scripts/researchGate3Insert.ts`.
- Migration `20260729114208_research_claim_identity.sql`, adding:
  - required `claim_identity text`;
  - a 64-character lowercase hexadecimal check;
  - a unique constraint.
- The admin claim response includes `claim_identity`; no review or activation
  behavior was changed.

The identity is application-generated SHA-256 over the exact document ID,
chunk ID, supporting quote and normalized proposition. Owner approval is bound
to proposed-manifest SHA-256
`8ba2231ee4ec1d2b07d5bdc380c44c5ba74c3248cccbc255160cbdb49bd3b343`.

## Drafting execution and cost

| Measure | Actual |
|---|---:|
| Gateway requests | 8 |
| SDK retries | 0 |
| Input tokens | 13,081 |
| Output tokens | 1,453 |
| Total tokens | 14,534 |
| Reasoning tokens | 577 |
| Catalogue-calculated inference cost | $0.040692 |
| Accounted cost including tagged-request charges | $0.041142 |
| Approved amended ceiling | $0.060000 |

Calls were sequential and offline. Every model input was reduced to one selected
chunk and was at most 8,192 characters. No raw HTML, XML or complete paper was
sent. The model authored only the seven permitted claim fields; bibliographic,
access, grading, funding and scope metadata remained deterministic source data.
No direct model-provider API and no request-time AI path was used.

Raw Gateway output remains in ignored `.research-gate3/` files. The raw result
SHA-256 is
`222851b97800cdfb49deed9094b25f83caf5f15dd629fd2b934c5bb91dcf3939`;
the machine-validated result SHA-256 is
`458b969773bdfed8942658906f4a77e1afd7e6c49dee06dcf1c6b401d7d8f76e`.

## Inserted claims

### PMID 34747447 — green lentil and taurine

- Claim ID: `43899f4f-b0a4-45d8-ae64-8a77f7ad73d9`
- Identity:
  `6f268c891527a149e04d43a0b5a85ffa492a0b8ec0ff4766773564622fa18b70`
- Document: `cba3a7f2-4e51-43f3-9557-25abd87ee1e6`
- Chunk: `440c468b-9071-4bdf-a19e-35afed66594f`, index 2
- DOI: `10.1093/jas/skab315`
- Exact quote: “the inclusion of 45% green lentil in extruded diets does not
  lower whole blood and plasma taurine concentrations during a 90-d period”
- Subject/direction: `ingredient` / `green lentil` / `neutral`
- Effect: “The study found that including 45% green lentil in extruded diets
  did not lower whole blood and plasma taurine concentrations in dogs over a
  90-day period.”
- Group/scope/grade: E / `canine_direct` / B
- Access: abstract-only
- Grading: incomplete; `sample_size` and `funding_independent` are missing
- Funding: unknown (`null`)
- Status: `queued_for_review`; unreviewed; non-active
- Restriction: abstract-derived and never eligible for unattended activation

### PMID 36482834 — traditional and nontraditional diets

- Claim ID: `b9e6706a-3e50-4fd4-b220-ac70dc75f569`
- Identity:
  `bd42395624e9196a728db76260d9e67c977e4192505cc4bfac084c6a2b638fb3`
- Document: `5003c891-f4e8-43ae-9bfa-449b79a411fe`
- Chunk: `b4852480-303e-4897-9173-dbf2119fd9fb`, index 20
- DOI: `10.1111/jvim.16606`
- Exact quote: “Neither whole blood nor plasma taurine concentrations were
  significantly different between diet groups in the current study.”
- Subject/direction: `nutrient` / `taurine` / `neutral`
- Effect: “The study found no significant difference in whole blood or plasma
  taurine concentrations between dogs eating nontraditional versus traditional
  diets.”
- Group/scope/grade: E / `canine_direct` / D
- Access: OA full text
- Grading: complete
- Funding: declaration present; stored `funding_independent = false`
- Status: `queued_for_review`; unreviewed; non-active

Missing metadata remains separate from evidence weakness: the incomplete
abstract claim is Grade B, while the complete OA claim is Grade D.

## Drafting dispositions and insertion accounting

Drafting outcomes:

- retained for owner review and inserted: 2;
- semantically unsafe proposals discarded: 3;
- model nulls discarded: 2;
- output-limit failure discarded without retry: 1;
- total discarded outcomes: 6.

The three unsafe proposals were rejected because two quoted author
recommendations instead of direct measured results, and one strengthened a
non-directional association into “higher anxiety scores.” Quotes and summaries
were never repaired automatically.

Initial approved insertion:

- inserted: 2;
- updated: 0;
- skipped: 0;
- exact duplicates removed before insertion: 0;
- approved cap: 2.

Immediate immutable-manifest repeat:

- inserted: 0;
- updated: 0;
- exact skips: 2;
- other deduplication: 0.

## Live claim counts

| Dimension | Value | Count |
|---|---|---:|
| Document | `5003c891-f4e8-43ae-9bfa-449b79a411fe` | 1 |
| Document | `cba3a7f2-4e51-43f3-9557-25abd87ee1e6` | 1 |
| Group | E | 2 |
| Direction | `neutral` | 2 |
| Grade | B | 1 |
| Grade | D | 1 |
| Scope | `canine_direct` | 2 |
| Status | `queued_for_review` | 2 |

## Post-insertion database verification

Live invariants:

- `research_claims=2`: queued 2, active 0, reviewed 0.
- Literal-quote failures: 0.
- Chunk/document relationship failures: 0.
- Source/grading metadata mismatches: 0.
- Non-empty corroborating arrays: 0.
- Grade E claims: 0.
- Non-canine claims: 0.
- Group G claims: 0.
- Preprint claims: 0.
- All 30 documents remain `pending`; no source document was updated.
- Corpus remains 30 documents, 695 chunks, 88 centroids and 2,282 relevance
  rows.
- Invalid 1,536-dimension chunk or centroid embeddings: 0.
- Relevance centroid-version or embedding-model mismatches: 0.
- Reproduced top-five plus 0.35 eligibility count remains 384.

Group G methodology did not become a biological claim and remains excluded
from biological scoring, recommendation, corroboration and activation.

Protected counts remain identical to the Gate 2 baseline:

| Table | Gate 2 | After Gate 3 |
|---|---:|---:|
| `dog_documents` | 1 | 1 |
| `dog_document_findings` | 11 | 11 |
| `recommendation_scoring_weights` | 1 | 1 |
| `condition_contraindications` | 0 | 0 |
| `dog_recommendation_sets` | 1 | 1 |
| `research_score_cache` | 0 | 0 |
| `research_score_queue` | 0 | 0 |
| `manufacturer_targets` | 108 | 108 |
| `manufacturer_target_domains` | 37 | 37 |
| `manufacturer_entities` | 3 | 3 |
| `terms_clause_patterns` | 7 | 7 |
| `crawl_targets` | 313 | 313 |
| `source_domain_allowlist` | 12 | 12 |
| `contributed_foods` | 27 | 27 |
| `foods` | 314 | 314 |
| `food_ingredients` | 1,369 | 1,369 |

No recommendation, scoring, hard-filter, client-document or section-14.6
table was changed. No runtime claim consumer or live/request-time AI path was
added.

## Advisors and application verification

- Supabase security advisor: 20 findings before and 20 after; no new or resolved
  finding.
- Supabase performance advisor: 53 findings before and 53 after; no new or
  resolved finding.
- The two pre-existing security ERROR findings remain disabled RLS on
  `manufacturer_entities` and `terms_clause_patterns`. They were not modified
  in this gate. Remediation requires a separately reviewed RLS policy design;
  see the [Supabase database linter
  guide](https://supabase.com/docs/guides/database/database-linter).
- Complete tests: 227 passed, 0 failed.
- Type checking: `tsc --noEmit` passed.
- Production build: passed with exit 0 under Next.js 14.2.35. Existing
  request-header-dependent dynamic-route messages remained non-fatal.
- Authenticated UI: **UI UNVERIFIED**, as stated at the top.

## Stop

Gate 3 drafting run 1 is complete. The two claims are awaiting human review in
`queued_for_review`. No claim has been approved, activated, treated as
corroborated or connected to scoring or recommendations. Do not begin a later
activation or runtime-integration gate from this report.
