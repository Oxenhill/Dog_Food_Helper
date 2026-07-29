UI UNVERIFIED

# Research Layer Gate 3 — drafting run 1 owner review

Date: 2026-07-29
Status: awaiting explicit owner approval of the immutable claim list; no database write has occurred

## Outcome

Eight approved source chunks were sent sequentially to `anthropic/claude-sonnet-5` through Vercel AI Gateway only. No direct provider API, request-time AI path, database claim write, claim approval, activation, corroboration, scoring, or recommendation integration was used.

- Gateway requests: 8
- SDK retries: 0
- Structured model proposals: 5
- Model nulls: 2
- Generation failures: 1, discarded and not retried
- Machine-valid proposals: 5
- Proposals recommended after strict semantic review: 2
- Proposals discarded after semantic review: 3
- `research_claims` rows after drafting: 0

The immutable owner-review manifest is `docs/research-gate3-proposed-claims-2026-07-29.json`.

## Actual usage and cost

| Measure | Actual |
|---|---:|
| Input tokens | 13,081 |
| Output tokens | 1,453 |
| Total tokens | 14,534 |
| Reasoning tokens | 577 |
| Catalogue-calculated inference cost | $0.040692 |
| Gateway-reported cost for tagged calls 3–8 | $0.028358 |
| Catalogue-calculated cost for calls 1–2 | $0.012784 |
| Accounted total including tagged-request charges | $0.041142 |
| Approved amended ceiling | $0.060000 |

The first two calls predated request tags, so the Gateway did not return their exact per-generation cost metadata. Their cost is calculated from the Gateway-reported token counts and the live catalogue rates. Calls 3–8 include Gateway cost metadata; their $0.028358 includes $0.000450 total reporting-tag charges.

## Claims recommended for the review queue

These are recommendations for owner approval, not approved or active claims.

### Claim `bd423956…638fb3`

- Source: PMID 36482834; DOI `10.1111/jvim.16606`
- Title: *Comparison of echocardiographic measurements and cardiac biomarkers in healthy dogs eating nontraditional or traditional diets.*
- Group/topic: E / `serum-taurine`
- Relevance: topic rank 1; document 0.580440; chunk 0.466250
- Document: `5003c891-f4e8-43ae-9bfa-449b79a411fe`
- Chunk: `b4852480-303e-4897-9173-dbf2119fd9fb`, index 20
- Exact quote: “Neither whole blood nor plasma taurine concentrations were significantly different between diet groups in the current study.”
- Subject: `nutrient` / `taurine`
- Condition/life stage: null / null
- Direction: `neutral`
- Effect summary: “The study found no significant difference in whole blood or plasma taurine concentrations between dogs eating nontraditional versus traditional diets.”
- Access: OA full text
- Scope/grade: `canine_direct` / D
- Grading inputs: complete
- Funding: declaration present; stored `funding_independent = false`
- Validation: literal substring, exact chunk/document relationship, and bounded semantic proposition all passed
- Review cluster: `taurine-blood-plasma-no-lowering`

### Claim `6f268c89…18b70`

- Source: PMID 34747447; DOI `10.1093/jas/skab315`
- Title: *Longitudinal assessment of taurine and amino acid concentrations in dogs fed a green lentil diet.*
- Group/topic: E / `serum-taurine`
- Relevance: topic rank 3; document 0.485574; chunk 0.466759
- Document: `cba3a7f2-4e51-43f3-9557-25abd87ee1e6`
- Chunk: `440c468b-9071-4bdf-a19e-35afed66594f`, index 2
- Exact quote: “the inclusion of 45% green lentil in extruded diets does not lower whole blood and plasma taurine concentrations during a 90-d period”
- Subject: `ingredient` / `green lentil`
- Condition/life stage: null / null
- Direction: `neutral`
- Effect summary: “The study found that including 45% green lentil in extruded diets did not lower whole blood and plasma taurine concentrations in dogs over a 90-day period.”
- Access: abstract only
- Scope/grade: `canine_direct` / B
- Grading inputs: incomplete; `sample_size` and `funding_independent` missing
- Funding: unknown
- Validation: literal substring, exact chunk/document relationship, population, inclusion level, outcome, and duration passed
- Restriction: abstract-only and ineligible for unattended activation
- Review cluster: `taurine-blood-plasma-no-lowering`

The two taurine propositions are similar enough to be shown together for review. They are not asserted to be independent corroboration, and `corroborating_claim_ids` will remain empty.

## Discarded proposals and outcomes

### PMID 25313818 — no proposal

Group A / `energy-requirements`, rank 1, document similarity 0.580538, chunk `0492b7f9-c0e2-4d17-9f68-0a0ad97e6c64` index 19, chunk similarity 0.537807, OA full text, Grade A, complete grading, stored non-independent funding with no declaration text.

Rejection: the model returned null.

### PMID 34514619 — generation failure

Group B / `antibiotic-microbiome`, rank 1, document similarity 0.766645, chunk `bae9168c-7c7d-4026-b73e-d42d347334c0` index 22, chunk similarity 0.766645, OA full text, Grade D, complete grading, funding unknown.

Rejection: the original 320-token allowance was consumed by reasoning; no JSON object was produced. The request was not retried.

### PMID 35264164 — proposal discarded

- Exact quote: “The conducted research indicates that both dry and wet analyzed foods should not be recommended as a diagnostic tool in elimination tests, because it may result in false negative results.”
- Proposed subject/direction: `ingredient` / `chicken protein` / `cautions_against`
- Proposed effect: “The study found that undeclared chicken DNA contamination in commercial dog foods may compromise their use as a diagnostic tool in elimination diet trials.”
- Source: DOI `10.1186/s12917-022-03200-z`; Group C / `undeclared-ingredients`; rank 1; document 0.694039; chunk 0.619300; document `2bcd625d-f8b2-4bdc-9dfd-cb75c5949881`; chunk `10845aee-f230-456a-b280-a23ca2adec72` index 1; OA; Grade D; canine direct; complete grading; funding unknown.

Rejection: the exact quote is an author diagnostic recommendation, not a direct measured result. The effect summary reframes it as a contamination result that the exact quote does not substantively support. Automatic quote replacement is prohibited.

### PMID 36142319 — proposal discarded

- Exact quote: “This meta-analysis supports the use of omega-3 supplementation for the management of canine and feline OA.”
- Proposed subject/direction: `nutrient` / `omega-3 fatty acids` / `supports`
- Proposed effect: “The meta-analysis found that omega-3 supplementation was associated with improved management of osteoarthritis symptoms in dogs and cats.”
- Source: DOI `10.3390/ijms231810384`; Group D / `osteoarthritis`; rank 1; document 0.590451; chunk 0.529164; document `69706d08-bca0-470e-98e9-edeb881593dc`; chunk `960240fe-133a-420a-b021-e71038c2fe1a` index 21; OA; Grade A; canine direct; complete grading; funding unknown.

Rejection: the exact quote is an author management recommendation rather than a direct result, and the proposed effect adds “improved symptoms,” which is not stated in the exact quote. Automatic quote replacement is prohibited.

### PMID 40624095 — proposal discarded

- Exact quote: “The genus Blautia was identified consistently across analyses, suggesting a link between this genus and anxiety in pet dogs.”
- Proposed subject/direction: `biome_marker` / `Blautia` / `supports`
- Proposed effect: “The study found that the genus Blautia was consistently associated with higher anxiety scores in companion dogs.”
- Source: DOI `10.1038/s41598-025-06178-4`; Group F / `gut-brain-anxiety`; rank 1; document and chunk similarity 0.623904; document `ed05cfea-1e50-4b03-be95-4f46ec24af85`; chunk `01d18f15-36a3-4de2-b843-df5a38ade90a` index 0; OA; Grade D; canine direct; complete grading; funding unknown.

Rejection: the exact quote supports a link but not the stronger “higher anxiety scores” direction in the effect summary. Automatic quote or summary repair is prohibited.

### PMID 33653538 — no proposal

Group B / `diet-microbiome`, rank 1, document and chunk similarity 0.648677, chunk `b09f963d-f52b-4b34-b34d-b684ddd5de43` index 0, abstract only, Grade D, complete grading, funding unknown.

Rejection: the model returned null.

## Group G and other exclusions

- Group G was not sent to the model and did not become biological evidence.
- No Grade E, human, rodent, preprint, or non-canine biological claim was proposed for insertion.
- No source or grading metadata was assigned by the model.
- Missing grading metadata remains distinct from evidence weakness.

## Admin UI

The production route was tested again after drafting. It showed `Checking access…` and then redirected to `/signin`. No authenticated test-admin session was available, so the UI remains unverified. Intended rendering observed in source code is not reported as live behavior.

## Idempotency migration requiring approval

`research_claims` still has no safe deterministic claim identity. Before insertion, the proposed schema change is:

1. add a required `claim_identity` text column;
2. require exactly 64 lowercase hexadecimal characters;
3. add a unique constraint on `claim_identity`;
4. calculate identity in the offline job from document ID, chunk ID, exact quote, and normalized proposition;
5. insert only missing identities and report existing identities as exact skips.

No migration file or database schema change has been made yet.

## Owner decision requested

Approve neither, either, or both exact identities:

- `bd42395624e9196a728db76260d9e67c977e4192505cc4bfac084c6a2b638fb3`
- `6f268c891527a149e04d43a0b5a85ffa492a0b8ec0ff4766773564622fa18b70`

Also state whether the deterministic `claim_identity` migration is approved. Approved claims will be inserted only as `queued_for_review`, never active, with empty corroboration and source/grading metadata copied by the existing database contract.
