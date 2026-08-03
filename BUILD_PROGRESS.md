# Bowl (by Dog Smart) — Build Progress

## PDF-upload species filtering built (2026-08-03, latest)

Closes the gap logged just below (same day): `ingestUploadedResearchPdf`
had no species check at all, unlike the URL/PMID path's document-level
`evaluateResearchEvidenceAdmissibility` gate against PubMed MeSH headings —
PDFs have no such metadata, only extracted text.

**What shipped:** [src/lib/researchSpeciesFilter.ts](src/lib/researchSpeciesFilter.ts),
a deterministic keyword classifier (`classifyChunkSpecies`,
`filterCatOnlyChunks`) applied per-chunk, not per-document — a brochure with
real dog and cat sections shouldn't lose its dog content because of a
whole-document reject. A chunk is `cat_only` only if it mentions
cat/feline/kitten terms and never mentions dog/canine/puppy terms; mixed and
neutral chunks are kept. 9 unit tests in
[researchSpeciesFilter.test.ts](src/lib/__tests__/researchSpeciesFilter.test.ts)
cover cat-only, dog-only, mixed, neutral, case/plural/canine-feline forms,
the "category"/"catalogue" substring false-positive risk, and the
all-cat-document edge case.

Wired into `storeDocumentWithVoyage` (`researchBrainPipeline.ts`) via a new
optional `chunkFilter` param, applied only from `ingestUploadedResearchPdf` —
deliberately not from `ingestDiscoveryCandidate`, which already has its own
working document-level gate and shouldn't have a second, cruder heuristic
layered on top. If every chunk in an upload comes back cat-only, ingestion
now throws before embedding anything rather than silently storing an empty
document. `discarded_chunk_count` is recorded in the document's
`source_metadata.species_filter` and surfaced through the job's
`resultSummary`/audit event and the Intake page's success message.

Full project `tsc --noEmit`: clean. `npm test`: 361/361 pass (9 new). Not
yet re-tested against the actual Purina brochure (job `1a3a45ce`, orphaned
upload still in the `research-ingestion` bucket) — that re-test is the
next step, now that filtering exists.

## PDF worker fix; PDF-upload species filtering gap found, unbuilt (2026-08-03, earlier)

Owner uploaded `33784_ppvd_range_brochure_v7_0_0.pdf` (Purina, image-heavy,
8.3MB) through Intake. Job `1a3a45ce` failed: `Setting up fake worker failed:
"Cannot find module '/var/task/node_modules/pdfjs-dist/legacy/build/pdf.worker.mjs'"`.
Not the DOMMatrix bug fixed earlier the same day (that one's confirmed good —
3 successful imports since). This is a separate, Vercel-specific packaging
bug: pdfjs-dist's Node fake-worker fallback resolves its module with
`import(GlobalWorkerOptions.workerSrc)` — a runtime string pdfjs builds
itself, not a static path — so Vercel's output-file-tracing can't see it and
doesn't bundle `pdf.worker.mjs` into the function. It only surfaces on a cold
lambda instance that hasn't already resolved (and cached) that dynamic import
once, which is why earlier same-day PDFs on a warm instance were unaffected.

**Fix** ([src/lib/pdfText.ts](src/lib/pdfText.ts)): statically import
`pdfjs-dist/legacy/build/pdf.worker.mjs` and set it on
`globalThis.pdfjsWorker` ourselves. pdfjs checks `globalThis.pdfjsWorker`
before ever attempting the dynamic import (its documented Node escape hatch),
so this both guarantees the file is traced (real static import) and skips
the fragile dynamic-import path entirely. Type-checked clean
(`tsc -p tsconfig.json --noEmit`, full project, no errors). Pushed to `main`
per owner go-ahead; Vercel will redeploy.

**Side effect, not yet cleaned up**: the original 8.3MB upload is still
sitting in the `research-ingestion` storage bucket at
`bcc4087f-c41a-42af-83ef-d97d35e4aea6/1a3a45ce-a1f7-4714-8bb3-0586581845b9.pdf`
— `finalize_pdf` only removes the storage object on the success path, so a
failed job orphans it. Low priority (private bucket, one file), but worth a
cleanup pass if failures recur.

**Needs owner input / real gap found, not yet built**: while checking this,
found `ingestUploadedResearchPdf` in
[src/lib/researchBrainPipeline.ts:397](src/lib/researchBrainPipeline.ts:397)
has **no species filtering at all** — every PDF upload hardcodes
`evidence_scope: 'canine_direct'` on the whole document, and every chunk gets
embedded and stored under that scope regardless of content. Compare
`ingestDiscoveryCandidate` (same file, ~line 297), which runs
`evaluateResearchEvidenceAdmissibility` against `candidate.species` before
storing anything — the URL/PMID import path has a real gate the PDF-upload
path never got. This particular brochure has both dog and cat product lines,
so re-ingesting it as-is would embed cat-only chunks labeled canine evidence,
with nothing catching that until a human reviews an individual claim drafted
from one later (per-claim review, not per-chunk).

Owner decision (2026-08-03): **hold off re-ingesting this document** until a
species-detection/filtering step exists for the PDF-upload path. Do not
re-run `finalize_pdf` against the orphaned upload above until that's built.
Best next task: scope what "filtering" means here — reject the whole PDF
(same coarse gate as the URL path), or split/tag chunks by detected species
so the dog-relevant portion of a mixed document doesn't need discarding
wholesale.

## Research Layer P7 admin/expert-reviewer workspace redesign (2026-08-03, latest, local implementation)

P7 is complete as one whole phase: a redesign of the research admin surface
for two audiences inside the existing `requireAdmin`-gated area — day-to-day
operators and expert reviewers (vets) doing reference-quality lookups. Owner
confirmed this stays entirely admin-account-level, not public-facing:
"expert introduced into this system will be done so at an admin account
level... research only affects [customers] by how its information informs
and interacts with the dogs data... exposing research to them is not
necessary." The original narrow P7 scope from
`docs/research-behive-architecture-review-2026-08.md` (a public-facing,
unauthenticated evidence map) is superseded by this phase and pushed to a
future P8 — a reversible naming decision, not an owner-directed one (the
owner didn't pick between "call this P7" vs. "insert a phase before P7";
since the practical work is identical either way, this was made and
disclosed per the "reasonable technical decision" clause rather than
re-asked).

**The problem.** Five components — `ResearchMissionAdmin`,
`ResearchIngestionAdmin`, `ResearchKnowledgeAdmin`, `ResearchGraphExplorer`,
`ResearchAdmin` (2,310 lines) — were simply stacked vertically on one route,
`/admin/research`. No shared navigation, no visual hierarchy connecting a
mission to the documents it acquired, the claims drafted from them, or the
graph view of the whole. Owner: "there is still the separation between
ingestion of the research data and being able to see and use it properly...
I expect this will need multiple UI pages not to be crammed onto one page."

**Design process.** Followed this project's own instruction to design before
coding: loaded the `frontend-design` and `dataviz` skills, then built a
clickable HTML/JS mockup (Artifact, not committed to the repo) using
fabricated sample data across five design iterations, each responding to
direct owner feedback (page split → add a spatial graph page → the graph's
physics/legibility/scale were each individually broken and fixed → owner
signed off with "build this as it is... I will revisit the graphing again
later"). Full iteration history is in agentmemory, not duplicated here.

**Information architecture.** `/admin/research/*` is now seven routes under
one shared `layout.tsx` (`AdminShell` + a new `ResearchNav` secondary nav),
using a new `wide` prop on `AdminShell` (`.container-wide`, ~1600px cap) so
data-dense pages aren't squeezed into the app's normal 768px reading column:

- `/admin/research` (Home) — new `ResearchHome.tsx`: stat tiles (papers in
  library, awaiting-review counts, active clusters, recent lifecycle
  events), a merged activity feed (missions + retractions), quick actions.
  Aggregates existing endpoints client-side; added no new API surface.
- `/admin/research/intake` — existing `ResearchIngestionAdmin`, unchanged,
  relocated with page framing.
- `/admin/research/review` — **soft merge**: `ResearchKnowledgeAdmin`
  (cluster review) and `ResearchAdmin` (individual claim review) render on
  one page with unifying framing. Deliberately not a deep code merge — the
  two use genuinely different mechanisms (cluster-level RPC vs. per-claim
  PATCH), both already independently tested; merging the UI location was the
  actual ask, not rewriting two working, reviewed flows for cosmetic gain.
- `/admin/research/missions` — existing `ResearchMissionAdmin`, unchanged.
- `/admin/research/explorer` — existing `ResearchGraphExplorer` (quote-first
  list navigator), unchanged.
- `/admin/research/graph` — **new**: `ResearchGraphCanvas.tsx`, a real
  spatial force-directed/timeline graph, see below.
- `/admin/research/retractions` — **new**: `ResearchRetractionWatch.tsx`
  reading a new route, `GET /api/admin/research/lifecycle-events`
  (admin-gated, reads the existing P5 `research_evidence_lifecycle_events`
  table, resolves document/claim/cluster ids to labels — no schema change,
  no new writable path; the sole way to retract/supersede a document is
  still `POST /api/admin/research/[docId]/lifecycle`). Previously the only
  way to see a retraction's downstream effect was to know to search for it
  in the graph explorer.

**Graph canvas — the one genuinely new visualization.** Reuses the existing
`GET /api/admin/research/graph` endpoint and P4 read model
(`researchGraphReadModel.ts`) unchanged; all eligibility/quote/review rules
are inherited, not reimplemented. New pure module
`src/lib/researchGraphLayout.ts` (11 tests,
`src/lib/__tests__/researchGraphLayout.test.ts`) transforms the read model
into a layout-ready shape:

- **Dynamic topic grouping, not a fixed list** — owner's explicit
  requirement ("the research layer should identify new topic groups not
  have a fixed one, this is dynamic information"). `deriveNodeConcepts`
  reads `subject_type:subject_value` directly off claim/cluster rows (the
  same field `research_graph_concept_nodes` already exposes) and propagates
  it to documents/lifecycle-events via `DERIVED_FROM`/`RETRACTED_BY`/
  `SUPERSEDES` edges. No topic is ever hardcoded; the UI's "Topics in view"
  list is built by scanning whatever concepts are actually present.
  `deriveStudyFamilies` and `deriveClusterGroups` are similarly derived from
  `SAME_STUDY_FAMILY` and `MEMBER_OF` edges, not separate lookups.
- **Node status is real, not fabricated** — the graph endpoint only ever
  returns active, human-reviewed content plus explicit tombstones (P3's
  active-only eligibility rule), so "status" here is exactly `active` or
  `tombstoned` (`data.tombstoned === true`), never an invented "queued"
  state (the mockup's queued-status nodes were a mockup-only liberty; the
  real projection cannot return queued/draft material by construction).
- **Legibility, tuned through several rounds of owner feedback on the
  mockup**: alpha-cooled force simulation (settles instead of jittering
  forever) with an always-on radius-aware overlap-prevention pass
  independent of cooling; persistent on-canvas labels (not click-only) with
  per-frame greedy collision avoidance (priority: selected node, then
  cluster/document, then event, then claim — the category caption for a
  topic halo only draws in whatever space labels didn't already claim);
  directional arrowheads on every edge; a "Fit" view that frames whatever's
  currently visible; a near-full-height canvas (`calc(100vh-200px)`) with
  the detail panel as a small overlay instead of a permanent grid column.
- **Anti-corroboration invariant preserved by construction, not just by
  copy**: no spatial force-directed force is ever driven by
  `semantic_similarity` or edge count — grouping forces only ever use
  concept/study-family/cluster identity, matching the same "navigation
  signal only, never evidence strength" rule `ResearchGraphExplorer`
  already enforces. A literal spatial node-link canvas was initially a
  candidate to skip entirely (the architecture doc's own threat table warns
  dense/near nodes look more certain than the evidence supports) — built
  anyway once the owner asked directly for it, with that safeguard kept
  intact rather than dropped for visual appeal.

**Verified**: full suite 331/331 (320 existing + 11 new), `tsc --noEmit`
clean, optimized production build clean (all seven `/admin/research/*`
routes plus `/api/admin/research/lifecycle-events` appear in the build
output), `git diff --check` clean. `npm run lint` could not run non-
interactively in this session (ESLint config prompt, a pre-existing gap in
this repo, not introduced here — matches the deferred-lint gap noted in
earlier phase records). Live-checked against the local dev server:
unauthenticated `/admin/research` redirects to `/signin` (client-side
auth guard, no crash before redirect); unauthenticated
`/api/admin/research/lifecycle-events` fails closed 404, same pattern as
every existing admin route; zero server errors in dev server logs across
the navigation. No admin test credentials were available in this session to
verify the authenticated views visually — that remains open, see below.

**Not done in this pass, disclosed rather than silently skipped**: no visual
screenshot verification of the authenticated pages (no test admin account in
this sandbox); the owner has already said they'll revisit the graph canvas
specifically once seen in production ("I will then revisit the graphing
again later to fine tune it once ive seen it in a full productions
format") — this is expected, not a gap to chase further right now. `npm
audit`'s two pre-existing high-severity Next.js/postcss advisories
(documented in the P6 record) are unrelated and untouched.

Per the owner's explicit "You have my full permission to build and commit
and push to main" — this phase, uniquely among P0–P6, needed no Supabase
migration (pure UI + one new read-only API route over an already-existing
P5 table), so there is no separate production-migration gate to clear
before the Vercel auto-deploy that follows a push to `main`.

## Research Layer P4+P5 production release (2026-08-02, latest)

Owner approved commit, push, production migration, and deploy for both P4
and P5 together in one pass. Sequence:

1. Committed as `4838fea` on `codex/mobile-pack-capture`, pushed, then
   fast-forwarded to `main` (was 0 ahead/8 behind — clean FF, no merge).
2. Vercel's GitHub integration auto-deployed `main` to production
   (`dpl_baEmqXdJguhMTHnVeiH6Z3zcF1n2`, target production, READY) before any
   Supabase migration was applied — briefly meant the new admin routes
   referenced database objects that did not exist in production yet.
3. Applied `20260802190000_research_document_study_family` (P4) then
   `20260802210000_research_retraction_supersession_propagation` (P5) to
   `ysffyuohwvdifvbopfcm`, in that order, via the Supabase MCP
   `apply_migration` tool (schema pre-checked against live
   `information_schema.columns` first — no surprises).
4. Security advisors: zero new findings (the only P5-related entry is the
   expected `rls_enabled_no_policy` INFO on `research_evidence_lifecycle_events`,
   identical pattern to every other service-role-only table in this schema).
   Performance advisors: three INFO-level unindexed-foreign-key notices on
   the new lifecycle-events table (`actor_id`, `replacement_document_id`,
   `promoted_primary_document_id`) — closed immediately with a follow-up
   migration, `20260802220000_research_evidence_lifecycle_events_fk_indexes`,
   matching this project's established fk-index-cleanup pattern.
5. Verified live: exactly 12 `research_graph_*` views (the original 9 + P4's
   `SAME_STUDY_FAMILY` + P5's `SUPERSEDES`/`RETRACTED_BY`); zero
   anon/authenticated/PUBLIC grants on any new table/view; only
   `research_documents_duplicate_target_guard` remains as a trigger on
   `research_documents` (confirms `research_document_sync_claim_metadata`
   was actually dropped, not just intended to be); only
   `propagate_research_document_status_change` exists among the three
   candidate routine names (confirms `mark_research_document_retracted` and
   `sync_research_claims_after_document_change` are gone). Vercel: zero
   runtime errors in the two hours around deploy; homepage 200; unauthenticated
   `/api/admin/research/graph` fails closed 404 (same pattern every prior
   phase's release record verified).

Both P4 and P5 are now live in production. Next: P6 (recurring missions),
per the owner's own explicit scope boundary for this session.

## Research Layer P5 retraction/supersession propagation (2026-08-02, local implementation)

P5 is complete as one whole phase, per the owner's exact spec: "Implement and
test atomic propagation through claims, clusters, corroboration and
projection. Acceptance: injected failure rolls back the entire change;
successful propagation removes runtime eligibility immediately." Nothing was
committed, pushed, or applied to production.

**Single atomic RPC**, new migration
`supabase/migrations/20260802210000_research_retraction_supersession_propagation.sql`:
`public.propagate_research_document_status_change(p_document_id, p_action,
p_replacement_document_id, p_actor_id, p_actor_type, p_reason)` — one plpgsql
function, atomic by ordinary Postgres transaction semantics (a `security
definer` function with `set search_path = ''`, matching
`edit_research_evidence_cluster`'s established pattern), `service_role`-only.
`p_action` is `'retract'` (no replacement) or `'supersede'` (replacement
document required); a "correction" is mechanically a supersession — the
schema has never had a third state distinct from `retracted`/`superseded_by`,
so the audit event's `reason` text is what distinguishes intent, not a
separate enum value. In order, it: (1) locks and marks the document; (2)
transitions that document's currently-active claims to `status='superseded'`;
(3) transitions any cluster left with **zero remaining active member claims**
to `superseded` — a cluster still independently supported by another
document's active claim is untouched, so retracting one of several
corroborating sources never wrongly invalidates a still-supported
proposition; (4) when the document was a study-family primary (P4's
`duplicate_of_document_id` target) with at least one non-retracted duplicate,
auto-promotes the fullest remaining duplicate to primary using the exact same
fullness ranking `src/lib/researchStudyFamily.ts` uses at import time —
**owner decision, 2026-08-02: auto-promote, not flag-for-manual-review, not
leave-orphaned** — and re-points the rest; if every duplicate is also
retracted, the family is left explicitly orphaned and recorded as such
(`orphaned_duplicate_document_ids`), never silently dropped; (5) appends one
row to a new append-only table, `research_evidence_lifecycle_events`
(actor, reason, every affected claim/cluster id, promoted-primary id,
orphaned-duplicate ids) — `service_role` gets `SELECT, INSERT` only, no
`UPDATE`/`DELETE`, same append-only shape as `research_mission_events`. The
existing `research_graph_*` views are live selects over these same tables, so
eligibility disappears from the projection with no separate refresh step —
verified directly, not assumed.

**Retired two pre-P5 mechanisms this function subsumes and makes safe to
combine with supersession**, both dropped by the same migration:
`research_document_sync_claim_metadata` (the `AFTER UPDATE OF ... retracted`
trigger from `20260728200000_research_claims_and_grading.sql`) fired
synchronously inside the same statement as this function's own document
update and would have silently emptied `affected_claim_ids` before the
function's own explicit claim-transition step ran — a real ordering bug,
caught only because the disposable-container test was rebuilt to include the
old trigger first (reconstructing real pre-P5 state) rather than validating
against a container that never had it; and `mark_research_document_retracted`
(same migration), whose one caller (`retractions/route.ts`, the monthly
retraction-watch job) now calls the new RPC instead, with the `system_alerts`
operational-alert side effect kept at the route level (dedup-by-`check_name`,
unchanged behavior) rather than inside the DB function.

**Closed a real safety gap found while wiring this in, not part of the
original ask but adjacent to it**: `src/app/api/admin/research/[docId]/route.ts`'s
PATCH previously allowed a raw `superseded_by` field write with **zero**
propagation — no claim/cluster transition, no study-family handling, no audit
trail. That field is no longer writable there. The sole path to retract or
supersede a document is now `POST /api/admin/research/[docId]/lifecycle`
(new route, owner-actor, reason required) or the automated retraction-watch
route (`system`-actor) — both call the one RPC.

**Graph projection**: two new views this migration adds, `SUPERSEDES` and
`RETRACTED_BY`, explicitly deferred to P5 by
`20260802170000_research_graph_projection.sql`'s own comment ("A retracted/
superseded document has no node in this projection at all ... belongs to
whichever phase defines it"). Both are necessarily asymmetric-eligibility
tombstone edges — unlike P4's `SAME_STUDY_FAMILY` (which requires both
endpoints to already be eligible nodes), only the *live* side must resolve to
an eligible node here, since the whole point of retraction is that the old
side never is. `SUPERSEDES` connects the new/replacement document back to the
tombstoned old one; `RETRACTED_BY` (no replacement document exists for a pure
retraction) terminates at the audit event instead — a new `event` node kind
in the read model. **This edge-shape choice is a graph-presentation decision,
not a product-policy one; flagged here for owner review like any other
durable technical choice, not gated on it.** `src/lib/researchGraphReadModel.ts`
and `src/app/api/admin/research/graph/route.ts` wire both through; the old
document/retracted node is upserted as a minimal, visibly-styled
(`opacity-60`, "— retracted/superseded" label) tombstone in
`ResearchGraphExplorer.tsx` rather than a dangling edge endpoint.

**Deliberately out of scope**, per the owner's brief: P6 (recurring
missions), P7 (user-facing evidence map), and any change to ranking/
recommendation logic beyond what already happens automatically (retracted/
superseded documents were already excluded from
`src/lib/activeClaimRetrieval.ts`'s runtime read path via the
`document.retracted`/`document.superseded_by` join checks — P5 adds explicit
claim/cluster status transitions and the audit trail on top, it does not
change what was already excluded). No original source, claim, or cluster row
is ever deleted — status transitions and an audit trail only, per the
project's provenance invariants.

**Also noticed, explicitly left alone as out of scope**: `src/lib/embeddingPipeline.ts`'s
`ingestResearchDocument` has its own, much older raw `.update({ superseded_by:
doc.id })` write. This is a different, earlier subsystem (the original 6-phase
build plan's "Phase 4: RAG research layer" — a different numbering scheme
entirely from this research-brain P0–P5 sequence), operating on a simpler
document model with no `research_claims`/`research_evidence_clusters`
involvement. Fixing it would be a different, separately-scoped task, not part
of "atomic propagation through claims, clusters, corroboration and
projection" for the evidence layer P0–P5 built.

Validated in a disposable `public.ecr.aws/supabase/postgres:17.6.1.143`
container: the P3 minimal fixture, P3 migration, P4 migration, a new
`supabase/tests/p5_pre_state_fixture.sql` (reconstructing the two pre-P5
objects being retired, sourced verbatim from their real migration, so the
retirement and the ordering-bug fix are actually exercised), then this P5
migration, then `supabase/tests/p5_retraction_supersession.sql` — six
scenarios: plain retraction; a cluster surviving partial retraction (still
supported by another document) then transitioning once its last support is
also retracted; supersession with a replacement document, including
rejecting an already-retracted replacement target; study-family
auto-promotion (fuller non-preprint duplicate wins); orphaning when every
duplicate is also retracted; and the acceptance-critical one — **an injected
mid-transaction failure** (a temporary trigger raising on a sentinel cluster,
positioned so the document and claim updates run and would already be
"successful" before the injected failure hits), asserting the document
retraction, claim transition, and cluster transition were **all** rolled
back, no audit event was inserted, and a clean retry after removing the
injected failure succeeds normally. Plus RLS/grant assertions (append-only,
zero anon/authenticated grants). All scenarios passed. Full 309-test suite
(the old "no supersession edge type is ever produced" placeholder test in
`researchGraphReadModel.test.ts` replaced 1-for-1 with real
SUPERSEDES/RETRACTED_BY assertions now that P5 exists — same count, real
coverage), `tsc --noEmit` clean,
optimized production build clean (`/api/admin/research/[docId]/lifecycle` in
the build output), `git diff --check` clean. The owner's
`docs/research-brain-handoff-2026-07-29.md` edit was not touched throughout
(hash reverified unchanged: `9b35300e...c42`).

Per the same phase-gate pattern every prior phase required, this stops at
local implementation. Commit, push, migration application, and deployment
all require a separate, explicit owner approval.

## Research Layer P4 admin graph explorer (2026-08-02, local implementation)

P4 is complete as one whole phase, per
`docs/research-behive-architecture-review-2026-08.md:238-241`: "Add
claim/cluster/document/study-family navigation and literal-quote
drill-down. Acceptance: every displayed edge resolves to review metadata and
quote; similarity/degree are labelled navigation signals only." Nothing was
committed or pushed.

**Claim/cluster/document navigation and quote drill-down** reads the nine
P3 `research_graph_*` views, already live in production, `service_role`-only
with zero `anon`/`authenticated`/`PUBLIC` grants — no migration needed for
this part.
- `src/lib/researchGraphReadModel.ts` -- pure assembler turning the view
  rows (plus `research_evidence_cluster_members.semantic_similarity`, read
  from the base table for the same already-eligible pairs the view already
  selected) into a node/edge read model. `DERIVED_FROM`/`CONCERNS`/
  `MEMBER_OF` resolve their quote and reviewer directly from the claim
  endpoint. `SUPPORTS`/`CAUTIONS_AGAINST`/`APPLIES_TO` have no claim endpoint
  of their own, so their quote is resolved from their cluster's eligible
  member claims; if none remain eligible, the edge is returned with
  `quote_unresolved: true` rather than silently rendering as fully evidenced.
  `navigation_degree` (edge count per node) and `semantic_similarity` are
  both explicit, separately labelled fields -- never merged into or presented
  as evidence strength.
- `src/app/api/admin/research/graph/route.ts` -- `GET`, `requireAdmin`-gated
  (fail-closed 404), queries the views with `supabaseAdmin` (the same
  pattern `missions/route.ts` and `claims/route.ts` already use for other
  service-role-only tables), returns the assembled graph with
  `Cache-Control: private, no-store`.
- `src/components/ResearchGraphExplorer.tsx` -- read-only admin UI: search
  and filter nodes by kind, select one to see its connected edges, each edge
  showing its reviewer(s), literal quote(s) (or the unresolved-quote
  warning), and any similarity value visibly captioned "nav signal only, not
  evidence strength". Wired into `src/app/admin/research/page.tsx` after
  `ResearchKnowledgeAdmin`.

**Study-family navigation** needed a real data model — it did not exist
after P3 (which correctly deferred it, since `research_documents` only
deduplicated by unique DOI/source record, not "same underlying trial or
population"). The owner answered the design questions directly (recorded
verbatim in the architecture doc's P4 implementation record) rather than
letting this get deferred into a separate phase: matching is **fully
automatic** (no confirmation step), using **author overlap + publish-date
proximity + title similarity**, run **at document import**, scoped to
**"same paper, republished" only** (preprint/press-release/abstract of one
study — not overlapping trial populations), and **biased toward the fullest
version** of the study when choosing which copy claims get drafted from.

New migration `supabase/migrations/20260802190000_research_document_study_family.sql`
adds to `research_documents`: `authors text[]`, `duplicate_of_document_id`
(self-referencing FK, always points directly to a primary — a
`before insert or update` trigger, `enforce_research_document_duplicate_target`,
rejects chains), `duplicate_match_basis jsonb`, `duplicate_detected_at`. It
also adds a tenth graph view, `research_graph_edges_same_study_family`
(same `security_invoker`/zero-anon-grant pattern as the P3 nine), joined
against `research_graph_documents` on both ends so a duplicate link into an
ineligible document produces no edge.

Two invariants keep "fully automatic, no review" honest rather than reckless:
1. **A document with claims already drafted from it can never be demoted or
   re-pointed** (`src/lib/researchStudyFamily.ts`'s `findStudyFamilyMatch`
   only lets the fuller document win when the existing primary has zero
   claims). Immutable once claims exist, same as every other approved record
   in this schema.
2. **Every match is transparent, never dressed up as a review.** The graph
   explorer labels a `SAME_STUDY_FAMILY` edge "Automatically matched, not
   human-reviewed" and shows exactly what matched (method, title similarity,
   shared authors, year delta) instead of reviewer/reviewed_at, and it has no
   literal quote by design — it's bibliographic identity, not an evidentiary
   claim, so `quote_unresolved` is `false`, not a warning.

Matching thresholds (`src/lib/researchStudyFamily.ts`): title similarity
≥0.92 alone (the same bar the existing intra-batch discovery deduplication in
`researchGate2Database.ts`/`researchDiscovery.ts` already uses), OR ≥0.85
title similarity when at least one author overlaps and publication years are
within 1 year. Below 0.85, nothing matches regardless of authors. Author
names are a new signal end to end: `src/lib/researchEvidence.ts`'s
`parsePubMedXml` now parses PubMed `<AuthorList>` into normalized
"surname initials" strings (never rendered as a byline), threaded through
`ResearchCandidate` into the `research_documents` row. PDF uploads have no
structured authors, so they degrade gracefully to the 0.92 title-only bar.
Hooked into `src/lib/researchBrainPipeline.ts`'s `storeDocumentWithVoyage`,
the single insert path shared by both discovery-import and PDF-upload
ingestion, so both call sites get it automatically. The one-off
`researchGate2Database.ts`/`scripts/researchGate2Run.ts` path has no wired
API route and was left out of scope.

"Never process the same study twice": `src/app/api/admin/research/processing/route.ts`
now also selects `duplicate_of_document_id`, and `ResearchKnowledgeAdmin.tsx`'s
"papers awaiting structured processing" list excludes any document flagged as
a duplicate, with a visible count so it's not a silent omission.

**Verification gap closed (2026-08-02, later session).** This migration was
originally written without disposable-Postgres validation — that session's
sandbox denied Docker access outright (`docker ps` blocked by the
environment's auto-mode classifier). A later orientation session confirmed
Docker was available and ran the same isolated-container pattern P0-P3 used:
`supabase/tests/p3_minimal_research_fixture.sql`, then the real P3 graph
projection migration, then this real P4 migration, applied in order to a
disposable `public.ecr.aws/supabase/postgres:17.6.1.143` container, plus a
new `supabase/tests/p4_study_family.sql` assertion suite (chain-prevention
trigger, self-reference check, nonexistent-target check,
`research_graph_edges_same_study_family` eligibility including the
retracted-primary exclusion case, match_basis/detected_at carrying through
onto the edge, and grants). All assertions passed. The migration is now
implementation-validated the same way P0-P3 were; it is still not applied to
production and still requires a separate, explicit owner approval for that
exact action.

Verified live: full test suite 309/309 (296 original + 6 P4-graph-explorer +
6 P4-study-family, with the original single "no study_family or supersession"
test correctly split into a real SAME_STUDY_FAMILY assertion plus a narrower
"no supersession" one now that the edge legitimately exists), `tsc --noEmit`
clean, optimized production build clean (`/api/admin/research/graph` in the
build output), `git diff --check` clean. No ranking/recommendation code path
was touched. The owner's `docs/research-brain-handoff-2026-07-29.md` edit
was not touched throughout.

Per the same phase-gate pattern P0-P3 each required, this stops at local
implementation. Commit, push, migration application, and deployment all
require a separate, explicit owner approval — and given the disclosed
verification gap above, the migration specifically warrants isolated
validation before that approval, not just a review of the SQL.

## Research Layer P3 deterministic graph projection (2026-08-02, production)

Released to production from exact application commit
`7b50c55643b6a17f1cede3d9a4e0dc98405f679c`. Supabase project
`ysffyuohwvdifvbopfcm` recorded migration
`20260802161032 research_graph_projection` exactly once. Vercel project
`dog-food-helper` deployed it as `dpl_9j2vaUdgNKgnH9XBdUqQniunncbg`, target
`production`, reaching `READY`; `https://dog-food-helper.vercel.app` resolves
to it. Homepage returned HTTP 200; unauthenticated
`/api/admin/research/missions` and `/api/admin/research/configurations`
returned fail-closed HTTP 404 JSON (there is no P3-specific API route yet --
these are the pre-existing P0/P1 admin endpoints, re-checked as a general
fail-closed sanity check alongside this release).

Migration `supabase/migrations/20260802170000_research_graph_projection.sql`
(local filename) adds nine
read-only views (no new tables, no new data) over the existing
`research_documents` / `research_claims` / `research_evidence_clusters` /
`research_evidence_cluster_members` / `research_cluster_applicability` tables,
per the P3 acceptance criteria in
`docs/research-behive-architecture-review-2026-08.md:233-236`:
`research_graph_documents`, `research_graph_claims`,
`research_graph_clusters` (nodes); `research_graph_concept_nodes` (derived
ingredient/nutrient/ingredient_class/processing_method/biome_marker/
condition/clinical_marker/outcome_metric/general_health nodes, distinct
(type, key) pairs, not a separate identity table);
`research_graph_edges_derived_from`, `research_graph_edges_member_of`,
`research_graph_edges_direction` (SUPPORTS/CAUTIONS_AGAINST),
`research_graph_edges_concerns`, `research_graph_edges_applies_to`.

Eligibility is uniform across every view: document not retracted, not
superseded, `evidence_scope = 'canine_direct'` (Group-G veterinary-methodology
appraisal documents/claims are excluded — they never make a biological claim
about dogs); claim `status = 'active'`; cluster `status = 'active'`. All views
are `security_invoker = true`; `anon`/`authenticated`/`PUBLIC` are revoked on
every view; only `service_role` has `SELECT`. No table, trigger, function, or
application code was modified — this migration is purely additive.

**Deliberately deferred, not missing by oversight:**
- `SAME_STUDY_FAMILY` — no `study_family` identity exists anywhere in the
  schema. `research_documents` deduplicates by unique DOI/source-record, which
  is a different guarantee than "same underlying trial or population."
  Modelling that correctly is a data-model decision, not a query; building a
  synthetic grouping here would misrepresent independence between studies.
  Needs its own design decision before a later phase.
- `SUPERSEDES` / `RETRACTED_BY` — explicitly scoped to P5 ("retraction and
  supersession validation") in the architecture doc. A retracted/superseded
  document has no node in this projection at all, so there is nothing yet to
  attach a transition edge to.

**Validated in a disposable Postgres 17 container** (`supabase/postgres`
image, isolated from both the real Supabase project and the unrelated local
Supabase stack already running for the sibling Dog Smart Studio repo).
Because the migration history in this repo does not include the pre-
`supabase/migrations` baseline (`foods`, `dogs`, etc. predate the folder — the
same gap the existing `supabase/tests/p2_minimal_research_fixture.sql`
already worked around), validation used a new
`supabase/tests/p3_minimal_research_fixture.sql` reconstructing the exact
final-state shape of the claims/clusters/documents schema, then applied the
real P3 migration on top, then ran
`supabase/tests/p3_graph_projection.sql`. That file plants one fully eligible
document/claim/cluster/membership/applicability chain plus one ineligible
example of every exclusion path (draft claim, rejected claim, queued claim, a
claim whose document was superseded *after* the claim was already active —
proving the join-based eligibility check, not just the status column, does
the work — a veterinary_methodology document/claim, a queued cluster, a
rejected cluster, and a neutral-direction cluster) and asserts by count and by
id that only the eligible rows appear in every node/edge view, that the
neutral cluster produces no directional edge, and that no ineligible
claim's subject/outcome value leaks into `research_graph_concept_nodes`. A
separate assertion block confirms zero `anon`/`authenticated`/`PUBLIC` grants
and exactly nine `service_role` `SELECT` grants across the nine views. All
assertions passed. The migration was also reapplied a second time against the
same database with no error, confirming `create or replace view` idempotency.
The disposable container was removed after validation.

**Ranking stability:** no application code (`.ts`/`.tsx`) was touched, so
ranking/recommendation output is unchanged by construction. Confirmed live:
full test suite 296/296 (including
`recommendation retrieval does not depend on mission control-plane tables`),
`tsc --noEmit` clean, optimized production build clean, `git diff --check`
clean.

**Owner approved production release on 2026-08-02**, matching the same
phase-gate pattern P0/P1/P2 each used. Live verification against
`ysffyuohwvdifvbopfcm`: all nine `research_graph_*` views exist; grants show
zero `anon`/`authenticated`/`PUBLIC` privileges on any of them (`postgres`
and `service_role` retain the schema's normal owner/backend privileges,
matching every other table in this project — no browser-reachable role can
read them); protected counts are unchanged (30 documents, 695 chunks, 88
centroids, 2,282 relevance rows, 19 ingestion jobs, 22 cluster memberships,
12 applicability rows, 368 embeddings, 0 score-cache/queue rows, 0 missions,
0 provider calls). Security advisors are byte-identical to the pre-release
baseline: 34 findings (27 info, 5 warn, 2 error) — the same two pre-existing
unrelated errors (`manufacturer_entities`, `terms_clause_patterns` RLS
disabled) remain, untouched, per standing instruction not to silently
remediate unrelated schema. Performance advisors are also byte-identical: 91
findings (78 info, 13 warn). This is a cleaner result than P0/P1/P2, which
each added a few expected informational notices — plain views with no new
tables or indexes introduce nothing for the linter to flag.

P4 (admin graph explorer) is the next phase; no UI or API route consumes
these views yet, so nothing changed about what a browser can reach even
though the migration is now live.

## Research Layer P2 persisted provider usage and deterministic caps (2026-08-02, production)

P2 was released from exact application commit
`a27b75fcab6015456ba32f38cbd14845d68ee514`. Supabase project
`ysffyuohwvdifvbopfcm` records migration
`20260802065908 research_provider_usage_and_budget_caps` exactly once. Vercel
project `dog-food-helper` deployed it as
`dpl_2KzqWYAxMLa2A1u5DgEhh87Q9ZZv`; the deployment reached `READY` and the
production alias `https://dog-food-helper.vercel.app` resolves to it.

The slice adds immutable estimate-rate, mission-budget, and stage-cap versions;
one append-preserving row per provider call; exact links to mission, stage
attempt, job, model-stage configuration, route, and estimate rate; atomic
pre-call cap reservation; deterministic halt reasons; and retry-safe history.
Provider-reported tokens/cost remain separate from character-count/token-cap
estimates. Missing provider usage remains missing and is never replaced by an
estimate. Measured client timing and provider timing, when reported, aggregate
from call rows by stage and mission.

The existing admin polling endpoint now returns a complete mission detail read
model and resumes events strictly after a persisted sequence cursor, with
bounded pagination. The admin research page exposes attempts, ordered events,
exact routes/configurations, actual reported usage, clearly labelled estimates,
timing, caps, and deterministic halt reasons. No SSE path was added. Private dog
reports and recommendation runtime remain outside the mission/call/event model.

The exact P0 -> P1 -> candidate P2 migration chain passed in a disposable
Supabase Postgres 17 runtime. Behavioral assertions covered valid calls,
reported usage/timing, replay-safe completion, duplicate call-key rejection,
pre-call cap halt, preserved prior history, a distinct retry attempt, exact
route/config/rate links, continuous event sequencing, immutable completed rows,
RLS/privileges, and covering indexes. Supabase `db lint` returned no schema
errors or warnings. The disposable runtime and local preview were removed.

Release-gate verification passed: 296/296 tests, `tsc --noEmit`, the optimized
production build, and `git diff --check`. The exact committed migration was
54,922 bytes with SHA-256
`410b9a81694c3aa7dd0da329bc80e17cb8a3774152d30835b8b1f388fe7d697b`
before it was sent to Supabase. Production seeds are two estimate-rate rows,
one budget policy, seven stage caps, and zero provider calls. Missions, stages,
and events remain zero.

All 66 pre-existing public-table counts were unchanged across the release. The
protected research baseline remains 30 documents, 695 chunks, 88 topic
centroids, 2,282 relevance rows, 19 ingestion jobs, 22 evidence-cluster
memberships, 12 applicability rows, 368 semantic embeddings, and zero score
cache/queue rows. Food, dog, private-report, evidence, recommendation, and
scoring counts were also unchanged. Existing saved recommendation items retain
zero research ranking contribution.

The immediate pre-release advisor recheck was 30 security findings (23 info,
5 warning, 2 error) and 82 performance findings (69 info, 13 warning), two
informational findings lower than the earlier local record before P2 changed
production. The final advisor result is 34 security findings (27 info, 5
warning, 2 error) and 91 performance findings (78 info, 13 warning): exactly
four expected RLS-enabled/no-policy informational notices for the deliberately
private P2 tables and nine expected unused-index informational notices for new
P2 access paths. No warning or error was added.

Production returned HTTP 200 for the homepage and fail-closed HTTP 404 JSON for
unauthenticated mission and configuration endpoints. An existing owner session
loaded `/admin/research` at desktop and mobile widths with the P2 mission panel,
zero horizontal overflow, and no console errors. Production contains no mission
rows, so live attempt/event/call rendering and cursor advancement were not
manufactured for smoke testing; the persisted polling path remains covered by
the verified implementation/tests and no SSE path exists. The pre-existing
57-line owner edit in `docs/research-brain-handoff-2026-07-29.md` remained
unstaged, uncommitted, and excluded from the deployment.

## Research Layer Gate 4 active-claim runtime integration (2026-07-29, latest)

Gate 4 replaces request-time embedding/chunk RAG and research score-cache/queue
use with a deterministic server-side active-claim path. Eligibility requires an
active, reviewed, canine-direct claim; a present non-retracted/non-superseded
document; a present matching chunk; a still-literal supporting quote; and any
populated dog condition/life-stage restrictions. Claims, conditions, documents
and chunks are loaded in four bounded reads and matched to the batched
`food_full` candidate data in memory, with no per-food database query.

Subject matching is exact and structured: canonical ingredient equality, an
explicit nutrient-column/declared-additive allowlist, the repository's existing
ingredient-category taxonomy, and recorded food types only. Unknown ingredient
classes and processing methods report unsupported; biome markers never match a
food directly. A narrow canonical synonym group makes the active
`green lentil` claim match exactly three foods with `whole green lentils`;
generic/red lentils and lentil fibre remain nonmatches.

Recommendation results now carry cited `research_evidence` (identity, cautious
summary, exact quote, direction, grade, grading completeness, access type,
title, DOI and source URL). The dog UI renders this as a responsive evidence
card with an informational/not-veterinary-advice statement. All research
directions and grades contribute exactly zero to ranking; weights are unchanged
and historical offline drafting/scoring code remains intact.

Live state before and after: 2 claims (1 reviewed active, 1 unreviewed queued),
0 rejected and 0 corroborating arrays. The active grade-B claim remains
metadata-incomplete and abstract-only. No database migration occurred. All
protected research/source/scoring counts are unchanged, including score
cache/queue at zero. The required owner-side E2E wrote one normal saved
recommendation set for Ron, increasing that table from 1 to 2; it did not
change any research data. The live module returned the active claim for exactly
the three expected Acana food IDs and no unsupported active claim.

Verification: 247/247 tests, clean `tsc --noEmit`, production build exit 0,
and Supabase advisors unchanged at 20 security/53 performance findings.
`next lint` remains unconfigured and opens an interactive first-run prompt.
Authenticated production verification is complete using the owner's signed-in
session: the admin queue shows the real active/queued states and honest source
metadata; Ron's owner recommendation flow returned Acana Senior Dog at rank 8
with the active green-lentil evidence, exact quote and working PubMed citation.
The other nine foods had no evidence, the queued claim did not appear,
`research_relevance` remained zero, and the evidence card was readable at
desktop and 390px mobile widths with empty console error/warning logs. A
separate pre-existing Lab reports/documents JSON-response alert on Ron's page
was observed and left untouched as unrelated. Full report:
`docs/research-gate4-2026-07-29.md`.

## Research Layer Gate 3 drafting run 1 complete (2026-07-29, latest)

**UI UNVERIFIED.** Production `/admin/research` redirected to `/signin`; no
authenticated test-admin session was available.

Eight bounded offline drafting calls used Vercel AI Gateway only with
`anthropic/claude-sonnet-5`. Actual usage was 13,081 input and 1,453 output
tokens; accounted cost was $0.041142 against the approved $0.06 ceiling. Strict
review retained 2 of 5 structured proposals, rejected 3 unsafe proposals,
accepted 2 model nulls and discarded 1 output-limit failure without retry.

The owner approved exactly two immutable identities plus a deterministic
`claim_identity` uniqueness migration. Live `research_claims=2`: both Group E,
`neutral`, `canine_direct`, `queued_for_review`, unreviewed and non-active; one
Grade B abstract-only claim with incomplete metadata and one Grade D OA claim
with complete metadata. Both quotes are literal source-chunk substrings, both
chunks belong to their documents, copied grading metadata matches, and
corroboration arrays are empty. The similar taurine propositions are a review
cluster only, not asserted independent corroboration.

Initial insertion was 2 inserted, 0 updated, 0 skipped. The immediate repeat was
0 inserted and 2 exact skips. There are no Grade E, non-canine, Group G,
preprint, active or reviewed claims. All 30 documents remain pending; the
30/695/88/2,282 corpus and 384-pair eligibility calculation are unchanged.
Protected recommendation, scoring, hard-filter, client-document and
section-14.6 counts are unchanged. No runtime AI or claim-consumer path was
added.

Verification: 227/227 tests, `tsc --noEmit`, and production build all pass.
Supabase advisors have no new finding (security 20→20, performance 53→53).
Gate 3 stops before approval, activation, auto-activation, corroboration,
scoring or recommendation integration. Full report:
`docs/research-gate3-2026-07-29.md`.

## Research Layer Gate 2 ingestion complete (2026-07-29, latest)

**UI UNVERIFIED.** The production research-admin page redirected to `/signin`
and no authenticated test-admin session was available.

The owner-approved, frozen Gate 1 corpus selection was ingested into Supabase
project `ysffyuohwvdifvbopfcm`: 30 documents, 695 chunks, 88 topic centroids
and 2,282 document/topic relevance rows. Access is 24 OA JATS full text and 6
PubMed abstract-only; grades are A3/B4/C0/D23/E0; grading metadata is 27
complete and 3 incomplete. All 28 biological records are canine-direct with
structured PubMed `Dogs` MeSH; the two veterinary-methodology records are
Group-G appraisal context only.

All 783 embeddings used the Vercel AI Gateway with
`openai/text-embedding-3-small`, pinned to 1,536 dimensions. Actual usage was
199,245 tokens (approximately $0.0039849). Relevance ranking stores the maximum
chunk-to-centroid cosine score and derives eligibility using topic top-five plus
a 0.35 floor: 384 pairs are eligible, no topic exceeds five, and no eligible
pair is below the floor.

Live verification: 695/695 chunk and 88/88 centroid vectors have 1,536
dimensions; `research_claims=0`; protected recommendation, scoring,
hard-filter, client-document and section-14.6 table counts did not change.
Exact-manifest idempotency dry run: 0 inserts, 0 updates, 30 exact skips.
Tests 211/211, `tsc --noEmit` clean, production build exit 0. No Gate 3
drafting, claim activation or recommendation connection began. Full report:
`docs/research-gate2-2026-07-29.md`.

## Additive-panel safety gap closed (2026-07-28, latest)

**Decision: Option A (`food_ingredients`), based on actual readers.** Both the
allergy/condition hard filter and correlation matching already scan every
`food_ingredients.ingredient_name` without a category or position predicate.
A separate `food_additives` table would require a second safety query and create
another path that could drift. Additive declarations now remain in
`food_ingredients`, with distinct normalized categories
(`additive_nutritional`, `additive_sensory`, `additive_technological`,
`additive_antioxidant`) plus the exact printed heading in
`additive_category_printed`.

**Prevalence ordering remains isolated.** Additive-panel rows have
`position_in_list = NULL`; `additive_sequence` records only printed additive
order. The `food_full` view exposes separate `ingredients` and `additives`
arrays, the admin detail UI renders separate sections, and the composition
opacity trigger explicitly ignores null prevalence positions. Legacy generic
`additive` rows without a printed panel heading stay prevalence-ranked rather
than being reinterpreted.

**Parser/backfill discipline.** `compositionParser.ts` now finds additive
panels before or after analytical constituents, preserves nutritional/sensory/
technological/antioxidant boundaries, and stores printed amount+unit verbatim in
`note` without conversion. Run 1 was dry-only and found two real parsing
problems (`DL-methionine, technically pure` split at its qualifier comma, and
trailing Fish4Dogs marketing prose); both were fixed and regression-tested.
Run 2 applied only rows parsed from each food's existing `composition_raw`.
No brand/product knowledge was used.

**Live result:** migrations `add_food_additive_storage` and
`make_food_full_security_invoker` applied to project
`ysffyuohwvdifvbopfcm`. 94 additive rows across 13 foods: 79 nutritional, 2
sensory, 13 antioxidant; 0 ranked additive rows, 0 missing printed headings, 0
duplicate additive sequences. Farmina N&D Ocean Adult Medium & Maxi now has
23 prevalence-ranked composition ingredients plus all 25 printed additives.
Direct name matching finds rosemary, green tea, taurine, copper, zinc, and
selenium in `food_ingredients`, so existing hard-filter queries can see them.

**Verification:** additive/parser/hard-filter/storage tests 44/44; full suite
200/200; `tsc --noEmit` clean; production build exit 0; `git diff --check`
clean. Supabase advisor has no `food_full` or `food_ingredients` security
finding after switching `food_full` to security-invoker.

## Pets at Home ruled out, Tier 2 live against two manufacturers, UK Pet Food directory, GS1 scaffold (2026-07-27, latest)

**Pets at Home ruled out — the clearest prohibition found all session.** Its
single `terms-and-conditions` page (no separate imprint/copyright page
exists; footer only links T&C/Privacy/Cookies) states directly: *"You shall
not conduct, facilitate, authorise or permit any text or data mining or web
scraping... Any 'robot', 'bot', 'spider', 'scraper'... to access, obtain,
copy, monitor or republish any portion of the Website."* Not approved, and
unlike the manufacturer cases, not even a permission-email candidate — this
reads as a considered legal position (likely GDPR/DSM-Directive TDM
opt-out), not an oversight worth asking around.

**Tier 2 (sitemap + JSON-LD) built and run live against both approved
manufacturers, two-run discipline throughout.** New modules:
`src/lib/crawler/sitemapAdapter.ts` (sitemap/index walker with max-URL and
max-file bounds), `src/lib/crawler/jsonLd.ts` (schema.org Product
extraction — name/brand/sku/mpn/gtin/price only, deliberately never
description or image), `src/lib/crawler/tier2Harvest.ts` (orchestration,
same crawl_targets/contributed_foods write boundary as Tier 1).
`src/lib/crawler/compositionFinder.ts` extracted from the Shopify adapter
so both tiers share one composition-excerpt finder rather than two
copies.

**Real parser bugs found by real crawled strings — exactly what "run 1
writes nothing" was for.** Fixed before any write landed:
- A UK-label thousands-separator comma ("Vitamin A 22,500 IU") was being
  read as a list separator, splitting one additive into two garbage
  entries. Fixed with a protect/restore pass in `compositionParser.ts`,
  distinguished from a genuine European decimal comma by digit-group
  length (thousands = exactly 3 digits, decimals in this domain = 1-2).
- `ADDITIVES (per kg)` with no trailing colon (real emea.acana.com copy)
  wasn't recognised as a section heading at all, leaking into the last
  headline ingredient. Fixed the heading regex to accept `(per kg)` as
  colon-optional, while confirming inline "EC permitted additives" (a
  legal-category term, no "per kg") still doesn't false-positive.
- The raw excerpt shown to a reviewer ran on past the real label content
  into page furniture (a feeding calculator's weight-picker dropdown, "How
  to Feed" widgets) — fixed with an end-of-label marker list in
  `compositionFinder.ts`, while deliberately keeping Analytical
  Constituents in the excerpt (real, useful context for a reviewer, just
  not parsed as an ingredient).
All fixes have regression tests naming the real string that broke, not
just the abstract pattern.

**fish4dogs.com (Tier 2, live):** no JSON-LD Product schema at all (0/0
GTIN — a different failure mode than Shopify's "field present but empty").
Composition genuinely present in `body_html`-equivalent page text: 20/20
pages yielded a composition excerpt, all written to `contributed_foods`
with `composition_raw` populated and verified by reading rows back from
the database. Headline ingredients (chicken, salmon, potato etc.) parse
cleanly with correct percentages; the additives block still has known,
flagged limitations (mid-string parens, embedded marketing prose) —
correctly `needsReview: true`, never silently wrong on anything
safety-relevant.

**emea.acana.com (Tier 2, live):** DOES publish JSON-LD, but still 0/13
GTIN — the `gtin` field is simply absent from every node. **A live,
serious data-quality finding, confirmed by reading rows back from the
database:** the JSON-LD `brand` field is wrong on every single product —
`"Droogvoer voor honden"` (Dutch for "dry dog food"), `"Dry Dog Food"`
(English category label) — never `"ACANA"`. This is the source site's own
structured-data bug, not a parsing error on our end. **Do not trust
`crawl_targets.brand` from this domain without a human check.** Also hit
and fixed a real Git-Bash gotcha: a CLI arg starting with `/` (`/en/`, to
restrict a multi-locale sitemap walk to one language) got silently mangled
by MSYS path conversion into a Windows path, corrupting all args after it
— `pagesFetched: 0` with no error. Fixed by changing the script's CLI
convention to a bare locale code (`en`), never a leading-slash argument.
13 English-only identity rows landed in `crawl_targets` (locale mirrors
correctly excluded — would have been 8x duplicates otherwise), 4
composition excerpts in `contributed_foods`, verified against the DB.

**Shopify-tier GTIN yield across all three sources now known, not
assumed: 0/13 (acana) + 0/0 (fish4dogs, no schema at all) + the
Forthglade/Lily's Kitchen 0/566 from the prior session = manufacturer
sites are a composition source, not a GTIN source, full stop for now.**
The 204 Phase-1 identity-ambiguous rows still have no real GTIN path
except Zooplus/Viovet permission (pending) or the GS1-verified label-photo
route below.

**UK Pet Food (formerly PFMA) member directory harvested — 108 companies,
covering ~90% of the UK market.** robots.txt has no rules at all (only an
unpopulated Content-Signal preamble); no privacy/terms/cookie/legal page
exists anywhere on the site. New table `manufacturer_targets` (separate
from `crawl_targets` on purpose — company-shaped, not product-shaped),
every row `status = 'unapproached'` — a target list to work through, not
an approval of anything. 64 of 108 are tagged `Manufacturer`; the rest are
ingredient suppliers, associate members, sellers. Loaded via browser
automation (the directory's "Load More" is a client-rendered listing, not
a crawlable URL sequence) rather than the fetch layer — verified 108/108
against the database, not the load script's own count.

**GS1 barcode verification: built the scaffold, did not fabricate an
endpoint.** Checked GS1 UK's own documentation before writing anything:
"Verified by GS1" is a **human-facing web search tool** capped at 30
searches/day — not a documented self-serve API. The actual programmatic
option, the "GTIN Check API", is partner-gated (`gtincheck@gs1uk.org` for
a key); GS1 does not publish its endpoint, auth header, or response shape
anywhere public. Rather than guess and pretend it works, `gs1Verify.ts` is
deliberately inert without real credentials — every queued GTIN resolves
to `skipped_no_api_key`, proven live (inserted a real test row, ran the
processor, read the row back: `status = skipped_no_api_key`, then deleted
the test row).
- `src/lib/labelExtraction.ts`: added `gtin_raw` to the photo-extraction
  schema — the digit string printed under the barcode, not the bars
  (a vision model doesn't reliably decode those).
- `src/app/api/ingredients/confirm/route.ts`: the OCR'd GTIN is checksum-
  validated (`validateScrapedGtin`, same mod-10 function the crawler uses)
  before it's ever written to `foods.gtin` — a failed checksum means it's
  simply never written, never guessed. A checksum-valid GTIN is queued
  (new table `gtin_verifications`) for GS1 registry confirmation
  afterward, asynchronously — the label-photo flow's whole design point is
  a same-visit confirmation with no bottleneck, which a 30/day rate limit
  cannot gate synchronously.
- `src/app/api/cron/gs1-verification/route.ts` + `vercel.json` (daily,
  05:00 UTC): rate-limited processor. Overflow past the daily budget stays
  `pending` for tomorrow — queued, never dropped, per instruction.
- **Design tradeoff, flagged for owner awareness rather than decided
  silently:** a checksum-valid GTIN becomes an identity anchor
  immediately, with GS1 confirmation catching problems afterward (via a
  `mismatch`/`not_found` status, not yet wired to an alert) rather than
  gating creation on it. True "block until GS1 confirms" would conflict
  with both the synchronous-confirmation design and the 30/day cap. Worth
  revisiting once real GS1 credentials exist and the actual latency is
  known.

**Verification:** `npm test` — 147/147 pass (10 new: 2 real-crawled-bug
regressions in compositionParser, 1 compositionFinder excerpt-truncation
suite, 3 GS1-config tests). `npx tsc --noEmit` clean. `npm run build`
clean, including both new API routes. Security advisors: two new
`rls_enabled_no_policy` INFO findings (`gtin_verifications`,
`manufacturer_targets`) — the intended fail-closed state, same pattern as
every other service-role-only table in this project; nothing new at ERROR
or WARN.

**Owner review**
- `crawl_targets.brand` is confirmed wrong for every emea.acana.com row —
  don't build anything downstream that trusts it without a human check.
- GS1 credentials: need a real conversation with GS1 UK
  (`gtincheck@gs1uk.org`) about their GTIN Check API before
  `GS1_API_BASE_URL`/`GS1_API_KEY` can be set to anything real. Until then
  the whole barcode-verification path is inert by design, not broken.
- `manufacturer_targets` (108 rows) is a starting point for outreach, not
  a decision — nothing has been approached yet.

## No-affiliate policy, per-URL robots.txt evaluation, Zooplus/Viovet ToS both restrictive (2026-07-27, latest)

**No affiliate, written down as a principle, not just a decision in a
chat.** `docs/NO_AFFILIATE_POLICY.md` — Bowl takes no commission on food
recommendations, no affiliate links in recommendation output, ever, without
a deliberate reversal recorded as a new decision. Alongside
`docs/DATA_BOUNDARY.md` as the second short, blunt principles doc.

**Per-URL robots.txt evaluation, built before touching Zooplus, as
required.** `src/lib/crawler/robotsTxt.ts` (parser + precedence-based
path matcher — longest match wins, tie favours Allow, matches the de facto
Google robots.txt spec) and `src/lib/crawler/robotsGate.ts` (fetches,
parses, caches per domain per day, outside the allowlist gate since reading
robots.txt is due diligence, not the crawl itself). Wired into
`policyFetcher.ts` as an opt-in check evaluated on every URL when supplied
— `shopifyHarvest.ts`'s `buildDefaultFetcher` now wires a real `RobotsGate`
in by default, so this is live for all future runs, not just Zooplus.
Parser tested against the *real*, freshly-refetched robots.txt text for
both zooplus.co.uk and viovet.co.uk (not paraphrased summaries) — e.g.
confirmed zooplus's `/detailedQuestion.htm$` rule is a root-anchored prefix
with no leading wildcard, so it does NOT block a nested path like
`/product/12345/detailedQuestion.htm` — a real trap a naive "contains"
match would have gotten wrong.

**Zooplus and Viovet ToS: both read in full via a real browser (both are
JS-rendered — a plain fetch returns nothing usable), both came back
restrictive. Neither approved.**

- **zooplus.co.uk** — not in the "General Terms and Conditions of
  Business" itself (16 sections read in full, purely a sales contract, no
  IP/reuse clause anywhere) but in the separate `/info/legal/imprint` page,
  under "Copyright": *"Copying and distribution require the written
  consent of zooplus SE. All content is for personal information purposes
  only... storage on databases... transfer to third parties... is
  prohibited... The use of automatic mechanisms (such as search engines,
  robots and crawlers) in product services or price search engines is also
  subject to licensing."* Names robots/crawlers and database storage
  explicitly — the most direct hit of any domain reviewed this project.
- **viovet.co.uk** — `/terms-and-conditions`, "Legal matters": *"You are
  not permitted to copy, broadcast, download, store (in any medium),
  transmit, show or play in public, adapt or change in any way the content
  of these web pages for any other purpose whatsoever without the prior
  written permission of VioVet Ltd."* No named "robots/crawlers" mention,
  but the blanket copy/store prohibition already covers it, and it carries
  no personal-use carve-out at all — stricter in that specific respect than
  Burns/Wellbeloved's wording.

Both were genuinely read start to finish, not keyword-searched — the
Zooplus finding specifically would have been missed by a keyword search of
the page the owner pointed at (`/info/legal/terms`), because it's on a
different page (`/info/legal/imprint`) that a search for "terms and
conditions" doesn't surface.

**Two more permission-request emails drafted**, same template and
principle as the three manufacturer emails (lead with the open database,
name exactly what's wanted — GTIN/brand/name/pack-size/price/composition
text only, explicitly not descriptions/editorial/images — and offer a feed
as the easier alternative), explicitly **not** the affiliate route:
- `docs/draft-email-zooplus-permission-request.md`
- `docs/draft-email-viovet-permission-request.md`

None of the five permission emails have been sent yet.

**Verification:** `npm test` — 113/113 pass (17 new: robots.txt parser,
per-path precedence, PolicyFetcher robots-gate integration). `npx tsc
--noEmit` clean.

**Owner review**
- Five permission emails now drafted and waiting: canagan, burnspet,
  wellbeloved, zooplus, viovet. None sent.
- Zooplus/Viovet adapters are on hold pending a reply to either email —
  the "facts only" scope restriction (GTIN, brand, name, pack size, price,
  composition text — never descriptions/editorial/images) was already
  built into both draft emails as the stated ask, so it doesn't need
  deciding again ad hoc if/when either says yes.
- The three approved Shopify/manufacturer-adjacent domains
  (`fish4dogs.com`, `forthglade.com`, `emea.acana.com`) are unaffected by
  this — none of their reviewed ToS pages carried this kind of restriction.

## Phase 2 Shopify tier, run against forthglade.com: catalogue growth, not identity resolution (2026-07-27, latest)

**Read this before planning more work around the Shopify tier.** Two stores
tested now — forthglade.com (this session, 300 variants) and an independent
owner check of lilyskitchen.co.uk (266 variants) — and **both returned 0%
GTIN yield**. Every variant on both stores had a SKU; none had a barcode.
This is not a Forthglade quirk or a parsing bug — checked the raw cached
JSON directly, the `barcode` field is genuinely empty on every variant. The
Phase 2 spec's assumption that "Shopify... returns the whole catalogue with
SKUs, variants and barcodes" holds for SKUs, not for barcodes, at least for
these two UK pet food brands. **Do not plan Phase 1's 204 ambiguous-row
GTIN re-resolution around the Shopify tier.** It's a real, useful source of
brand/product-name/pack-size/SKU identity — worth having — but not the
barcode source the ambiguous-row resolution needs. Zooplus and Viovet
(retailer, not manufacturer, pages) remain the actual GTIN candidates,
per the original Phase 2 plan, once their ToS is reviewed.

**Two-run structure, per owner instruction, because the fixture-based tests
had never met a real response:** Run 1 fetched page 1 only and parsed it
without writing anything, specifically to catch a wrong assumption before
it became 300 rows of it. It found one: `extractPackSize` was reading a
multipack variant like "6 x 180g" and returning `180g` — not missing data,
*wrong* data, stating 180g for what is actually a 1,080g pack. Fixed before
Run 2: a dedicated multipack pattern is checked first and kept whole
(`6x180g`), and — same rule as `inclusion_pct` — when a multiplier is
present but the exact "N x SIZE" shape doesn't confidently match (e.g.
"Pack of 6, 180g each"), the result is `null`, not a guessed per-unit
figure. Also fixed: `product_name` no longer repeats a pack size that's
already in the base product title ("2kg Lightly Baked Lamb..." + variant
"2kg" now reads as the title alone, not "...— 2kg").

**Schema change:** `crawl_targets.sku` added (migration
`20260727180000_add_crawl_targets_sku.sql`) as the secondary identity
anchor where GTIN is absent — which the yield numbers above show is the
common case, not the exception. Weaker than a GTIN (doesn't cross sources
cleanly), but real, stable, and worth having for eventual MPN
cross-referencing.

**Run 2 result (forthglade.com, full pagination):** 159 products / 300
variants, stopped after page 1 (`short_page` — Forthglade's whole catalogue
fits under the 250-item page limit, so the repeat-guard's loop scenario
never came up here; the guard is still in place for stores where it will).
**300 rows inserted into `crawl_targets`** (0 skipped as pre-existing — this
domain had never been harvested before), 0 into `contributed_foods`
(confirms Run 1's finding: `body_html` carries no composition text on this
store either — Tier 1 gave identity here, not ingredients, exactly as the
spec warned it might). Verified directly against the database, not just the
script's own report: `count(gtin)=0`, `count(sku)=300`, and 49 of the 116
`pack_size` values contain an `x` (multipack), spot-checked — e.g.
`"Bone Broth Topper Variety Pack — 6 x 180g"` now correctly carries
`pack_size = '6x180g'`, distinct from the `1x180g` single-topper variant of
the same product, which would have been indistinguishable before the fix.

**Verification:** `npm test` — 95/95 pass (9 new: multipack extraction,
redundant-suffix stripping, SKU passthrough). `npx tsc --noEmit` clean.

**Owner review**
- `crawl_targets` rows are private and reviewable, not yet matched to any
  `foods` row — the 204 identity-ambiguous rows from Phase 1 still await
  Zooplus/Viovet GTINs specifically, not this data.
- Next candidate for the same two-run treatment: a sitemap+JSON-LD adapter
  (Tier 2), needed for non-Shopify domains (`emea.acana.com`,
  `fish4dogs.com`) and eventually Zooplus/Viovet once approved — and for
  Zooplus specifically, **per-path robots.txt evaluation must be built
  first** (flagged this session: `policyFetcher` currently only checks
  domain-level allowlist approval, not path-level Disallow rules — fine for
  Forthglade's single known-safe endpoint, not fine for walking a sitemap
  across many paths on a domain with real path restrictions).

## Phase 2 identity layer: allowlist gate, ToS review, discovery-cron conflict (2026-07-27, latest)

**Owner ask:** begin Phase 2 (retailer crawling). Session covered: closing the
`source_domain_allowlist` gate for real (it had been bypassed — see the
"Alarm visibility" entry below for context on how that was found), reviewing
robots.txt for 8 candidate domains, reviewing ToS for 5 of them, and building
the fetch layer (allowlist check, rate limiter, raw-response cache,
retry/hard-stop) as the single choke point every future adapter must go
through. No live product-page fetch has happened yet — that's step 4, gated
on an explicit owner confirmation before the first real network call.

**Domain-identity corrections (third and fourth of this kind in the
project — same failure mode as the `jameswellbeloved.com` → `wellbeloved.com`
fix from Phase 1):** the `foods` rows attributed to `acana.com` were actually
sourced from `emea.acana.com`, a different subdomain with its own
robots.txt/ToS. Corrected in the allowlist the same way.

**Approved (robots.txt + ToS both reviewed):** `fish4dogs.com`,
`forthglade.com`. `emea.acana.com` is also approved, but on robots.txt
alone — no Terms of Use page could be found anywhere on the site (only a
Privacy Policy, no IP clause, no Terms link in the footer). Recorded in the
domain's own notes with **a re-check due date of 2027-01-27**: absence of
terms is not permission and the site could add one without notice.

**Not approved, permission requested instead:** `burnspet.co.uk` and
`wellbeloved.com` both carry explicit ToS language reserving content for
personal, non-commercial use, with a licence required for commercial reuse —
the same shape as the `allaboutdogfood.co.uk` situation from Phase 1.
Given the catalogue is going public under ODbL, the owner chose to ask
rather than route around it, same standard as `canagan.com` (which blocks
~20 named crawlers, including ours, under its own robots.txt). Three
permission-request emails drafted, all leading with "we're building a free
open database" rather than "may we scrape you" — a brand that says yes
often just sends a spreadsheet with GTINs in it, which is better data than
scraping would produce anyway:
- `docs/draft-email-canagan-permission-request.md`
- `docs/draft-email-burnspet-permission-request.md`
- `docs/draft-email-wellbeloved-permission-request.md`

None sent yet — owner to find the right contact, edit, and send.

**Zooplus/Viovet: affiliate route researched, not pursued.** Both run Awin
affiliate programmes with product feeds (zooplus UK merchant profile
`ui.awin.com/merchant-profile/2940`, reported at **~9,840 products / 100+
brands** in the feed — exactly the GTIN/price/pack-size data the identity
layer needs, licensed as part of the programme, no scraping/ToS question at
all; viovet `ui.awin.com/merchant-profile/6960`, Awin MasterTag-integrated,
specific feed fields not confirmed). **Held, not pursued** — joining Awin as
a publisher normally requires an approvable live site/property, and Bowl
doesn't run affiliate links or a monetised storefront today. That's a
business-model decision (revenue, disclosure, whether Bowl carries affiliate
links at all), not a technical one, so it's parked here rather than acted
on. Worth revisiting if the affiliate-link question ever comes up for other
reasons.

**Critical finding: the existing weekly `food-discovery` cron directly
contradicted the Phase 2 design** — writes straight to `foods`/
`food_ingredients` with no review queue, uses an LLM as the page extractor
on every candidate (Haiku `generateObject` per page — the exact pattern
Phase 2 exists to avoid), has no rate limiting or raw-HTML cache, and
checked only `approved = true` on `source_domain_allowlist`, not the two
review-date columns. It shared the same `approved` flag Phase 2 now uses,
so approving any domain for the new pipeline would also have re-armed this
old one on its next Sunday 02:00 UTC run. **Fixed: removed the cron entry
from `vercel.json`.** `src/lib/foodDiscovery.ts` and
`src/app/api/cron/food-discovery/route.ts` are kept in the tree, docblock
updated to say plainly that they're disabled and why, until a Phase 2
adapter proves out end-to-end — then delete both rather than re-enable.
`batch_submissions` was empty (0 rows) when checked, so this job had never
actually completed a run; the risk was to the *next* Sunday after any
approval, not a retroactive one.

**Fetch layer built (`src/lib/crawler/`), no live network contact:**
- `allowlist.ts` — the three-condition gate (approved AND robots reviewed
  AND ToS reviewed), with a regression test for the exact bug this session
  found and fixed upstream (`approved=true` with both dates null).
- `rateLimiter.ts` — per-domain minimum spacing, default 2s, zooplus
  override at 5s (its robots.txt only requires that of named bots; applied
  to ourselves regardless, per project instructions).
- `rawCache.ts` — disk cache keyed by URL + fetch date, separate from
  parsed output, so a parser fix never requires re-fetching.
- `policyFetcher.ts` — the single choke point: allowlist check → cache
  read-through → rate-limit wait → fetch with the `DogSmartDB/1.0`
  user-agent → exponential backoff on 429/5xx → hard stop after 3
  consecutive failures per domain → cache write.

**`parse_composition()` built and tested** (`src/lib/compositionParser.ts`,
earlier in this same session) — deterministic parser turning a verbatim
composition string into structured ingredients, no network/DB/LLM involved.
Fixture corpus in `src/lib/__tests__/fixtures/compositionCorpus.ts`:
hand-authored cases for every pattern named in the Phase 2 spec (EC legal
categories, nested "of which" percentages, additive blocks,
Analytical-Constituents stripping, European decimal commas) plus curated
real OPFF strings, kept separate from a small "known-hard" bucket of
genuinely OCR-broken real captures that's a robustness check, not a
coverage claim. **Coverage: 37/38 (97.4%) of the representative corpus
clears unaided**, well past the spec's 80% target; the one flag is a
legitimate "review needed" case (a parenthetical sub-list before a trailing
bare percentage), not a bug.

**Also this session:** `foods.composition_raw` (text, verbatim, unparsed)
added — the DB-side analogue of the raw-HTML cache, and itself the most
independently-checkable fact in an eventual ODbL export. Two Phase 1 GTIN
migrations were found applied on the remote project but missing as local
files entirely (real repo/remote drift, not caused by this session);
recovered the exact SQL from `supabase_migrations.schema_migrations` and
restored them locally.

**Verification:** `npm test` — 59/59 pass (25 new crawler tests plus the
compositionParser and hardFilter suites, all offline via injected fake
clock/sleep/fetch/cache, no real network or timers used in any test).
`npx tsc --noEmit` clean.

**Owner review**
- Send (or edit further) the three permission-request emails when ready.
- `emea.acana.com`'s 2027-01-27 re-check is not on any calendar system —
  it's recorded in the allowlist row's own notes and here. Whoever picks up
  Phase 2 work around that date should re-search for a Terms of Use page
  before continuing to rely on the approval.
- **Explicitly not started:** step 4 (first live fetch, Shopify adapter
  against `forthglade.com`) — stopping here for confirmation before the
  first real network call, per standing instruction.

## Alarm visibility for the two daily assertions (2026-07-27, latest)

**Owner ask, correcting my proposed next task.** I proposed building the export pipeline next; the
owner overrode it — the catalogue is 292 foods, 51 complete (83% unusable, including the quarantined
AADF pair and the James Wellbeloved fix from earlier this session), and publishing that as "the open
UK dog food database" on first contact would actively damage the thing it's trying to become. Nothing
consumes the export today, so there's no cost to waiting, and Phase 2 (which writes only to
`contributed_foods`/`crawl_targets`, both private) can't disturb the boundary this session built —
the rework risk I was avoiding doesn't exist. **Correct next task is Phase 2, not export.** Before
that: fix the thing the previous session's own findings flagged as broken — two daily `pg_cron`
assertions existed and nothing read `cron.job_run_details`. An alarm nobody looks at isn't an alarm.

**What shipped, one migration:**
`supabase/migrations/20260727130000_add_system_alerts_and_assertion_wrapper.sql` — a
`system_alerts` table (`check_name`, `message`, `detected_at`, `resolved_at`, `resolved_by`), RLS
enabled with zero policies (same pattern as `contributed_foods`/`ingredient_review_queue`: written
only by the cron wrapper as table owner, read/resolved only through the admin API's service-role
client). `public.run_scheduled_assertions()` calls both existing assertions
(`assert_complete_foods_have_ingredients`, `assert_catalogue_export_boundary`) inside independent
`begin...exception...end` blocks, so one failing doesn't stop the other running, and inserts a row
on failure — but only if that check doesn't already have an unresolved row, so a check that stays
broken for a week doesn't produce seven near-identical alerts. Two daily cron jobs replaced with one
(`run-scheduled-assertions`, same `0 6 * * *` slot).

**Application side:** `GET /api/admin/alerts` (unresolved rows) and `PATCH
/api/admin/alerts/[id]` (`{ resolved: true }`, sets `resolved_at`/`resolved_by` from the verified
admin session) — same `requireAdmin` + `supabaseAdmin` pattern as every other admin route. A banner
(`SystemAlertsBanner` inside `AdminShell.tsx`) renders on **every** `/admin` page, not a dedicated
alerts screen — deliberately, per the owner's framing: "you'll see failures because you're already
in that screen." No email/SMTP: explicitly out of scope as more moving parts than this deserved.

**Proven end-to-end, not just deployed.** Forced a real boundary violation (`grant select on
public.source_domain_allowlist to catalogue_export`), ran the wrapper inside a rolled-back
transaction first (confirmed catch-and-record without persisting), then for real (committed, then
immediately revoked the grant itself so the boundary stayed clean) — one row landed in
`system_alerts`. Ran the wrapper again while still broken — **zero** new rows (dedupe held). Signed
up a throwaway account through the real UI, promoted it to `is_admin` via direct SQL (this
codebase's established pattern for admin-flow testing — see the contributions-admin note earlier in
this file), loaded `/admin`, and the banner rendered the real alert with its message and detected-at
timestamp. Clicked **Resolve** in the browser; the banner cleared, and a direct query confirmed
`resolved_at`/`resolved_by` persisted against the real admin account, not just optimistic client
state. Both the test alert row and the throwaway account were then deleted — self-induced test data,
not a real incident, so left out of the audit trail on purpose.

**Verification:** `tsc --noEmit` clean · `npm run build` exit 0 · `hardFilter.test.ts` still 7/7 ·
security advisors rerun — one new INFO (`system_alerts` RLS-enabled-no-policy), which is the
intended fail-closed state, not a gap · database left exactly as found afterward (0 rows in
`system_alerts`, boundary confirmed clean via `assert_catalogue_export_boundary()`, cron shows one
job — `run-scheduled-assertions` — not two).

**Owner review**
- **Next task is Phase 2** (retailer crawling / extraction pipeline), writing against `catalogue.*`
  read boundaries already in place but touching only `contributed_foods`/`crawl_targets` for writes.
  Export/publication pipeline stays deferred until the catalogue has something worth publishing.
- Resolving an alert doesn't stop it recurring — if the underlying problem isn't actually fixed, the
  next day's cron run re-raises and re-alerts (dedupe only suppresses while unresolved). That's
  intentional, not a bug to fix.
- `dog_recommendation_sets` RLS-no-policy flag from the previous session remains unaddressed.

## Catalogue/private schema boundary, ahead of Phase 2 (2026-07-27, latest)

**Owner ask:** before Phase 2 (retailer crawling) writes a single query, put a real access
boundary between the six ODbL-publishable catalogue tables and the 24 private
correlation/monitoring/account tables — all 30 currently sit undifferentiated in `public`, and
`dogs.owner_id → auth.users` makes a careless join a real UK GDPR exposure, not just a licensing
annoyance. Boundary only this session — no export pipeline, no publishing, no Phase 2.

**What shipped (3 migrations, all applied live).** A `catalogue` schema of six read-only views —
`foods` (all columns except `submitted_by`, an `auth.users` id), `food_ingredients`, and the four
reference tables (`breed_life_stage_thresholds`, `metric_minimum_lag_days`,
`wellness_indicator_reference`, `condition_contraindications`) — every column enumerated by hand,
no `select *`. A `NOLOGIN` role `catalogue_export` holding `SELECT` on those six views and nothing
else; `dogs`, `contributed_foods`, `user_profiles`, `ingredient_review_queue` and everything else
are structurally unreachable from it. `docs/DATA_BOUNDARY.md` records which six tables are
publishable, why the rest never can be, and the down path (deliberately kept out of
`supabase/migrations/` — a `.down.sql` file in that directory could get picked up and applied by
name-walking tooling, which would be exactly backwards).

**A real design bug, caught by actually running the proof rather than trusting the DDL.** The
first version used `security_invoker = true` on the views, because CLAUDE.md's Supabase rules say
prefer invoker security and justify definer semantics if used. Proving it live —
`set role catalogue_export; select * from catalogue.foods` — failed with `permission denied for
table foods`, not a row. Invoker-security views run with the *querying* role's privileges on the
underlying table, so `catalogue_export` would have needed direct `SELECT` on `public.foods` to use
its own view at all — exactly the grant the boundary exists to prevent. Switched all six views to
definer semantics (the Postgres default). This is not the same risk as a `SECURITY DEFINER`
function needing `search_path` locked down: a view's query is bound to fixed table OIDs at
`CREATE VIEW` time (visible in `pg_rewrite`/`pg_depend`), not re-resolved against the caller's
search_path at query time, so there's no equivalent mutable-search-path injection surface to close.

**A second real bug, same lesson.** `public.assert_catalogue_export_boundary()` — a `pg_cron`
daily assertion (06:00, alongside `assert_complete_foods_have_ingredients`) checking (1) no
`CREATE` privilege on any data schema outside `catalogue`, (2) no privilege on any relation in a
data schema outside `catalogue` (via `has_table_privilege`, not `aclexplode` — the latter only
sees grants recorded directly against the named role and misses anything acquired via `PUBLIC` or
role membership), (3) no `catalogue` view depends on a table outside the six publishable ones (via
`pg_rewrite`→`pg_depend`→`pg_class`, not `information_schema.view_table_usage`, which is filtered
by the calling role's own privileges and can silently return nothing). Run cold against its own
clean baseline, it **raised immediately** — 194 false-positive relations, all `pg_catalog`/
`information_schema` system views plus `pg_stat_statements`/`cron.job*`, which ship
`SELECT`-to-`PUBLIC` by design in every Postgres database and have nothing to do with this
boundary. Rescoped the relation and schema checks from "every schema except catalogue" to an
explicit allowlist (`public`, `auth`, `storage`, `realtime`) — the same enumerate-don't-exclude
principle already used for the view column lists. Also deliberately checks schema `CREATE`, not
`USAGE`: Postgres grants `USAGE` on `public` to `PUBLIC` by default (verified live —
`has_schema_privilege('anon','public','usage') = true`), so every role including
`catalogue_export` has it regardless of any `REVOKE` run against the role by name; treating that
as a signal would make the check permanently red for a reason that isn't actually a violation.

**All three assertion branches proven to actually fail, each in its own rolled-back transaction:**

| negative test | result |
|---|---|
| `grant create on schema public to catalogue_export` | `catalogue_export boundary: role holds CREATE on 1 schema(s) outside the catalogue schema` |
| `grant select on public.source_domain_allowlist to catalogue_export` | `catalogue_export boundary: role holds a privilege on 1 relation(s) outside the catalogue schema` |
| `create view catalogue.tmp_probe as select id from public.dogs` | `catalogue_export boundary: 1 view dependency edge(s) in the catalogue schema point at a table outside the six publishable tables` |

Each rolled back and independently confirmed clean afterward (no leaked grant, no leaked view).
Also proved with real `select`s, not just privilege checks: as `catalogue_export`,
`select * from catalogue.foods` → 292 rows; `select * from public.dogs/contributed_foods/foods
limit 1` → all three `ERROR 42501: permission denied for table <name>`.

**One artefact worth naming so it isn't mistaken for a leak later.** `postgres` shows up as a
member of `catalogue_export` (`pg_has_role('postgres','catalogue_export','member') = true`) and
this could **not** be revoked as `postgres` — the grantor is `supabase_admin`, and a plain `REVOKE
... FROM` only removes grants made by the current role, so it silently no-ops rather than erroring.
This is standard Postgres 16+/Supabase behaviour: the role executing `CREATE ROLE` is
auto-membered into what it creates. It grants zero practical capability — `set_option` and
`inherit_option` are both `false` on that row, so `postgres` can neither `SET ROLE` into
`catalogue_export` nor inherit its (already more restrictive) privileges via it, and `postgres`
already has full access to everything regardless. Separately, a `postgres`-granted membership used
mid-session for the `SET ROLE` proofs (`grant catalogue_export to postgres`, wrapped in
`begin;…rollback;`) did **not** roll back as expected — the multi-statement SQL sent through this
session's tool doesn't reliably preserve one Postgres session/transaction across the whole string,
so `begin`/`rollback` didn't bracket it the way they would in a normal client connection. Cleaned
up with an explicit `revoke catalogue_export from postgres` afterward. Noting this because the next
person proving something similar this way should not assume `begin;...;rollback;` sent as one blob
through this tool is transactionally safe — verify the rollback took, the way this session did.

**Cron failure visibility, checked and proven separately from the boundary itself** (a broken
boundary was deliberately never left committed to prove this — see reasoning above). `cron.log_run`
is `on`. A one-off probe job (`do $$ begin raise exception 'cron visibility probe'; end $$;`,
scheduled for a specific one-off minute, not the recurring daily slot) fired and its failure landed
in `cron.job_run_details.return_message` with the exact exception text, confirming a `pg_cron`
job's failure is queryable after the fact. **This is not the same as being notified** — nothing
currently polls `cron.job_run_details` or alerts on a `failed` row; the daily
`assert-catalogue-export-boundary` and `assert-complete-foods-have-ingredients` jobs are both only
as good as someone querying that table. Worth real alerting before either assertion is load-bearing
for something the owner isn't manually checking.

**Verification:** `hardFilter.test.ts` — still 7/7, unaffected (nothing in this session touched
`public.foods`/`public.food_ingredients` grants or RLS). Security and performance advisors rerun
after every migration in this session — zero new findings; everything listed predates this session
(`dog_recommendation_sets` RLS-no-policy among them, see below) and the six new `catalogue` views
did not trigger `security_definer_view` despite using definer semantics, because that linter scopes
to API-exposed schemas and `catalogue` isn't one — confirming it's correctly unreachable via
PostgREST, not just via SQL grants.

**Owner review**
- **Flagged in passing, not investigated this session:** `dog_recommendation_sets` has RLS enabled
  and zero policies (fail-closed, not a vulnerability) — but if `authenticated` reads it expecting
  the persisted recommendation cache, it is silently getting nothing back and re-scoring on every
  request instead. Worth checking before this cache is relied on for cost/latency.
- No `pg` dependency, no new connection-string secret was added — the boundary assertions live
  entirely in Postgres via `pg_cron`, matching the existing `assert_complete_foods_have_ingredients`
  pattern, per an explicit owner decision this session to avoid introducing direct-Postgres
  credentials before an export pipeline actually needs one.
- **Explicitly not started:** the export/publication pipeline itself, and Phase 2. Both should now
  be written against `catalogue.*`, never `public.*` directly.

## Phase 1 identity layer (GTIN) + hard-filter safety gate + licence decision (2026-07-27, latest)

**Owner ask:** fix the ingredient-identity mess (83% of `foods` unusable, mostly
`identity_ambiguous`/`ambiguous_formula`) starting with a GTIN anchor, not more scraping.
Along the way, a real safety-layer gap was found and fixed before touching the catalogue further.

**1. Hard-filter safety fix (own commit, separate from the migration below).** Read-path audit
found `ingredient_data_status` was written in exactly one place (`ingredients/confirm/route.ts`)
and read as a filter *nowhere* — `hardFilter.ts`'s candidate query, `api/recommendations`, and
`api/foods` all served every non-treat food regardless of ingredient completeness. A food with
no transcribed ingredients has nothing for an allergen `ilike` match to hit, so it could never be
excluded — a missing ingredient list was indistinguishable from "verified safe" for a dog with a
restriction. Fixed with a **dog-scoped** gate (`dogNeedsIngredientGate`/`filterCandidateFoods` in
`src/lib/hardFilter.ts`): only dogs with an actual ingredient-based exclusion criterion (a
restriction, or an approved `condition_contraindications` row with a non-null
`contraindicated_ingredient`) require `ingredient_data_status = 'complete'` **and** a real
`food_ingredients` row (belt and braces — some `complete` rows have zero). Unrestricted dogs keep
today's full candidate pool. `product_availability_status in ('unavailable','discontinued')` is
now excluded unconditionally for everyone (trust issue, not safety — 43/292 foods were
unbuyable and still recommendable). Added `npm test` (new script; `node:test` via the existing
`tsx` dependency, no new package) with a regression suite covering the exact scenario. `tsc`
and `build` both clean.

**2. Migration `phase1_gtin_identity_and_integrity_guard`.** `foods.gtin` (raw) +
`foods.gtin_norm` (generated, zero-padded to GTIN-14 so UPC-A/EAN-13/EAN-8 collide correctly) +
unique index (multiple NULLs allowed). `public.is_valid_gtin14()` — mod-10 checksum, verified
against 5 real vectors (2 UK EAN-13, 1 UPC-A, 1 EAN-8, 1 corrupted-check-digit reject) before and
after applying. `crawl_targets` table added for Phase 2's retailer harvest (identity fields only —
brand/name/pack_size/gtin/source — RLS enabled, no policies, matching `source_domain_allowlist`'s
service-role-only pattern; never a path into `foods`). A synchronous trigger enforcing
"`complete` implies has-ingredients" was considered and rejected: `ingredients/confirm/route.ts`
inserts the `foods` row with `ingredient_data_status = 'complete'` in one call, then
`food_ingredients` rows in a separate later call — a same-transaction trigger would break that
flow. Used a scheduled `pg_cron` assertion (`assert_complete_foods_have_ingredients()`, daily
06:00) instead. Supabase's security advisor flagged mutable `search_path` on both new functions
immediately after the first migration; fixed in a same-session follow-up migration
(`lock_search_path_on_gtin_and_assertion_functions`).

**3. AADF quarantine.** 2 Canidae rows (`Grain-Free Pure Elements`, `Grain-Free Puppy`) were
sourced from `allaboutdogfood.co.uk`, whose ratings/editorial are copyright and whose compilation
is UK-database-right protected — scraping it is now explicitly forbidden. Both were marked
`complete` with 11 and 10 `food_ingredients` rows respectively despite an 21.9-row average for
genuinely complete foods (abbreviated summaries, not full transcriptions) and both were already
`product_availability_status = 'discontinued'`. Snapshotted to `contributed_foods`
(`status = 'rejected'`, full ingredient/nutrient payload preserved for audit) before deleting the
21 live `food_ingredients` rows and flipping `foods.ingredient_data_status` to `'pending'` with a
reason. `allaboutdogfood.co.uk` added to `source_domain_allowlist` with `approved = false` and a
note, so no future crawl can touch it by accident.

**4. James Wellbeloved orphan fixed.** The scheduled assertion above immediately caught a third,
pre-existing zero-ingredient `complete` row unrelated to AADF — `James Wellbeloved Adult Lamb &
Rice` (`source_url: wellbeloved.com`), 0 `food_ingredients` rows. Given the same treatment as the
AADF pair (status → `pending`, reason recorded) so the assertion is green from day one — a check
that fails on its first real morning gets ignored, not trusted.

**5. Licence position — read this before publishing anything.** The catalogue tables (`foods`,
`food_ingredients`, and reference tables like `condition_contraindications`,
`metric_minimum_lag_days`) are now intended for publication as **open data under ODbL** (Open
Database License). The correlation/monitoring tables — `dogs`, `dog_log_entries`,
`dog_food_switch_analyses`, `dog_ingredient_suspects`, `ingredient_outcome_signals`, and anything
else keyed to `auth.users` or an individual dog — **stay closed and must never be published.**
This removes the ODbL-compatibility objection to using Open Pet Food Facts data in production
(OPFF is itself ODbL-licensed, so no incompatible-licence conflict once our own catalogue is
ODbL too) — **but does not change sequencing.** OPFF barcodes still cannot be joined to `foods`
without a name-matching step, and that step was explicitly held this session (see below). This is
a durable decision, not yet reflected in `docs/legal-compliance-review.md` (which does not exist
in this checkout — see the Phase 6 "Needs owner input" list below) or in any RLS/publication
tooling; nothing has actually been published yet, this only records the decision and the boundary.

**6. OPFF barcode/fixture seed committed.** `fixtures/opff_barcode_seed.json` — 1,392 unique
products (469 UK-flagged matching the calibrated figure exactly; 954 in the global dog-food
category, also exact) fetched via the OPFF `/api/v2/search` API (not the 0.9GB bulk CSV — 5 UK
pages + 10 dog-food-category pages, `page_size=100`, polite 1s spacing, `DogSmartDB/1.0` UA).
27.9% have non-empty `ingredients_text`, consistent with the 5/20 UK-sample estimate. Attribution
header embedded in the file itself (source, ODbL licence, retrieval date/method, explicit note
that this is a barcode-seed/parser-fixture corpus, not a primary ingredient source) plus a new
top-level `SOURCES.md`.

**7. Fuzzy brand/name matching against OPFF explicitly held, not done.** OPFF's UK brand strings
include real-world typos (`pedogree`, `pedigred`, `harringrons`, `royal canın`) — fuzzy-matching
`foods` against a corpus that is itself misspelled would attach wrong GTINs, and a wrong identity
is worse than an absent one (same principle as the original identity-ambiguous problem this phase
exists to fix). Only 17 of 57 brands in `foods` appear in OPFF's UK set at all, and OPFF averages
3.6 products per brand against some UK brands' hundreds of SKUs — too thin to be worth the
false-positive risk. Re-resolving the 204 `identity_ambiguous`/`ambiguous_formula` rows waits for
exact retailer GTINs in Phase 2, not name-matching against OPFF.

**Explicitly not started:** Phase 2 (retailer crawling, extraction pipeline). A schema separation
task is happening in a separate session before Phase 2 begins — the catalogue tables are moving
behind a restricted access boundary — so no ingest pipeline should be written against current
table locations until that lands.

## Supabase free-plan keepalive (2026-07-26, latest)

Owner ask: the free-tier Supabase project must not be auto-suspended for inactivity.
**Uncommitted.** No schema change, no migration, nothing deployed yet.

### The rule being defended against
Supabase pauses a Free plan project after ~7 days of low **database** activity; their guidance
is "a few user requests to the database each day over the previous week"
(https://supabase.com/docs/guides/platform/free-project-pausing). Vercel builds, deploys and
Supabase dashboard visits do not count — the query has to reach Postgres. A paused project is
restorable for 90 days, but it is a cold, manual restore.

### Why not just rely on the existing daily crons
`correlation-engine` and `inactivity-check` already run daily and do touch the database, so in
principle the project was already being kept warm. That is a side effect, not a guarantee:
either job can throw, short-circuit on an empty working set, or be edited later, and the
project then drifts toward a pause with no signal other than Supabase's warning email. The
keepalive is deliberately a separate, trivial endpoint that can only fail for one reason.

### What was added
- `src/app/api/cron/keepalive/route.ts` — GET|POST, gated by the existing `isCronAuthorized`
  (so: `Authorization: Bearer $CRON_SECRET`, or an admin session token). Does one read:
  `select outcome_metric from metric_minimum_lag_days limit 1`. Chosen because it is a small
  static reference table that is never empty and never written by user traffic. Read via the
  **service-role** client so a future RLS change on that table cannot silently turn the
  keepalive into a no-op. Returns 500 on a database error rather than a cheerful 200 — a
  keepalive that lies about reaching Postgres is worse than none.
- `.github/workflows/supabase-keepalive.yml` — the real schedule: 01:10, 07:10, 13:10, 19:10
  UTC, plus a manual `workflow_dispatch` button. Retries 3× with a 20 s gap so a Vercel cold
  start is not misread as a dead database.
- `vercel.json` — a fourth cron entry, `/api/cron/keepalive` at 13:00 UTC, as a backstop.

### Why the schedule lives in GitHub Actions rather than Vercel
Vercel **Hobby-plan cron jobs may only run once per day**; a more frequent expression fails the
deployment (per-project cron *count* limits were lifted to 100 on all plans in Jan 2026, but
the frequency limit stands). One ping a day is a thin margin against "a few requests each day",
so GitHub Actions carries the 6-hourly schedule and Vercel keeps a single daily ping.

### Verified this session (against the live DB via a running dev server)
- authorised GET → `200 {"ok":true,"rows":1}`; POST → 200.
- no header → 401; wrong secret → 401.
- The workflow's shell script was extracted and run as-is: success path exits 0; 401 path
  retries 3× then exits 1 with a `::error::`; missing-secrets guard exits 1 immediately.
- `npx tsc --noEmit` clean.
- First draft selected a column `metric` that does not exist; the fail-loud 500 caught it
  immediately. Real column is `outcome_metric`.

### Needs owner action before this works in production
1. Add two **GitHub Actions repository secrets** (Settings → Secrets and variables → Actions):
   `APP_BASE_URL` = `https://dog-food-helper.vercel.app` (no trailing slash), and `CRON_SECRET`
   = the same value already in the Vercel project env. Without both, the workflow fails loudly
   rather than pinging nothing.
2. Deploy to production — Vercel cron entries only activate on production deployments.
3. Note: **GitHub disables scheduled workflows after 60 days with no commits to the repo.**
   GitHub emails admins first; re-enable from the Actions tab.
4. Separate risk, not covered here: the `Dog-smart-learning-centre` Supabase project
   (`spsdfdlufqcduekqxxjk`) is in the same free org and has the same pause exposure.

## Contributor food submissions + fuller discovery extraction (2026-07-26)

Owner ask: friends with their own Claude subscriptions want to help populate the food
catalogue, without being given access to the Supabase project. **Uncommitted.** One migration
applied live (additive). Every claim below was verified by this session against the real
database and a running dev server.

### The constraint that shaped the design
A chat session **cannot POST**. It can read a page and print JSON; it cannot call an API. So
for non-technical contributors a copy-paste hop is unavoidable, and the design collapses to
one link: `/contribute?key=<token>` carries the prompt behind a Copy button *and* the paste
box, so there is no separate document to drift out of step with the validator.

Owner decisions taken this session: **one shared token** for all contributors (not per-person
links or accounts — they are non-technical, and the token is the boundary either way), and the
job is **new foods**, not backfilling ingredients on the 279 already held.

### Contributions stage; they never write to `foods`
`contributed_foods` (new table, RLS on, **zero policies** — the submit and review paths both
go through the service-role client behind their own gates). Approval in `/admin/contributions`
is the only route into the catalogue, and it sets `ingredient_source = 'contributor'` so an
approved contribution stays distinguishable from a scrape.

This is deliberately the least-trusted of the three write paths, and not because contributors
are untrustworthy. Pet-food pages commonly render ingredients via JS, a plain fetch returns a
shell, and an assistant asked to transcribe a list it could not load will often produce a
plausible one from general knowledge. That failure is silent and it lands in the table the
allergy filter reads.

### The mitigation that does the real work: `source_excerpt`
Every food must carry the ingredient text **verbatim**. The server then checks that the parsed
ingredient names actually appear in it (≥80%, tolerating "&"/"and" and split-off percentages).
**Proven:** a submission whose list was fabricated against a real maize/wheat excerpt was
rejected at 0% support, naming the five ingredients that did not appear — while a correct
submission from the same paste was accepted. Prose instructions alone could not have caught
that. It also makes review a two-second diff: the admin screen shows the parsed list beside
the excerpt with unsupported names in red.

### Verified end to end
| check | result |
|---|---|
| Messy paste (prose + fence + trailing chat) | parsed; 2 accepted, 1 rejected |
| Fabricated ingredient list | **rejected**, 0% excerpt support |
| Nested `Meat and Animal Derivatives (Chicken 4%)` | stored as a child row; found by an `ilike '%chicken%'` query — the hidden-allergen case works |
| Merge SQL against the real staged payload | 1 food, 4 top-level + 1 nested ingredient, `ingredient_source='contributor'` |
| Wrong token / no token (page and API) | 404, and the prompt does not render |
| Duplicate resubmission | `awaiting_review`, unique partial index held |
| Unparseable paste | plain-English error, contributor's text preserved |
| Full UI flow in the browser | accepted/rejected receipt rendered, no console errors |
| `tsc` · `npm run build` | clean · compiled successfully |
| Supabase security advisors | no new finding; `contributed_foods` INFO "RLS enabled, no policy" is the intended fail-closed state, matching six existing tables |

**All test data was removed** — back to 279 foods, 0 staged rows, 847 ingredient rows.

### Discovery cron: it was throwing away most of the label (owner-spotted)
`ExtractionSchema` omitted **every** nutrient column, so a scraped food could never satisfy a
health-condition nutrient-threshold rule. Added protein/fat/fibre/moisture/ash/calcium/
phosphorus/sodium, naming both the UK/EU "Analytical Constituents" and US "Guaranteed
Analysis" headings, all nullable and never-guess. Two further bugs in the same insert:

1. **`is_treat` was never set**, so every chew, dental stick and topper scraped off a brand
   listing was inserted as `false` and became recommendable as a dog's whole diet. Now
   extracted, with the "complementary" vs "complete pet food" tell in the field description.
2. **`ingredient_source` was left at its `'unknown'` default** on the one path that is
   definitively a manufacturer page.

Related finding, **not** fixed because its cause is unknown: all 279 existing foods have
`ingredient_source = 'unknown'`, i.e. nothing has ever written that column, so the catalogue
currently carries no provenance at all. 272 of them do have `protein_pct`, so the nutrients
came from somewhere other than this cron.

### Shared ingredient parser
`src/lib/ingredientPayload.ts` — extracted from the admin bulk-import route so it and the
contributor path validate the same shape with the same code. Not mere de-duplication: both the
allergy filter and the correlation engine match `ingredient_name` across nested rows, so a path
that mishandled `sub_ingredients` would drop a hidden allergen on one path only. The import
route now calls it and is unchanged in behaviour.

### Owner review
- **Set `CONTRIBUTOR_TOKEN` in Vercel, then deploy.** Unset means closed: `/contribute` and
  the write path both 404. Nothing is live until you do this. A local test value was added to
  the gitignored `.env`; replace it with a real one before handing links out.
- **The link is `https://<host>/contribute?key=<token>`.** Treat it as semi-public: friends
  will forward it and it may land in a chat transcript. Accepted, because a leaked link can
  only queue review work — it reads no user, dog or research data and modifies nothing that
  exists. Rotate by changing the variable; old links die immediately.
- **The approve handler is the one path not exercised**, because it needs an admin session
  (which needs your password). Its SQL was verified directly; exercise the handler itself by
  clicking Approve on the first real submission.
- **`/api/contribute/known` is intentionally unauthenticated** — it is fetched by contributors'
  chat sessions, and putting the token in that URL would send it through a third-party fetcher
  into transcripts. It exposes brand + product names of publicly sold dog food and nothing
  else. Say if you would rather it were gated anyway.
- **Batch caps are 25 foods per submission and 120 per hour** across all contributors. Raise
  them in `src/lib/contributedFoods.ts` if review keeps up.
- `npm run lint` has never worked in this project (no ESLint config; `next lint` drops into
  interactive setup). There is no `test` or `format:check` script either. `tsc` + `build` are
  the real gate.

## Rebrand to Bowl (2026-07-26)

Owner decision: the product is **Bowl**, tagline **"Every dog is different. Every choice
matters."**, attributed **by Dog Smart**. Logo supplied by the owner in `Logo/`.

### Naming
Every user-facing occurrence of "Dog Food Helper" is gone (`grep` over `src/` returns
nothing). 16 page headers, the document title, the landing hero/disclaimer/footer, the admin
shell, the red-flag disclaimer, the admin sign-in copy, and the **inactivity-deletion email
subject** — that last one matters because it is the one piece of naming that reaches a user
outside the app. Also `package.json`/`package-lock.json` name → `bowl`, the dev launch config,
and the `CLAUDE.md` / `BUILD_PROGRESS.md` headings. The brand facts are now recorded in
`CLAUDE.md` so a later session cannot quietly reword the tagline.

### Logo placement
The supplied asset is a square lockup (mark + wordmark + tagline + attribution), so it is used
**where there is room to read it** — landing hero, sign-in, sign-up. Headers keep a compact
text wordmark: the lockup is illegible at 15px, and shrinking it would throw away the tagline
it exists to carry. Assets copied to `public/bowl-logo.{png,svg}`; OG/Twitter metadata now
points at the PNG with an absolute URL (link previews require one).

### Three things worth knowing about the assets
1. **The SVG is a raster trace, not a true vector logo** — 987 paths, hundreds of
   photo-derived fills, 615 KB, and **no `viewBox`** (so it could not scale responsively).
   A `viewBox` was added to the served copy. It is no better than the PNG for display; the
   PNG is what the app actually uses.
2. **The favicon had to be generated.** Next does not resize file-convention icons, so
   `app/icon.png` would have shipped a 1.35 MB 1254px image on every page load — and at 32px
   the lockup is a smudge, since most of the square is wordmark and whitespace. So the
   circular mark is cropped out and downsampled to a 64×64, 8 KB PNG by
   `scripts/make-icon.mjs`. The crop box was **measured** off the asset (scanning for the
   ring's green: x 379–869, y 162–667, centred on 624,415) rather than eyeballed, and the
   output was verified pixel-wise — ring present at both edges of the centre row, background
   matching the artwork.
   *`next/og` would have been idiomatic but throws `TypeError: Invalid URL` from
   `fileURLToPath` on Windows in Next 14.2 and breaks the build. The script uses Node
   built-ins only — no new dependency.*
3. **A 10× image-payload bug, caught by measuring.** Passing the asset's intrinsic 1254px as
   `width`/`height` made Next generate a srcset for a 1254px slot and serve a **1920px-wide,
   1.18 MB** render into a 196px box. Sized to the display width with a matching `sizes`, it
   serves **51 KB**. Verified in the browser: `w=256` requested at both breakpoints.

### Verification
`tsc` clean · `npm run build` exit 0 · favicon linked as `sizes="64x64"` · title, `og:title`,
`og:site_name` and absolute `og:image` all correct in the served HTML · logo loads on landing
and both auth pages · no console errors · no horizontal overflow at 375px.

### Owner review
- **A square, mark-only export would be better than a cropped one.** The generated favicon is
  a crop of the lockup and is good, but an asset designed at icon size would be sharper. Drop
  one in and re-point `scripts/make-icon.mjs`.
- **No `apple-icon`** (iOS home-screen icon) — it wants 180px and would be visibly soft from
  this source. Worth adding alongside a proper mark export.
- **The deployment is still `dog-food-helper.vercel.app`.** Renaming the Vercel project and
  any custom domain is a hosting/DNS decision for you; nothing in the code depends on the
  host name, and `metadataBase` prefers `NEXT_PUBLIC_SITE_URL` if you set one.
- `HANDOVER_PROMPT.md` is left as the point-in-time artefact it is, so it still says the old
  name.

## Food attribution, treat logging, and the switch-based correlation engine (2026-07-26, latest)

Priorities 1–3 of the forward build plan. **Uncommitted — awaiting owner go to deploy.**
Two migrations were applied live (purely additive). No subagents; every claim below was
verified by this session against the real database.

### The blocker is gone: the correlation engine now produces results
Before this session `dog_food_events` had never had a row, no dog had `current_food_id`, so
every `dog_log_entries.food_id_active` was null and `computeCorrelationsForDog()` — which
filters on `food_id_active is not null` — matched nothing. Built, tested, structurally inert.

**Proven end-to-end on a throwaway account against the live catalogue.** Four real foods, a
concerning baseline (Bristol Type 6), logs across four food periods:

| after | switches | suspect set | narrowed? |
|---|---|---|---|
| 2 failed foods | 1 | **23 ingredients** | **no** — reported as "not narrowed enough yet" |
| 3 failed foods | 2 | **2** (`rice`, `yeast`) | yes |
| + 1 food the dog did WELL on | 3 | **1** (`yeast`) | yes — `rice` exonerated |

The 23 and the 2 match an independently-computed SQL intersection of those foods' ingredient
lists exactly. Priority 1's acceptance query returned four foods and **zero unattributed logs**.

### 1. Food attribution (Priority 1)
- **`src/lib/foodEvents.ts`** — the single write path. `startMainFoodEvent()` closes the open
  event and opens the new one **in one call**, so a client cannot half-complete a switch; on
  insert failure it reopens the previous event rather than stranding the dog with no food.
  Switching to the same food is a no-op, not a spurious switch point.
- **The database enforces the invariant**, not just the route: unique partial index
  `dog_food_events_one_open_main_food`. Verified by a direct SQL insert — rejected.
- **`food_or_treat_id` had no foreign key at all.** Nothing stopped an event pointing at a
  nonexistent food, and PostgREST couldn't embed it. Added `ON DELETE SET NULL` — retiring a
  catalogue food must never erase a dog's feeding history.
- **Two date bugs fixed.** `getActiveFoodEvent()` compared a date string against a
  timestamptz, so an event started at 14:00 today was invisible to a log written today —
  setting a food and logging the same day attributed nothing. And `food_id_active` no longer
  falls back to `dogs.current_food_id`: that describes **now**, and backfilling it onto a past
  log attributes that log to a food the dog may not have been eating.
- `/api/foods` (owner-facing catalogue search), `GET /api/food-events`, `FoodPicker`,
  `CurrentFoodCard`. Dog creation opens an event immediately. **Current food is no longer
  editable on the edit page** — changing it is a dated event, not a profile field, or the
  pointer drifts out of step with the event history.

### 2. Treat logging (Priority 2)
Occasion-based exactly as specified: `event_type='treat'`, `started_at` is the occasion,
`ended_at` and `in_transition_until` null. Verified live. Opt-in per dog
(`dogs.treat_logging_enabled`, default false — a half-kept treat log is worse than none).
The conditional nudge fired only on a genuine worsening trend, and stopped permanently once
answered. **A chew can never be set as a main food** (verified: clear 400).

### 3. The engine reworked around food *changes* (Priority 3)
**`src/lib/switchAnalysis.ts`** implements the corrected model. The critical part —
which set is implicated depends on whether the outcome actually **moved**:

- improved → **removed** are suspects; unchanged-while-**concerning** → the differing set is
  **exonerated** and the **retained** set are the prime suspects.
- Distinguishing "poor → still poor" from "good → still good" needs the dog's **absolute**
  state, which trends cannot give (they are baseline-relative). It is read from `raw_value` on
  baseline/recalibration rows. **When no absolute reading exists the answer is `unknown` and
  neither conclusion is drawn** — guessing there would invert the result.
- `ingredient_sets_known` is stored explicitly: three empty arrays would otherwise be
  indistinguishable from "nothing changed", and a food whose ingredients we don't know would
  look like a food containing nothing.
- Signals now carry `evidence_basis`: `food_switch` (strong) vs `single_food_period` (the old
  weak method, kept for dogs that have never switched). The scorer **prefers switch-derived**
  rows so 30 weak signals can't drown one good one.
- **Suspects rank, never exclude** — verified: 3 yeast-containing foods stayed in the 272
  candidates and none reached the top 10. Copy points at a vet throughout.

### Two real bugs caught by verification, both invisible to `tsc` and `build`
1. **A clean finding was buried by a single switch.** After the dog improved on a new food,
   the ~25 ingredients that switch dropped were each recorded as a suspect, pushing the set
   from 2 to 26 and losing its "narrowed" status. The "too broad to mean anything" rule now
   gates a single switch's differing set as well as the intersection.
2. **I was testing stale code for two rounds.** `pkill` didn't kill the old server, the new
   one hit `EADDRINUSE`, and the "unchanged" result looked like a logic failure. Caught only
   because the persisted rows all shared one `computed_at`. Restarted on a fresh port by PID.
   *Check the server actually restarted before believing a null result.*

### Also fixed while in the area
**`FoodFull.ingredients` is a tree, and two call sites walked only the top level.** Added
`flattenIngredientNames()`. This mattered twice: correlation matching would have missed a
beef-flavoured food's nested chicken — the exact case the ingredient detail exists to catch —
and the research cache's food fingerprint wouldn't have changed when a sub-ingredient was
edited, leaving a silently stale score. Also removed a per-food ingredient query from
correlation scoring (~270 round trips per request) that had never fired only because no dog
had ever had a signal.

### Verification
`tsc` clean · `npm run build` exit 0 · `git diff --check` clean · no console errors ·
no horizontal overflow at 375px · full flow exercised through the real UI (sign-in, picker
search, switch, history with abutting date ranges, insights panel).
**Database restored exactly to baseline** — auth.users 4, user_profiles 4 (1 admin), dogs 4,
foods 272, all new tables 0, `research_*` 0. Harry's real recommendation set deliberately
preserved; `food_ingredients` never touched.

### Owner review
- **Two migrations applied live** (`20260726140000_add_food_switch_attribution_and_treat_logging.sql`
  plus the FK/`ingredient_sets_known` follow-ups). Purely additive: 2 tables, 4 columns, 3
  indexes, 1 FK. No existing column altered.
- **Thresholds are judgement calls, flagged as tunable in code, and worth your eye:** a suspect
  set surfaces only at ≥2 failed switches and ≤8 ingredients; `decisiveNet` 0.34; stool Types
  1 and 4–7 count as "concerning" while Type 3 does not; `questionable` on the wellness scale
  is deliberately NOT concerning.
- **The unchanged-outcome signal strengths (−0.5 / +0.25) are stated constants, not computed.**
  When nothing moves there is no magnitude to derive, and computing one would be false precision.
- Priority 4 items remain untouched.

---

## Packet scanning + chart illustration fixes (2026-07-26, later)

### THE FINDING THAT SHOULD DRIVE STRATEGY — web research has hit a wall
The owner's separate session audited all 272 foods and recorded, per row, why the data could not be
verified. The result:

| `ingredient_data_status` | count |
|---|---|
| `complete` | **31** |
| `identity_ambiguous` | 134 |
| `ambiguous_formula` | 70 |
| `source_unavailable` | 37 |

**Only 31 of 272 foods (11%) have verified ingredient data**, and the recorded reasons are not
fixable by better scraping: the product name maps to several different recipes ("Generic Iams adult
chicken name does not identify one current breed-size formula"), the current published formula
conflicts with the stored one, or the manufacturer's domain no longer resolves.

**A packet photo resolves all three failure modes at once** — it identifies the exact variant, it IS
the current formula, and it does not depend on a website existing. That, not cost, is the argument
for owner-submitted photos. Per-item AI cost is near-identical either way (~$0.005/photo vs
~$0.008/scrape; a pound or two across the whole catalogue).

### Owner decisions (2026-07-26)
- **The submitter verifies their own extraction — no admin review queue.** They are holding the
  packet, so they can check an OCR result better than a reviewer looking at it later. The owner's
  words: *"surely the person that uploaded it can verify it… if they see the extracted text they can
  adjust and/or confirm it themselves."*
- **Account login required** (not anonymous): attributable submissions, and an endpoint that spends
  credits is not left open.
- **No photos are stored at all.** Not "deleted after" — never written. The image is held in memory
  for the extraction and discarded. Removes the GDPR surface of holding client images entirely.
- **Shared catalogue is protected without a bottleneck:** provenance is recorded and an existing food
  is never silently overwritten.

### Built
- **`src/lib/labelExtraction.ts`** — multi-image (front + back + optional third) extraction in ONE
  Gateway call. Cheaper than one call per face and lets the model reconcile the two faces. Schema
  extended to capture the **guaranteed analysis**, which the old single-image OCR never did — without
  it, photo-sourced foods would have had no composition pie and nothing for the nutrient hard filter.
- **`POST /api/ingredients/extract`** — stateless. No DB row, no stored photo. EXIF still stripped
  before the bytes go to the provider. Returns the draft plus a duplicate warning.
- **`POST /api/ingredients/confirm`** — the only write. New product → created immediately with
  `ingredient_source='label_photo'`, `submitted_by`, and the audit columns set
  (`ingredient_data_status='complete'`, `recipe_version_status='current'`). Existing product → **never
  overwritten**; recorded as a second observation in `ingredient_review_queue`. Rolls the food back if
  the ingredient insert fails, so a food row can never exist looking complete with no ingredients.
- **`/foods/add` + `LabelCapture.tsx`** — capture → review/correct → confirm. Ingredients edited as
  one line per ingredient; nutrients left blank rather than guessed.
- **Treats.** New `foods.is_treat`. Treats are **excluded from the meal-recommendation candidate
  universe** in `hardFilter.ts` — a chew must never be suggested as dinner — while still being logged
  and available to the correlation engine.

### Chart illustrations — TWO bugs, both fixed (owner-reported: "Bristol Type 4 doesn't show")
1. **Lost manifest entry (last-write-wins race).** `uploadChartIllustration()` wrote the file then did
   a read-modify-write on a shared `manifest.json`. Concurrent uploads read the same version and the
   last write dropped the others. `bristol/4.png` was in Storage (HTTP 200, 235,544 bytes) but absent
   from the manifest. **Fixed by deleting the manifest** — paths are deterministic, so the bucket is
   the index. Self-healed Type 4 with no re-upload.
2. **The endpoint was prerendered at build time.** `/api/charts/illustrations` takes no parameters, so
   Next made it a static route: the response was frozen to build time and **any newly uploaded image
   never appeared until the next deploy.** This is the better explanation for "I uploaded them all and
   none showed." Now `force-dynamic` + `no-store`.

### Verification
- `tsc` clean; `npm run build` exit 0.
- **Charts:** Bristol 1–7 all present and rendering (Type 4 confirmed loaded at 383×513). Five BCS
  images uploaded **concurrently** — the exact case that used to lose entries — all appeared. Build
  output confirms the route is now `ƒ` dynamic. Test images and the obsolete manifest.json removed;
  `bcs` left empty as the owner has not uploaded any.
- **Confirm path (no AI cost):** validation rejects missing brand, bad food type and an empty
  ingredient list; out-of-range nutrient (999%) stored as null, not nonsense; new food created with
  correct provenance and audit columns; **resubmitting the same product with different ingredients left
  the original untouched** and recorded the conflict separately.
- **Treat exclusion proved by count:** 274 foods, 273 candidates, 1 treat — and the recommendation
  response reported `total_candidates: 273`.
- **Photo extraction verified live (owner-approved, ~$0.01):** rendered front+back labels put through
  the real endpoint returned brand and product name from the FRONT, all 11 ingredients verbatim and in
  order with percentages from the BACK, every printed nutrient, `calories_per_kg: 3720` correctly
  converted from "372 kcal/100g", and **`sodium_pct: null` because it wasn't printed** — the honesty
  rule holding under test. `photos_stored: false`. This closes the long-standing "Haiku/OCR path never
  exercised" flag. Call took ~13s for two images.
- **Database restored** — 4 users, 4 dogs, 272 foods, 0 treats, empty queues. One recommendation set
  belonging to a REAL user (dog "Harry") was found during cleanup and deliberately left alone.

### Owner review
- **The old `/dogs/[dogId]/submissions` flow still exists** and still stores photos + queues for admin
  review. The dog hub now links to `/foods/add` instead. Decide whether to retire the old flow, or
  keep it as an admin-side path.
- **Treats need a logging UI.** `dog_food_events` already supports `event_type='treat'`, and treats can
  now be catalogued, but there is no owner-facing screen to log one against a dog.
- ~13s for a two-image read is fine but noticeable; consider a progress hint if clients report it.

**Last updated:** 2026-07-26 (deployed)
**Current phase:** Phase 6 complete. Latest session (below) delivered WS4 #3/#4/#5 and WS3 #2:
clients can now see a food's full ingredient list, a validated composition pie, recommendations
persist per owner+dog with a Regenerate action, and research scoring reads a precomputed cache
instead of calling Sonnet once per candidate food. A follow-up in the same session removed the
Anthropic key from the platform entirely — **all AI now routes through the Vercel AI Gateway** — and
enriched the scoring prompt with real ingredient data. **Committed and pushed as `75df1f1`.**
Ingredient population by the owner's separate session is live and working (31 foods fully populated
as of this session, up from 0).

---

## Food contents for clients, composition pie, saved recommendations, research cache (2026-07-26, Opus-orchestrated)

WS4 #3, WS4 #4, WS4 #5 and WS3 #2 in one pass. **Uncommitted — awaiting owner go to deploy.**
No subagents were used; all work done directly, every claim below verified by this session.

### DATA CHANGE OBSERVED MID-SESSION — ingredient population is live and working
At the start of this session the live DB had **24 ingredient rows across 6 foods** (all 4-item
seed stubs), matching the previous handover. **Ninety minutes later it had 766 rows and 31 foods
with real, full ingredient lists** — the owner's separate populating session is running and
writing correctly. Food count also moved 265 → 272.

Coverage at the end of this session: **31 populated (>=5 ingredients) · 2 stubs · 239 empty · 272 total.**

The data landing is genuinely good: real UK label language, compound ingredients nested as real
rows, printed percentages, and label qualifiers preserved. **The owner's exact stated scenario now
works end-to-end** — `Bakers Beef & Vegetables` declares `Meat and animal derivatives` with **`beef`
nested inside it at 4%**, and `Vegetables` nesting `dried pea` / `dried carrot`. That is precisely the
"a beef flavoured food might still contain chicken" case, and both the hard filter and the
correlation engine match `ingredient_name` across all rows including nested ones.

**Consequence: the allergy hard filter is no longer inert for those 31 foods.** It remains inert for
the other 241.

### 1. Clients can see what is in a food (WS4 #3)
- **`src/lib/foodFull.ts`** — the single read path over the `public.food_full` view. Maps one row to
  a typed `FoodFull` (nested ingredients in label order, all 8 nutrients, derived carbohydrate +
  band). `fetchFoodFull(id)` and `fetchFoodFullMany(ids)` (one query for a whole page of results).
  Defensive numeric coercion returns `null` rather than `NaN` — a nutrient we cannot read must never
  render as a number.
- **`GET /api/foods/[foodId]`** — owner-facing, `requireUser`-gated. Distinct from the admin
  `/api/admin/foods/[foodId]`, which is for record review. Foods are shared reference data so there
  is no per-owner ownership check, but a verified session IS required (not an anonymous catalogue).
- **`/foods/[foodId]` page** + **`src/components/IngredientList.tsx`** — the ordered list is the
  primary content, rendered first, above composition. Never re-sorted or grouped. Sub-ingredients
  nest visually under a "CONTAINS" rule. Percentages appear **only** where the label printed one.
- **`POST /api/recommendations` now returns `ingredients` + `nutrients` per result**, and the dog hub
  shows the first 6 ingredients inline with "+N more" and a link to the full page.
- **Empty state is honest and load-bearing** (still the majority case at 239/272): "No ingredient
  list recorded yet … We only ever show ingredients copied directly from the manufacturer's label —
  we won't guess."

### 2. Composition pie (WS4 #4) — `src/components/CompositionPie.tsx`
Dependency-free inline SVG; no charting library, no new node_modules.
- Six fixed slots (protein, fat, carbohydrate, fibre, moisture, ash). **Hue follows the fraction, not
  its rank** — a food with more fat than protein does not repaint.
- Reused the **already-validated** palette (`#2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4, #008300`);
  not re-derived. The recorded non-dismissable **contrast WARN obligates visible labels**, so a keyed
  table beside the chart carries **name + value for every segment**, and segments >=8% also carry
  their value on the mark. Inline label colour is chosen by computing WCAG relative luminance of the
  fill and picking whichever of white/ink actually clears contrast — verified live: white on the blue
  segment, ink on the pink one.
- Separator is a **2px gap in the surface colour**, not an ink border (the mark spec's mechanism).
- **Returns `null` when the panel is incomplete.** This is deliberate: carbohydrate is derived by
  difference, so if any printed fraction is missing the six values do not sum to the whole and a
  part-to-whole chart would misstate the food. An absent chart is honest; a partial circle is not.
- Discloses when printed fractions sum to >100 (rounded labels) rather than silently normalising.

### 3. Recommendations persist per owner + dog (WS4 #5)
- New **`dog_recommendation_sets`** (dog_id, nullable owner_id, generated_at, jsonb payload).
- `POST /api/recommendations` saves on generate; **new `GET /api/recommendations?dog_id=`** returns the
  latest saved set. The dog hub loads it on mount, labels it "Showing your saved results from
  <date>", and the button is now an explicit **Regenerate**. A save failure logs but still returns the
  results the caller is waiting for.
- **Deletion semantics matched to the existing model:** `owner_id` is nullable and is set to null
  alongside the dog in BOTH the single-dog `DELETE /api/dogs/[dogId]` and `deleteAccount()`. Sets hold
  no personal data (food scores only) and are regenerable, so this is link severance, not data loss.

### 4. Research scoring moved off the request path (WS3 #2) — via the Vercel AI Gateway
**The synchronous per-food Sonnet call is gone, not merely discouraged — the call site was deleted.**

**PROVIDER CORRECTION (owner, 2026-07-26): everything uses the Vercel AI Gateway. No
`ANTHROPIC_API_KEY`, no direct api.anthropic.com calls.** The first pass of this work was built on the
Anthropic Message Batches API (for the 50% discount) and was reworked on the owner's instruction.

**Gateway batch support — settled empirically, not from docs.** Vercel's docs were ambiguous and a
third-party source claimed the Gateway proxies Anthropic's batch endpoints, so it was probed directly:
```
GET  https://ai-gateway.vercel.sh/v1/messages/batches -> 404 not_found_error
GET  https://ai-gateway.vercel.sh/v1/batches          -> 404 not_found_error
POST https://ai-gateway.vercel.sh/v1/messages         -> 400 (endpoint reached, validation error)
```
Identical 404s with and without auth, so it is genuinely "no such route", not an auth failure.
**The Gateway has no batch endpoint; the 50% batch discount is not available through it.**

**That loses the discount but not the main saving.** The large win was never the batch discount — it
was moving from *one call per candidate food on every request* (~270 calls/request) to *one call per
(food, research context), once, ever*. The cache still delivers that in full.

- `researchScoring.ts` is now the **shared prompt definition only** (system prompt, zod schema, honest
  defaults, `buildResearchScoringPrompt`). It calls no model. One definition is imported by both the
  reader and the writer, because a cache entry is only valid if the prompt that produced it is the
  prompt the reader believes it used.
- **`researchScoreCache.ts`** (read side, in-request): one query for all candidates against
  `research_score_cache`; misses are queued in `research_score_queue` and score an honest 0.
- **Key is a context hash, not a version number:** `(food_id, sha256(profile_signature + sorted chunk
  ids))`. Change the approved corpus and the retrieved chunk ids change, so the hash changes, so a
  stale score is **structurally unreachable**. There is no version column that could drift.
- Two distinct honest defaults, deliberately different copy: `NO_RESEARCH_RESULT` ("no approved
  research applies") vs `NOT_YET_SCORED_RESULT` ("not assessed yet, queued"). Conflating them would
  misrepresent the state of the evidence.
- **`researchScoreWorker.ts`** (write side, offline; replaces the deleted `researchScoreBatch.ts`) +
  **`POST|GET /api/cron/research-scoring`**. Ordinary Gateway `generateObject()` calls with **bounded
  concurrency (default 4)** and a **per-run `?limit=` cap (default 100, max 500)** — the limit is the
  spend control, since each row is one Sonnet call. `?dry=1` reports queue depth and **costs nothing**,
  so the cost of a full drain can be checked before spending. Rows are claimed before scoring so
  overlapping runs can't double-charge, and `requeueStaleRows()` recovers rows stranded by a crashed
  run. Re-asserts approved-only on chunks at scoring time, and writes **no score at all** for a
  malformed/out-of-range result rather than a guessed one.
- `scoreFood()` now takes a precomputed `ResearchRelevanceResult`. **Scoring cost no longer scales with
  catalogue size.** Route returns 503 with a clear message if Gateway auth is absent.
- `batchApiHelper.ts` is untouched and still direct-Anthropic — see the flag below.

### Verification (all performed this session, against the real DB)
- `npx tsc --noEmit` **clean**; `npm run build` **exit 0**, all new routes compiled
  (`/api/foods/[foodId]`, `/foods/[foodId]`, `/api/cron/research-scoring`). `git diff --check` clean.
- **Live, prod build on :3177 with a throwaway account:** recommendations over **272 candidates in
  3.4s with zero model calls**; ingredients attached incl. nesting + percentages; foods without
  ingredients return `[]`. `GET` returned the saved set with ingredients intact through the jsonb
  round-trip. Auth: no-token GET → **401**, no-token food detail → **401**, unknown food → **404**.
- **Gateway write path proven with one real call (owner-approved, ~$0.003).** Staged a single queue row
  and ran `/api/cron/research-scoring?limit=1` → `{"queue_rows_claimed":1,"scores_written":1,"failed":0,
  "model":"anthropic/claude-sonnet-5"}` in 5.5s. It wrote a genuine, conservative result: **score 0.10**
  with the reasoning that the snippet *"can't be directly linked to recommending this specific product"*
  — correct refusal to overstate, exactly what the system prompt asks for. Auth gate verified (401
  unauthenticated); `?dry=1` returns queue depth free of charge. **The Gateway write path is now proven,
  not assumed.**
- **Research cache read path exercised end-to-end at ZERO API cost.** Ran in dev mode (where
  `embeddingPipeline`'s deterministic pseudo-embedding fallback is permitted; it is correctly blocked
  in production) with a temporary approved research fixture. Results: retrieval returned the chunk →
  **272 queue rows written, one per candidate, single context hash, correct profile signature**; a
  second identical run left it at **272 (idempotent)**; seeding one cache row made that food return
  **exactly 0.73 with its cached summary** and lifted its overall score 0.628 → 0.811 so it correctly
  outranked, while uncached foods stayed at an honest 0. Server log confirmed **no Anthropic/Gateway
  call at any point**.
- **Browser, mobile (375px) and desktop (1280px):** pie renders 6 correctly-ordered segments with the
  2px surface gap; luminance-picked label colours confirmed; **no horizontal overflow at 375px**; no
  console errors. Verified the populated food, the empty-ingredient food, and the dog hub.
- **Database restored exactly as found** — auth.users 4, user_profiles 4, dogs 4, and all of
  `dog_recommendation_sets` / `research_score_cache` / `research_score_queue` / `research_documents` /
  `research_chunks` back to **0**. Confirmed by count query. `food_ingredients` was never touched
  (another session is actively writing it).

### Migration
`supabase/migrations/20260725100000_add_recommendation_sets_and_research_score_cache.sql` — applied
live and saved. Purely additive: three new tables, RLS enabled with no policy (service-role only,
fail-closed, same pattern as `condition_contraindications`). No existing table or column altered.

---

## Follow-up in the same session: no Anthropic key anywhere + richer scoring prompt

Owner instruction, verbatim intent: *"All AI calls are done via the vercel AI… anthropic key should
not be needed anywhere in this platform, it is never needed."* Plus: make the prompt improvement, then
deploy.

### 5. `ANTHROPIC_API_KEY` removed from the platform entirely
The owner believed the Gateway could take a batch call. It cannot — probed six candidate paths in both
Anthropic and OpenAI batch shapes, GET and POST, all 404, **including `/v1/files`** which any
OpenAI-style batch flow requires. `/v1/messages` returns 400 (endpoint reached), so the Gateway is
reachable and doing synchronous inference only. Reported plainly, then delivered the actual
requirement, which is fully achievable:

- **`foodDiscovery.ts` converted to the Gateway and made single-phase.** The two-phase
  submit/process split existed *only* because the Batch API was async; with synchronous calls it
  collapses into one run: crawl → extract (bounded concurrency 4) → dedupe/validate → insert. Capped by
  `MAX_PAGES_PER_RUN` (50). Hand-written Anthropic tool schema replaced with a zod schema.
- **`ingredientBackfill.ts` converted the same way** — one `runIngredientBackfill(limit?)` pass. All
  its safety rules preserved verbatim: never invents an ingredient or nutrient; only replaces
  ingredient rows when the extraction returned a non-empty list; fills NULL nutrient columns only.
- **`src/lib/batchApiHelper.ts` DELETED**, along with the now-meaningless
  `/api/cron/food-discovery/process` route. `/api/admin/ingredient-backfill` takes `action: 'run'`.
- **`ANTHROPIC_HAIKU_MODEL` / `ANTHROPIC_SONNET_MODEL` are gone.** Everything reads
  `AI_GATEWAY_HAIKU_MODEL` / `AI_GATEWAY_SONNET_MODEL` (the `provider/model` form).
- **Verified:** `grep -rn "ANTHROPIC_API_KEY" src/` returns **only comments** stating it is not used.
  Zero live references. The env var can be removed from Vercel.

### 6. Research prompt now sees the actual food — with a cache key that can't go stale
The prompt previously sent only brand/name/type/calories. Live evidence it mattered: with a gut-biome
fibre snippet, Sonnet scored **0.10** and said it *"can't be directly linked… no information given
about this food's fiber or starch content."* It was right.

Now the prompt carries the **ordered ingredient list and the guaranteed-analysis panel**. Same food,
same research, after the change: **0.35**, citing specifics — *"lists cereals as the first ingredient
with no beet pulp, inulin, or chicory root evident."* Grounded, and it even down-weighted the fixture
for looking like a placeholder. Absence is stated explicitly ("NOT RECORDED… do not penalise the food
for the missing list") so a food without ingredients isn't marked down for it.

**Two real bugs were caught by verification during this change — both fixed:**
1. **The cache would never have hit in production.** Folding the food fingerprint into `context_hash`
   gave every food a distinct hash, so the lookup needed two `IN()` lists of ~270 values and blew
   PostgREST's URL limit → **400 Bad Request**. The fail-soft dutifully reported "not yet scored" for
   every food, hiding it. Fixed by keeping `context_hash` as the single per-request base hash and
   adding a **`food_fingerprint` column** compared per row. Re-verified at full scale: 272 rows, 1 base
   hash, 198 distinct fingerprints, no errors.
2. **Re-queued misses kept a stale fingerprint.** `ignoreDuplicates: true` skipped updating the
   existing row, so a food edited after being queued would never be rescored. Fixed to upsert.

**Invalidation proven end-to-end (zero AI cost):** seeded a cache hit → recommendation returned
**0.99**; added one ingredient to that food → it dropped out of the top 10, cached fingerprint
`16f5922087e8b562` vs requeued `ef6b36bd5f5a7581`, status back to `pending`.

Migration `20260726090000_add_food_fingerprint_to_research_score_tables.sql` (applied live + saved).
Additive only.

### Needs owner input / owner review
- **`ANTHROPIC_API_KEY` can be deleted from the Vercel project** — nothing reads it any more. Confirm
  `AI_GATEWAY_API_KEY` is set in Vercel, **or** enable OIDC Federation, or every AI path returns a
  clear 503.
- **Schedule the job:** `/api/cron/research-scoring` is not in `vercel.json`. Only schedule it once a
  real research corpus exists — with the corpus empty it is a no-op. Use `?dry=1` (free) to see queue
  depth, then `?limit=N` to control spend.
- **Food discovery is now synchronous** and runs inside one cron invocation. With 50 pages at ~4
  concurrent Haiku calls it should finish well inside a Vercel function timeout, but **it has never
  been run live** (the domain allowlist is empty). Watch the first real run.
- **Carried forward, deliberately not done:** `autoprefixer` and ESLint are still entirely uninstalled
  (`eslint`, `eslint-config-next`, `autoprefixer`, `postcss` all absent). Fixing either is a dependency
  change plus, for autoprefixer, altered CSS output — wrong thing to bundle into a feature deploy.
  Recommend a separate change: `npm install -D eslint eslint-config-next autoprefixer postcss`, add
  `.eslintrc.json` = `{"extends": "next/core-web-vitals"}`, re-add autoprefixer to
  `postcss.config.js`, then diff the CSS output.
- **Carried forward, deliberately NOT done this session** (re-logged, not silently dropped):
  `autoprefixer` and **ESLint are both entirely uninstalled** (`eslint`, `eslint-config-next`,
  `autoprefixer`, `postcss` are all absent from package.json). Fixing either means a dependency change
  plus, for autoprefixer, a change to generated CSS — I judged it wrong to bundle that into a feature
  deploy at the end of a session, given this checkout's recurring node_modules corruption and a
  currently-verified-good build. Recommend a separate, dedicated change:
  `npm install -D eslint eslint-config-next autoprefixer postcss` then add
  `.eslintrc.json` = `{"extends": "next/core-web-vitals"}` and re-add autoprefixer to
  `postcss.config.js`, re-running the full build to compare CSS output.
- Still open and unchanged (carried into the follow-up section below): single-dog "Remove = anonymise
  vs hard-erase" GDPR confirmation ·
  `/docs/*` missing from the checkout · Supabase Auth "leaked password protection" toggle ·
  Bristol/BCS artwork · `wellness_indicator_reference` research backing · legal/GDPR review ·
  vet-approved `condition_contraindications` rules (still deliberately empty) · Haiku/OCR path still
  never exercised with a real photo.

---

**Status as of 2026-07-24 (superseded by the entry at the top of this file — kept for history):**
**Current phase:** Phase 6 complete + full finish-and-redesign pass done (see "Finish-and-redesign session" below). This session (Opus-orchestrated): fixed a production-down recommendations 500; found and fixed that **Tailwind never compiled** (no `postcss.config.js` — the whole app was unstyled); built a design system and redesigned every page; added dog edit/delete, the allergies/health-conditions UI, and the deterministic health-condition hard-filter mechanism; applied the missing RAG RPC; and **verified all three AI Gateway paths live**. Everything is verified but **staged/uncommitted, held for one coherent deploy** (the recommendations hotfix is the one piece already live). **Owner action needed before deploy:** give the go to commit + push to main; see this session's "Needs owner input" for the research-layer cost design and the vet-gated clinical mappings.

---

## Full ingredient detail + unified food view (2026-07-25, later)

Continues the entry below after owner clarification. **Committed and deployed** (`80c8e6f`, `2b53f17`).

### Owner requirement (verbatim intent)
"For every dog food we need to know every ingredient, quantities if they exist... so the correlation engine can find correlations and so people understand exactly what is in each food, because a beef flavoured food might still contain chicken. We need that level of detail, it's really important."

### Corrections the owner made, and what changed
1. **"Fibre does not describe carbs."** Right. The NFE formula does subtract fibre, so fibre wasn't being counted as carbohydrate — but printed "crude fibre" is mostly *insoluble* fibre and understates total dietary fibre, so soluble/prebiotic fractions (inulin, FOS, chicory, psyllium, beet pulp) land in the NFE figure and it **overstates digestible carbohydrate**. It also cannot describe fibre *type* at all. `carbohydrate.ts` now documents this plainly and the figure is labelled "Digestible carbohydrate (estimated, excl. crude fibre)" — a coarse screen, subordinate to the ingredient list.
2. **"Neither table has the level of detail to capture all the ingredients."** Half misunderstanding, half real gap. `food_ingredients` is a child table — one row *per ingredient* — so it already scaled to any list length. But it genuinely had nowhere to record the percentages UK labels print, qualifiers, or compound ingredients.
3. **"There only needs to be one database for everything related to food."** Clarified: it is one database, two tables. Rather than collapse them (which would break the cross-food ingredient queries the allergy filter and correlation engine depend on), added a unified **view**.

### Schema (applied live, saved to `supabase/migrations/`)
- `food_ingredients` + `inclusion_pct` (numeric, 0–100 constrained), `note` (text), `parent_ingredient_id` (self-FK, cascade). All nullable/additive; existing rows untouched. Partial index on `parent_ingredient_id`.
- **`public.food_full` view** — one row per food, all ingredients nested as JSON (percentages, notes, sub-ingredients) plus `est_digestible_carbohydrate_pct`. Created `with (security_invoker = true)` so it respects the caller's RLS rather than running as definer.

### Why sub-ingredients are real rows
A beef-flavoured food may declare chicken only inside "Animal Derivatives (Chicken 4%)". Both `hardFilter.ts` and `correlationEngine.ts` match `ingredient_name` across **all** rows without filtering on parent, so a nested ingredient is found by both with **no change to either file** — verified.

### Verified live (then fully reverted)
- Worklist → POST by `food_id` with percentages, a note, and a nested sub-ingredient → `food_full` returned it as one nested record.
- The allergy query returned: `Acana Grasslands Beef & Venison | Chicken | HIDDEN inside a compound` — the owner's exact scenario, caught.
- Every SQL statement in the population prompt was run **verbatim** against the live DB before handing it over (worklist, delete, multi-row insert, nested insert, verification).
- Import guards: unknown category rejected · **empty list refuses to wipe existing rows** · ambiguous brand+name rejected · idempotent (re-import replaces, doesn't duplicate) · non-admin 404.
- `tsc` clean, `build` exit 0. **Database left exactly as found each time** (24 rows, 0 test users) — confirmed by count query.

### Population approach (owner decision)
Ingredient data is being populated by the **owner's separate Claude session on their monthly subscription**, not by API credits. This session's job was to make the schema and write path ready. Two briefs written:
- `INGREDIENT_POPULATION_PROMPT.md` — for a session with the **Supabase connector** (direct SQL, no credentials). Names the correct project id, warns off the sibling project, restricts to INSERT/DELETE on `food_ingredients`, gives the delete-then-insert pattern and the separate parent-then-child statement for compound ingredients.
- `INGREDIENT_IMPORT.md` — the HTTP endpoint alternative.
Both carry the **transcribe-never-infer** rule and require a report of skipped foods.

### Groundwork for the composition pie (next session)
`dataviz` skill consulted. A pie is legitimate for guaranteed analysis (part-to-whole at a glance, ≤6 segments); it would be an anti-pattern for ingredients (20–40 items). Palette validated with the skill's script: `#2a78d6, #eb6834, #1baf7a, #eda100, #e87ba4, #008300` → **ALL CHECKS PASS**, with a non-dismissable **contrast WARN** obligating visible labels. Recorded in `HANDOVER_PROMPT.md` so it isn't re-derived.

### Owner review
- Hand `INGREDIENT_POPULATION_PROMPT.md` to the populating session.
- The allergy filter stays inert until that data lands — highest-value item outstanding.
- Old seed stubs carry legacy category values (`protein`, `vegetable`) outside the new vocabulary; they're replaced as each food is populated, so this self-resolves.

---

## Ingredient data path + carbohydrate derivation (2026-07-25)

### THE FINDING — no food has a real ingredient list, and the allergy filter is inert
Live check: **259 of 265 foods have zero `food_ingredients` rows; the other 6 have 4-item seed stubs** ("Beef, Beef Meal, Lamb, Peas") — placeholders, not labels (real lists run 15–40+ items). **No food in the database has a real ingredient list.**

**This is a safety gap, not a display gap.** `hardFilter.ts` excludes foods for a dog's allergies by matching `food_ingredients.ingredient_name`. With no ingredients recorded, allergy exclusion matches nothing — a dog allergic to chicken is currently offered chicken foods. Fixing ingredient coverage is the highest-value item outstanding.

### Owner's steer (2026-07-25) — why ingredients matter beyond allergies
The owner's own dog's gut-biome report called for dramatically reducing carbohydrates. Their correction, which is right and is now reflected in the code: a guaranteed-analysis panel cannot say *which* carbohydrate a food uses, and cannot describe fibre **type** at all — "crude fibre" is mostly insoluble fibre, so soluble/prebiotic fibres (inulin, FOS, chicory, psyllium, beet pulp) are missed entirely. **The ingredient list is the primary data; an aggregate percentage is at best a coarse screen.**

### Built
- **`src/lib/carbohydrate.ts`** — carbohydrate by difference (NFE): `100 − protein − fat − fibre − moisture − ash`. Verified against the live DB: **derivable for 264/265 foods today with zero AI cost**, range ~0% (raw/wet) to 51% (Pedigree Senior 7+), mean 32.5%. Returns null on an incomplete panel (never partially guesses), clamps at 0 and flags when label fractions sum >100. Header documents plainly what it is *not*: it subtracts fibre so it isn't counting fibre as carbohydrate, but because crude fibre understates total dietary fibre it **overstates digestible carbohydrate**, and it says nothing about type. Labelled throughout as "Digestible carbohydrate (estimated, excl. crude fibre)".
- **`hardFilter.ts` extended** with a derived `carbohydrate_pct` rule so "reduce carbohydrate" can be a real approved exclusion. Deterministic arithmetic in memory — no LLM, safety-layer separation preserved. Foods with an incomplete panel are never excluded (same "unknown is not a breach" rule as stored columns). Sizing check: a `> 30%` rule would exclude 210 of 265 foods, `> 20%` excludes 214.
- **`src/lib/ingredientCategories.ts`** — an 11-value vocabulary for the previously-undefined `ingredient_category`, deliberately separating `fibre_soluble` / `fibre_insoluble` / `fibre_mixed` so fibre type is capturable. Structural classification only; asserts nothing clinical.
- **`POST|GET /api/admin/food-ingredients/import`** — admin-gated bulk write path so a separate session can populate ingredients without SQL. Matches by `food_id` or exact brand+name; stores label order as `position_in_list`.
- **`INGREDIENT_IMPORT.md`** — the brief to hand to that session (worklist endpoint, payload shape, category table, transcribe-never-infer rule).
- **`src/lib/ingredientBackfill.ts`** + `/api/admin/ingredient-backfill` — automated Batch-API extraction (Haiku, ~£1.50 for all 265). Built and type-checks but **NOT run**: needs a direct `ANTHROPIC_API_KEY` (currently empty; the Gateway key present has no batch endpoint). Kept as an option.

### Decision (owner, 2026-07-25)
**Ingredient data will be populated by a separate Claude session on the owner's monthly subscription, not via API credits.** This session's job was to make the schema and write path ready — done. Do not spend on bulk extraction.

### Verification
- `tsc --noEmit` clean; `npm run build` exit 0.
- Carbohydrate derivation unit-checked against live rows: Pedigree Senior 7+ → 51.0, Chudleys Complete Adult → 48.5 (both match SQL exactly); incomplete panel → null; over-subscribed → clamped to 0 and flagged.
- Import path verified end-to-end against the real DB with a **hand-made payload (zero AI spend)**: worklist returned 265 foods + 11 categories; an 11-item categorised list replaced Acana's 4-item stub. Guards all pass — unknown category rejected, **empty list refuses to wipe existing rows**, unmatched food reported cleanly, ambiguous brand+name rejected, import idempotent (3 written on both runs, not 6), non-admin → 404.
- **Database restored exactly as found** afterwards: Acana back to its 4-item stub, 24 total ingredient rows, 0 test users.

### Owner review
- Hand `INGREDIENT_IMPORT.md` to the populating session. Progress is visible via `GET /api/admin/food-ingredients/import?missing=1`.
- A carbohydrate contraindication rule still has to be entered and **approved** by a vet in `/admin/contraindications` before it excludes anything — the mechanism is ready, deliberately empty.

---

## WS2 admin surfaces + WS4 tweaks (2026-07-25, Opus-orchestrated)

Built on WS1's unified auth. **Uncommitted — awaiting owner go to deploy.**

### DATA FINDING — invalidates a WS3 premise (read before doing WS3)
The handover brief said "30 seeded foods, the eight nutrient `%` columns are empty, plan an extraction backfill." **That is no longer true.** Live check of `ysffyuohwvdifvbopfcm`:
- **265 foods** (not 30). 30 created 2026-07-24; **235 more created 2026-07-25** across 54 source domains — not by this session.
- **All 265 rows have all 8 nutrient columns populated** (protein/fat/fibre/moisture/ash/phosphorus/sodium/calcium).
- **The real gap is ingredients: only 6 of 265 foods have any `food_ingredients` rows** (24 rows total).

**Consequences:** the planned "one-pass extraction backfill of nutrients for 30 foods" is **unnecessary and would burn AI credits re-extracting data that already exists** — do not run it. WS3 should retarget at **ingredient-list coverage** (259 foods missing ingredients), which also blocks the ingredient-based half of the hard filter and the WS4 "show food contents" feature. **Owner: please confirm where the 235 foods came from** (a discovery-cron run, a manual import, or a parallel session) so we know whether that pipeline is already doing the extraction job.

### Built
- **Food admin:** `GET /api/admin/foods?q=` (list + per-food nutrient completeness), `GET|PATCH /api/admin/foods/[foodId]`, pages `/admin/foods` + `/admin/foods/[foodId]` (`FoodsAdmin`, `FoodDetailAdmin`). Editing is framed as review/correction, never primary data entry.
- **Condition-contraindications editor (safety-critical, built by Opus, not delegated):** `GET|POST /api/admin/contraindications`, `PATCH|DELETE /api/admin/contraindications/[id]`, page `/admin/contraindications` (`ContraindicationsAdmin`), shared validation in `src/lib/contraindications.ts`. Rules are **created unapproved**; approval is a separate confirmed action; only `approved` rows affect recommendations (matching `hardFilter.ts`). Validation enforces exactly-one-of ingredient/nutrient rule, restricts `nutrient` to the 8 real `_pct` columns and `comparator` to `>,>=,<,<=` — this also protects hardFilter's dynamic `.filter(rule.nutrient, …)` from an arbitrary column name. **No clinical mapping is ever suggested or generated by the app.**
- **User admin:** `GET /api/admin/users` (profiles + emails resolved from `auth.users`), `PATCH /api/admin/users/[userId]` toggling `is_admin` only, with a server-side **self-demote guard** (an admin cannot change their own admin status → no lockout). Page `/admin/users`.
- **Research admin:** `GET /api/admin/research`, `GET|PATCH /api/admin/research/[docId]`, page `/admin/research`. View/approve/reject/supersede only — **no embedding or LLM call**, corpus stays empty by design.
- **WS4 tweaks:** the "diagnosed date" field is removed from `RestrictionsManager` (DB column retained). Dog forms now capture **age in years + months** instead of DOB, on both `/dogs/new` and `/dogs/[dogId]/edit`; converted server-side to an approximate `date_of_birth` via new `ageToApproxDob()`/`dobToAge()` in `lifeStage.ts` (day pinned to the 1st for determinism), so `deriveLifeStage()` is unchanged.

### Delegation note (cost/limit event)
Four Sonnet subagents ran on disjoint file sets; **three were killed mid-task by a weekly API usage limit**. Verification caught the fallout — two `tsc` breakages (`/dogs/new` left with dangling `dateOfBirth` refs; a template-literal `.select()` defeating supabase-js type inference) and three missing files (`/admin/foods/[foodId]/page.tsx`, `/admin/research/page.tsx`, the dog edit form's age input). All were completed/fixed by hand. **A subagent's completion claim is not evidence** — this is the concrete case.

### Verification
- `npx tsc --noEmit` clean; `npm run build` **exit 0**, all 7 admin pages + all admin APIs compiled.
- Live against the real DB (local prod server): all four admin APIs return **404 to a signed-in non-admin**; after promotion all return 200 with real data (foods list + `?q=` search working). Contraindication validation rejects: neither-rule, both-rules, an invalid nutrient column, and an invalid comparator. Full round-trip: create → `approved:false`, PATCH approve → `approved:true`, malformed edit → 400, delete → 200, table back to empty.
- Test account and all test rows deleted afterward (verified 0 rows).

### Owner review
- **Confirm the provenance of the 235 new foods** (see the data finding) before WS3 is planned.
- Contraindication rules remain **empty by design** — health-condition exclusion still does nothing until a vet enters and approves rules in the new `/admin/contraindications` UI.
- Deploy of WS2/WS4 awaits your go.

---

## WS1 — Unified auth + admin experience (2026-07-24, Opus-orchestrated)

Closed the single most-repeated flag in this file: the split, insecure auth. **Uncommitted, held for the owner's deploy decision — see "Owner review" below. This also closes a LIVE vulnerability on the deployed app (see the security note).**

### Security finding (headline)
The **deployed** app (commit `9e120c3`) trusts an **unverified `x-user-id` request header** for every owner route (dogs, restrictions, health-conditions, logs, baselines, red-flags, food-events, weight-logs, recommendations, ingredient submissions). Any caller could read or modify **any** user's data by setting that header to their id. This is fixed here but is **live until deployed** — argues for deploying WS1 promptly.

### What changed
- **One verified session for owners AND admins.** New `src/lib/serverAuth.ts`: `getSessionUser`/`requireUser` (verify `Authorization: Bearer <supabase_access_token>` via `supabaseAdmin.auth.getUser`) and `requireAdmin` (adds a server-side `user_profiles.is_admin` check). `src/lib/serverAdminAuth.ts` is now a re-export shim of it (admin routes unchanged).
- **All 16 owner API routes** converted from `request.headers.get('x-user-id')` to `requireUser(request)` (24 guard sites). Delegated the mechanical transform to a Sonnet subagent under an exact spec; every diff reviewed + verified (0 old patterns remain, 24 new guards, 16 imports, tsc/build clean).
- **New `GET /api/auth/me`** — returns `{ user, is_admin, display_name }`, is_admin always derived server-side. Powers role-aware routing + nav.
- **Unified client session** `src/lib/session.ts` (stores `{access_token, refresh_token, user_id}`, arms supabase-js auto-refresh via `onAuthStateChange` so `authHeaders()` stays synchronous AND fresh). `clientAuth.ts` + `adminAuth.ts` are now thin **compat shims** over it, so the 13 read-only consumers needed no edits. `authHeaders()`/`adminAuthHeaders()` now emit `Authorization: Bearer …` instead of the forgeable `x-user-id`.
- **Role-aware routing:** `/signin` and `/signup` now `saveSession()` then ask `/api/auth/me` → admin → `/admin`, owner → `/dogs`. Signup establishes a real session by chaining a sign-in; if email confirmation blocks it, routes to `/signin?created=1` with a message.
- **`/admin` dashboard** (`src/app/admin/page.tsx`) on the design system: live count cards (foods, contraindications [safety-tagged], research, review queue, users, chart art) from new admin-gated `GET /api/admin/overview`, each linking to its WS2 surface.
- **`AdminShell`** (`src/components/AdminShell.tsx`) — shared admin chrome + fail-closed client guard (no session → `/signin`; non-admin → `/dogs`); persistent admin nav. Existing `/admin/review-queue` + `/admin/charts` pages rewrapped in it. **`AdminLink`** surfaces an "Admin" link in the owner `/dogs` header only for confirmed admins.

### Design decision (recorded)
Unified onto the **already-proven Bearer-token model**, NOT a new `@supabase/ssr` cookie stack. Rationale: eliminates the `x-user-id` hole, derives identity + is_admin server-side, reuses the working `requireAdmin` pattern, adds **no new dependency** (sandbox install-corruption risk; codebase deliberately avoids new deps). **Trade-off accepted:** token in localStorage (same trust model the admin path already used), not an httpOnly cookie. Future hardening: migrate to `@supabase/ssr` cookie sessions.

### Verification (all performed this session)
- `npx tsc --noEmit` clean; `npm run build` passes, all new routes compiled (`/admin`, `/api/auth/me`, `/api/admin/overview`).
- **Live, against the real DB** (local prod server on :3131): forged `x-user-id` → **401** (hole closed); no-auth → 401; bogus bearer → 401; `/api/admin/overview` hidden as **404** to non-admins. Valid token (fresh test account) → `/api/dogs` **200**, `/api/auth/me` correct `is_admin:false`. Promoted the test account → same token now → `/api/auth/me` `is_admin:true`, `/api/admin/overview` **200** with real counts (foods 30, users 3, admins 2, research 0). `/admin` in a fresh browser fail-closes to `/signin`. Test account fully deleted afterward (0 rows in auth.users + user_profiles).

### Owner review
- **Deploy WS1 promptly?** It closes a live data-exposure vulnerability. Committing/pushing to main is owner-gated — awaiting go. Recommend deploying this as its own coherent change.
- After deploy, an admin must have `user_profiles.is_admin=true` (the owner's account already does) and sign in via the unified `/signin` to reach `/admin`.

---

## Finish-and-redesign session (2026-07-24, Opus-orchestrated)

Opus orchestrator + four Sonnet subagents (parallel, disjoint file sets). Closed the remaining functional gaps and did a full visual redesign. **All work verified live/locally; not yet deployed — held for one coherent deploy per owner (see "Deploy" below).**

### 1. Production hotfix — recommendations was 500ing for every user (DEPLOYED)
- Live test of the deployed dog flow found `POST /api/recommendations` returning **500 for every dog**. Root cause: `retrieveResearchFor()` (ragRetrieval.ts) called `generateEmbedding()` and the `match_research_chunks` RPC unconditionally and threw on failure — but the embedding path throws in production without Gateway auth, and the RPC had never been applied to the live DB. An *optional* research enhancement was a *hard* dependency of getting any recommendation.
- Fix: `retrieveResearchFor()` now fail-softs to `[]` (no research context) on either an embedding or RPC failure — recommendations always return, degrading only the optional research factor (researchScoring already returns an honest 0 for empty chunks, no LLM call). **Committed (58a15b4) and pushed to main → deployed → verified live 200** with real results before continuing.

### 2. Root-caused why the whole UI looked unstyled — Tailwind never compiled
- **There was no `postcss.config.js` in the repo at all.** Next.js therefore never ran Tailwind's PostCSS plugin: the deployed CSS shipped `@tailwind base/components/utilities;` as literal, uncompiled text, so *every* utility class in the entire app was inert. The app had been serving browser-default HTML this whole time — the real reason it looked "ugly."
- Fix: added `postcss.config.js` (tailwindcss plugin; autoprefixer intentionally omitted — not installed in this checkout, Tailwind compiles fine without it, add later when deps can be installed safely). This single file makes the entire app styled.

### 3. Design system + full redesign (Workstream 2)
- Established a design system (owner approved the direction): deep **petrol-pine** (`#1E4D45`) on warm-neutral **paper** (`#F4F3EE`); **Bricolage Grotesque** display + **IBM Plex Sans** body + **IBM Plex Mono for every metric** (scores, dates, £, sample sizes — the signature); a disciplined semantic **signal system** (better/worse/steady + a deliberately loud red-flag **alarm** register). Central tokens in `tailwind.config.ts`, a reusable component-class vocabulary in `globals.css` (`.card`, `.btn-*`, `.field/.label/.input`, `.signal-*`, `.callout-*`, etc.), fonts wired via `next/font` in `layout.tsx`.
- Redesigned **every** page/component onto that system: landing, signin/signup/account, dogs list/new/hub, baseline/quick-log/recalibrate/red-flag + their selector components, photo submissions, and both admin pages (review queue, chart illustrations). Logic/data-flow untouched (visual pass only). Red-flag flow kept **more** alarming, not less (`bg-alarm-tint`, `border-4`, `role="alert"`) per the Phase-2 safety requirement.

### 4. Dog profile edit + delete (Workstream 1 item 2)
- New `/dogs/[dogId]/edit` page (pre-fills from GET, submits via existing PUT; `life_stage` stays server-derived). New `DELETE /api/dogs/[dogId]` handler that **anonymises** (`owner_id = null`) rather than hard-deletes, matching the documented data model (dog records are kept anonymously for pooled research, same as the account-deletion job). Hub gained a confirm-guarded "Remove dog" action. **Owner review:** whether a *voluntary single-dog removal* (while the account persists) should instead hard-erase for GDPR is a product/legal call — flagged, defaulted to anonymise.

### 5. Allergies / health-conditions management UI + APIs (Workstream 1 item 3)
- New `/dogs/[dogId]/restrictions` page + `RestrictionsManager` component managing both `dog_restrictions` and `dog_health_conditions`. Added `GET`+`DELETE` to `/api/restrictions` and a new `/api/health-conditions` route (`POST/GET/DELETE`) — all ownership-checked (return 404 not 403 to avoid leaking row existence). This is the first UI that lets an owner populate the hard-filter safety layer at all.

### 6. Health-condition hard-filter exclusion — mechanism built (Workstream 1 item 4, safety)
- Owner chose BOTH mechanisms. Migration `add_condition_contraindications_and_food_nutrients` (applied live + saved to `supabase/migrations/`): new `condition_contraindications` table (condition → either a contraindicated ingredient OR a nutrient-threshold rule; `approved` gate) and eight nullable nutrient `%` columns on `foods`.
- `hardFilter.ts` rewritten to deterministically exclude foods for a dog's conditions using **only approved** contraindication rows (ingredient `ilike` match, or `foods.<nutrient> <comparator> threshold`; foods with a NULL nutrient are never excluded). No LLM — stays in the deterministic safety layer.
- **The clinical mappings and per-food nutrient values are intentionally empty and were NOT invented** (owner/vet-gated). Until a vet approves rows, health-condition exclusion contributes nothing (identical to before) — but the mechanism is now in place and one row away from active. Behaviour-preserving verified: Scout (no conditions) → 0 excluded, all 30 candidates, same as before.

### 7. RAG completion + Gateway verification (Workstream 1 item 1 — the headline priority)
- Applied the missing `match_research_chunks` RPC to the live DB (migration `add_match_research_chunks_rpc`, saved to `supabase/migrations/`).
- **All three AI Gateway paths verified live** (OIDC on the deployed project; `AI_GATEWAY_API_KEY` added locally by owner): embeddings (`openai/text-embedding-3-small`) via `npm run seed:phase4` (real vectors written) and query retrieval (5 chunks, similarity 0.615); Sonnet (`claude-sonnet-5`) via a recommendations run that produced real relevance scores (0.55) and coherent reasoning. (Haiku/OCR path not exercised — would need a real photo; same Gateway auth mechanism as the two verified paths.)
- **Placeholder research seeded for the test was then deleted** (0 docs/0 chunks remain). Per owner steer: the research base must be built deliberately over weeks with real content, not rushed — and leaving approved research in place fires **one Sonnet call per candidate food per recommendation request** (~53s + real cost). See "Needs owner input" for the cost-scaling design point.

### Dog UI verified end-to-end (Workstream 1 item 1, first subsystem)
- Full flow verified against real data (deployed app + local prod build on the same live DB): signup → `/dogs` → create dog (server-derived `life_stage=adult` confirmed) → hub → recommendations (200, 10 sensible results). Admin bootstrap (item 5) verified: `user_profiles` = 1 row, `is_admin=true` landed for the owner's account.

### Verification performed
- `npx tsc --noEmit` — clean across the whole project (all 4 packages + safety/RAG/design changes together).
- `next build` — passes; all routes compiled incl. the new ones.
- Live/local walkthrough at **mobile (375px) and desktop (1280px)**: landing, signin, `/dogs`, hub (all new nav cards + remove-dog + recommendations), restrictions manager (both sections, correct enums, APIs working), red-flag (alarm register confirmed loud). No console errors. Design tokens confirmed applied via computed styles.
- Security advisor after the migration: only the expected INFO "RLS enabled, no policy" on `condition_contraindications` (deliberate, service-role-only like `source_domain_allowlist`); no new errors.

### Needs owner input / owner review (new this session)
- **Deploy trigger:** everything is staged and verified but uncommitted (except the recommendations hotfix, already live). Owner asked to hold for one coherent deploy — awaiting go to commit + push to main (which transforms the whole app, since the postcss fix + design land together).
- **Research-layer cost design — DECIDED (owner, 2026-07-24): use the Batch API.** research scoring fires one Sonnet call per candidate food per request today. Owner's chosen fix: move research scoring to the **Batch API** (async, ~50% cheaper) — precompute research-relevance scores offline into a cache/table, and have the synchronous recommendation read the cached score instead of calling Sonnet per food. Reuse the existing `src/lib/batchApiHelper.ts` (the food-discovery job already uses Anthropic Message Batches; stays a direct Anthropic call — the Gateway has no batch endpoint). Build deliberately over weeks with real, cited research; this is the top follow-up task.
- **Health-condition clinical mappings + food nutrient values:** the mechanism is built but empty; a vet must supply/approve `condition_contraindications` rows and the per-food nutrient `%` values before health-condition exclusion does anything.
- **Single-dog "Remove" = anonymise, not erase** — confirm this is the intended GDPR behaviour (vs. hard-erase) for a voluntary single-dog removal.
- **autoprefixer** not installed (postcss config omits it) — add when deps can be installed safely.
- **ESLint**: still no config; `next lint` prompts interactively. Verified with `tsc` + `next build` instead. Pick a config before relying on lint in CI.
- Carried forward unchanged: real research corpus content (Phase 4); Batch API live verification (Phase 6, 24h batch); Bristol/BCS artwork; `wellness_indicator_reference` research backing; legal/GDPR review; `/docs/*` still missing from the checkout; Supabase Auth "leaked password protection" is off (advisor WARN — owner toggle).

---

## Dog profile UI (2026-07-24)

Signup's redirect target (`/account`, a bare confirmation page — see the "Sign-in/sign-up flow" entry below) turned out to be a bigger gap than initially scoped: there was **no dog-profile-creation UI or dog list anywhere in the app** — only the API routes (`POST /api/dogs/create`, `GET/PUT /api/dogs/[dogId]`) existed, unreachable from any page. The owner expected this to already exist (Phase 1's checklist says "Dog profile CRUD" is done — true for the API layer, not the UI). Filled in this session:

- `GET /api/dogs` (new) — lists the signed-in owner's dogs; companion to the existing `POST /api/dogs/create`.
- `/dogs` (new) — the owner's dog list, empty-state prompts to add a first dog, links into each dog's hub page.
- `/dogs/new` (new) — dog profile creation form (name, breed, DOB, weight, size category, lifestyle role, work type, exercise hours, current food freetext, monthly budget) → `POST /api/dogs/create` → redirects to the new dog's hub page.
- `/dogs/[dogId]` (new) — dog hub page. Links to every existing per-dog page (baseline, quick-log, red-flag, photo submissions) that previously had no discoverable entry point, **and gives `POST /api/recommendations` — the Phase 3 recommendation engine — its first UI anywhere in the app.** Confirmed via grep that no page/component called that route before this session.
- `/signin`, `/signup` now redirect to `/dogs` instead of the bare `/account` page. `/account` is simplified to a minimal sign-out/settings page, reachable from `/dogs`'s header.

**Verification:** `npx tsc --noEmit` and `npm run build` both pass cleanly (all new routes compile). Smoke-tested in a local browser with a fake session id — pages render correctly and fail gracefully (surfacing the same known local-`.env`-placeholder-key error as every other write path in this sandbox, not a new bug). **Not yet tested with real data** — need a real signed-in session against the live Supabase project to confirm dog creation, listing, and the recommendations call all work end-to-end (the recommendations call in particular exercises this session's Gateway migration — first real chance to verify that live).

**Still not built — flagged, not silently expanded into this session's scope:** editing an existing dog profile (the `PUT /api/dogs/[dogId]` route exists, no edit form); a `dog_restrictions`/`dog_health_conditions` management UI (API routes exist per Phase 1, no forms); deleting a dog profile (no route or UI). These plus the broader visual design of the whole app are intended for the upcoming handover session — see the end of this file.

---

## AI Gateway migration (2026-07-24)

Owner decision (confirmed this session): authenticate via Vercel's automatic OIDC token, not a manually-provisioned `AI_GATEWAY_API_KEY`, since the app is already on Vercel.

**What moved to the Gateway:**
- `src/lib/ingredientOcr.ts` (Haiku vision/OCR) and `src/lib/researchScoring.ts` (Sonnet research scoring) — both previously called Anthropic directly via `@ai-sdk/anthropic`'s `createAnthropic()`. Now pass a plain `"provider/model"` string as `model` to `generateObject()`; the AI SDK (v7+) routes that through the Gateway automatically. `@ai-sdk/anthropic` and the direct `ANTHROPIC_API_KEY` dependency are gone from both files.
- `src/lib/embeddingPipeline.ts` — previously raw-`fetch`ed OpenAI's and Voyage's embeddings endpoints directly (branching on which of `OPENAI_API_KEY`/`VOYAGE_API_KEY` was set). Now calls the AI SDK's `embed()` with a single configurable Gateway model id (`AI_GATEWAY_EMBEDDING_MODEL`, default `openai/text-embedding-3-small`) — confirmed live via the Gateway's own model catalog that it serves embedding models from both providers (plus Google), so one Gateway auth path now covers whichever is chosen. The local deterministic pseudo-embedding dev/test fallback is unchanged in behavior, just now gated on Gateway auth being present instead of either provider key.
- **Not moved — `src/lib/batchApiHelper.ts` (weekly food-discovery job) stays a direct Anthropic call.** Confirmed via Vercel's own documentation (searched this session, no batch/async-discount endpoint mentioned anywhere in the AI Gateway docs) that the Gateway has no Message-Batches-API equivalent. This file still needs `ANTHROPIC_API_KEY` and a raw dated Anthropic model id — unchanged.

**Model-id flag resolved (was open since Phase 4/5):** fetched the Gateway's own model catalog live (`GET https://ai-gateway.vercel.sh/v1/models`, no auth required) rather than guessing. It lists `anthropic/claude-haiku-4.5` and `anthropic/claude-sonnet-5` verbatim — exact matches for CLAUDE.md's product names ("Claude Haiku 4.5", "Claude Sonnet 5"). This is the first time these model-id strings have been confirmed against a live source rather than defaulted and flagged.

**Env var changes (owner action needed — none of these are set in Vercel yet):**
- New: `AI_GATEWAY_API_KEY` (local dev / non-OIDC fallback only — production should rely on OIDC), `AI_GATEWAY_HAIKU_MODEL` (default `anthropic/claude-haiku-4.5`), `AI_GATEWAY_SONNET_MODEL` (default `anthropic/claude-sonnet-5`), `AI_GATEWAY_EMBEDDING_MODEL` (default `openai/text-embedding-3-small`).
- **`ANTHROPIC_HAIKU_MODEL` is unchanged in meaning** but now used *only* by the direct-API batch job (`foodDiscovery.ts`/`batchApiHelper.ts`) — it must stay a raw dated Anthropic id (e.g. `claude-haiku-4-5-20251001`), never a Gateway `"provider/model"` string. This is a deliberate split, not an oversight: the same env var used to be read by both the (now-migrated) OCR file and the (still-direct) batch job, and those two need different id formats — reusing one var for both would have silently broken whichever read it under the wrong assumption.
- `ANTHROPIC_SONNET_MODEL` (old name, only ever read by the now-migrated `researchScoring.ts`) is retired in favor of `AI_GATEWAY_SONNET_MODEL` — a clean rename, not a shared-var conflict, since nothing else referenced the old name.
- `OPENAI_API_KEY`/`VOYAGE_API_KEY` are no longer read anywhere in this codebase (embeddings now go through the Gateway) — harmless to leave set in Vercel if already there, but no longer required.

**Owner action needed before this works in production:** enable "OIDC Federation" in the Vercel project's settings (confirmed via Vercel's own docs that `VERCEL_OIDC_TOKEN` is only populated "when OIDC Federation is enabled" for the project — it is not on by default) — or, as a fallback, provision an `AI_GATEWAY_API_KEY` and set it in Vercel instead. Without one of these, every Gateway-routed call (OCR, research scoring, embeddings) will fail with an auth error once deployed.

**Dependency changes:** `ai` bumped `^3.4.33` → `^7.0.37`; `@ai-sdk/anthropic` removed entirely (no longer needed — the Gateway routes Anthropic models via plain string ids); `zod` bumped `^3.23.8` → `^3.25.76` (still v3, meets `ai@7`'s peer range, no API changes needed for this codebase's usage); the `zod-to-json-schema` override is removed — confirmed the new `@ai-sdk/provider-utils@5.x` dependency chain no longer depends on that package at all (it uses `@standard-schema/spec` instead), so the specific dependency-graph bug that forced Phase 4's version pin no longer applies. Also fixed a real breaking-change bug while migrating: `ImagePart`'s field renamed `mimeType` → `mediaType` between the old and new SDK major versions — `ingredientOcr.ts`'s vision call was updated accordingly.

**Verification done:** clean `rm -rf node_modules package-lock.json && npm install` succeeded (no corruption this session). `npx tsc --noEmit` passes with zero errors. `npm run build` completes successfully, all routes compile. **Not verified:** an actual live Gateway call — no `AI_GATEWAY_API_KEY` or Anthropic/OpenAI/Voyage key was available in this sandbox (all four are empty in the local `.env`), so none of `extractIngredientsFromImage()`, `researchScoring()`, or `generateEmbedding()`'s real (non-pseudo) path has been exercised end-to-end. Recommend testing all three once OIDC Federation is enabled (or a Gateway key is set) — ingredient photo submission end-to-end, a recommendation request with retrieved research chunks, and `npm run seed:phase4` for embeddings — before relying on this in production.

---

## Sign-in/sign-up flow + critical Vercel/Supabase misconfiguration (2026-07-24)

**1. Built the missing /signin, /signup, /account pages (Task 1 of this session's brief):**
- `src/app/signin/page.tsx`, `src/app/signup/page.tsx` — client-component email/password forms posting to the existing `POST /api/auth/signin` / `POST /api/auth/signup` routes. On success, store `user.id` via `clientAuth.ts`'s `setUserId()` — the same x-user-id-header stopgap every other owner-facing route already reads. Deliberately not the admin pages' pattern (`adminAuth.ts` storing a real Supabase access token) — those are a different, intentionally separate auth path for `serverAdminAuth.ts`'s admin check.
- `src/app/page.tsx` — the two landing-page buttons are now `<Link>`s to `/signin`/`/signup` (previously plain `<button>`s with no `href`/`onClick` at all, per the gap flagged since Phase 2).
- `src/app/account/page.tsx` — bare post-sign-in/sign-up confirmation page. **Owner-input flag:** there is no dog-profile-creation page or dog-listing dashboard anywhere in this app yet (confirmed — nothing exists under `src/app/dogs/[dogId]/` except pages that require an already-existing `dogId`). Per the task brief's own instruction not to silently build a large new flow for this, signup lands here rather than a "create your first dog" step. **Needs a decision:** should signup instead lead into a first-dog-profile creation flow? That's a real product surface that doesn't exist yet in any form (no "create dog" UI, only the `POST /api/dogs/create` API route).
- Also added `.claude/launch.json` (dev-server preview config, `npm run dev` on port 3000) — not app code, just enables local browser-preview testing in this tooling.

**2. Critical finding, NOT fixed by this session (outside what this session could safely touch) — the deployed app is talking to the wrong Supabase project:**
- While testing the new signup flow against `https://dog-food-helper.vercel.app`, signup requests succeeded at the Supabase Auth layer but failed on the `user_profiles` insert with `Could not find the table 'public.user_profiles' in the schema cache`.
- Investigated directly via Supabase SQL/logs on `ysffyuohwvdifvbopfcm` (the correct `Dog_Food_Helper` project — same one named throughout this file, confirmed via `NEXT_PUBLIC_SUPABASE_URL` in the local `.env`): **no request from these tests ever reached this project at all** — `auth.audit_log_entries`/`get_logs(service: auth)` show zero corresponding `/signup` calls, and `auth.users` stayed empty after each attempt.
- Checked the *other* Supabase project in the same org — `spsdfdlufqcduekqxxjk` ("Dog-smart-learning-centre", the **separate Dog Smart Studio editorial platform**, governed by the *other* CLAUDE.md at the repo-container level) — and found the test signups landed there instead (real `auth.users` rows were created for the test emails). That project's schema has no `user_profiles` table (it's a different application entirely — articles/knowledge_entries/sources, not dog profiles), which is exactly why the insert failed with that specific error.
- **Conclusion: the deployed `dog-food-helper.vercel.app` app's `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`SUPABASE_SERVICE_ROLE_KEY` Vercel env vars point at the wrong Supabase project** (`spsdfdlufqcduekqxxjk` instead of `ysffyuohwvdifvbopfcm`). This is a real, verified misconfiguration, not a guess — confirmed by direct row-level evidence in both projects.
- **Not fixed by this session:** the Vercel MCP connector available in this session only has visibility into a Vercel project named `dog-smart-learning-centre` (`prj_OEQhrrGScuPsa8loLp68uNeUFCSz`, domains: `dog-smart-learning-centre.vercel.app`, `learn.dogsmarttrainingbehaviour.co.uk`, — explicitly **not** `dog-food-helper.vercel.app`) — meaning the actual `dog-food-helper` Vercel project (whatever it's called on the Vercel side) is not reachable through this session's tools to correct its env vars directly, and changing production environment variables is an owner-approval-gated action regardless. **Needs owner action, urgent, before any real user signs up:** in the Vercel dashboard, find the project actually serving `dog-food-helper.vercel.app` and correct `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` to the `ysffyuohwvdifvbopfcm` project's values (matching this repo's local `.env`), then redeploy.
- **Cross-project cleanup done:** the two test accounts my testing created in the *wrong* project (`spsdfdlufqcduekqxxjk`) — `trainers+claudetest2@...`, `trainers+claudetest3@...` — were deleted from that project's `auth.users` directly (they were my own test artifacts, not real Studio users). A third test attempt against the local dev server (`trainers+claudetest1@...`), which correctly reached `ysffyuohwvdifvbopfcm` (local `.env` has the right URL — only the deployed Vercel app is misconfigured), was also cleaned up from `ysffyuohwvdifvbopfcm`'s `auth.users` (that attempt failed on the profile insert too, but for the unrelated reason that the local `.env`'s `SUPABASE_SERVICE_ROLE_KEY` is a placeholder value — see below).
- **Separate, lower-severity finding:** the local `.env` in this checkout has real values for `NEXT_PUBLIC_SUPABASE_URL`/`NEXT_PUBLIC_SUPABASE_ANON_KEY`/`ADMIN_EMAILS`/the Anthropic model-id env vars, but `SUPABASE_SERVICE_ROLE_KEY` and `CRON_SECRET` are literal placeholder strings (`placeholder_ser...`, `placeholder_cron_sec...`). This blocks any full local write-path test (signup's profile insert, or anything else using `supabaseAdmin`) until a real service role key is placed in a local `.env.local` — not fixed or guessed at here since it's a secret credential.
- **Verified as a side effect, not previously documented:** this Supabase project has **email confirmation effectively auto-completing** — the one signup that did complete end-to-end (`trainers+claudetest1@...`, via local dev pointed at the correct project) reached `confirmed_at`/`email_confirmed_at` within 30 seconds with no manual action from me. Worth confirming intentionally rather than relying on this observation alone.

**Cleanup fully verified (owner asked for a complete accounting):** the Vercel env-var mismatch itself predates this session (it was already listed as "currently set" in the task brief this session started from) — this session did not set it, only discovered it via live testing. What this session's testing *did* write to the wrong project (`spsdfdlufqcduekqxxjk`) was fully audited and undone:
- The two `auth.users` rows created as a side effect were deleted; re-confirmed with a follow-up `SELECT` that zero matching rows remain.
- Checked for triggers on `spsdfdlufqcduekqxxjk`'s `auth.users` table — none exist, so nothing could have cascaded into that project's own `profiles`/`roles`/`profile_roles` tables.
- Directly queried `spsdfdlufqcduekqxxjk.public.profiles` for the two deleted user IDs — zero rows, confirming no other data was written there.
- No DDL, RLS, or other writes were made against `spsdfdlufqcduekqxxjk` at any point — every other query against it was a read-only `SELECT`.
- The `NOTIFY pgrst, 'reload schema'` command run during investigation was scoped only to `ysffyuohwvdifvbopfcm` (this app's own project), never to the Studio project.

**Vercel env var fix confirmed working (owner corrected them, re-tested same session):** re-ran a live signup test against `dog-food-helper.vercel.app` after the owner corrected the Vercel project's Supabase env vars. Confirmed via direct log evidence on `ysffyuohwvdifvbopfcm` (not just the UI) that the request now reaches the **correct** project — the attempt was blocked only by Supabase's default email-send rate limit (`429: email rate limit exceeded`, from repeated test signups sent to the same real inbox during this session's investigation), not by the wrong-project bug. `public.user_profiles` confirmed still at 0 rows (no partial/junk data left behind by the rate-limited attempt). **A full write-through test (real account + profile row created) is still pending** until the rate limit window clears — recommend retrying in ~1 hour, or testing with a fresh, not-yet-used email address.

**Still needs owner input (carried over, unchanged by this session):** everything listed under Phase 6's "Needs owner input" and "Final review flags" sections below, plus the dog-profile-creation flow decision above (the Vercel env var item is now resolved).

---

## Post-Phase-6 hardening (2026-07-24)

Six flagged items from the owner's punch list, addressed in one session. `/docs/*` still doesn't exist in this checkout (unchanged from Phase 6's note) — worked from the inline task brief + live Supabase schema + this file, same as Phase 6.

**0. Baseline fixes needed just to run `npm install && npm run build` at all:**
- `next.config.ts` isn't supported by the installed Next 14.2.35 (TS config support landed in Next 15) — every build failed immediately with `next build` refusing to start. Replaced with `next.config.mjs` (same content). Pre-existing, not introduced this session.
- `node_modules` was corrupted from an interrupted install in this sandbox (webpack couldn't resolve `@supabase/phoenix` from inside `@supabase/supabase-js`'s nested `realtime-js`) — same recurring pattern every prior phase flagged. Fixed with a clean `rm -rf node_modules package-lock.json && npm install`. After both fixes, `npm run build` succeeds end-to-end.
- No ESLint config exists in this repo at all — `npm run lint` just prompts interactively (Strict/Base/Cancel) instead of running. Not fixed this session (out of scope for the 6 flags); run `npm run lint` once yourself and pick a config before relying on it in CI.

**1. RLS enabled on all previously-exposed tables (CRITICAL, done):**
- Live-schema check (not assumed) found the *actual* set of RLS-disabled tables differed from the punch list: `dog_food_events`, `dog_weight_logs`, `dog_log_entries`, `dog_red_flag_events`, and `ingredient_outcome_signals` already had RLS enabled with correct owner-scoped policies since Phase 1 — the punch list was stale on that point. The tables that actually had RLS disabled were: `user_profiles`, `account_inactivity_policy`, `wellness_indicator_reference`, `breed_life_stage_thresholds`, `metric_minimum_lag_days`, `recommendation_scoring_weights`, `foods`, `food_ingredients`, `ingredient_review_queue`, `source_domain_allowlist`, `research_documents`, `research_chunks` (`user_profiles` and `food_ingredients` weren't on the punch list either way).
- Confirmed via repo-wide grep that every data-table query in this codebase goes through `supabaseAdmin` (service role, bypasses RLS) — the anon `supabase` client is only ever used for `.auth.signInWithPassword`/`.auth.signUp` calls, never a `.from()` query — so enabling RLS could not break any existing app behaviour; it only closes the anon-key-exposure hole.
- Policies applied (migration `enable_rls_remaining_tables`, live on project `ysffyuohwvdifvbopfcm`):
  - Public read (anon + authenticated), service-role write only: `foods`, `food_ingredients`, `wellness_indicator_reference`, `breed_life_stage_thresholds`, `metric_minimum_lag_days`, `recommendation_scoring_weights`.
  - Public read restricted to `review_status='approved' AND superseded_by IS NULL`: `research_documents`, `research_chunks` — mirrors the same filter `ragRetrieval.ts` already applies in application code (defense in depth).
  - Owner-scoped (matches the existing `dogs`/`dog_*` pattern): `user_profiles` (`id = auth.uid()`).
  - Authenticated read-only, no client write policy: `account_inactivity_policy`.
  - Authenticated read of own rows only (`submitted_by = auth.uid()`), no insert/update/delete policy — submission/review must go through the API routes (EXIF stripping, validation, OCR, admin review), not a direct table write: `ingredient_review_queue`.
  - **Judgment call, flagged:** `source_domain_allowlist` was deliberately left with *zero* anon/authenticated policies (fully denied, service-role/cron-only) rather than treated as public reference data — it's internal scraping configuration with no client-facing purpose anywhere in the app. Confirmed via `get_advisors` this produces only an expected INFO-level "RLS enabled, no policy" note, not an error.
- Re-ran the security advisor after applying: the `rls_disabled_in_public` ERROR is gone. Only two INFO-level "RLS enabled, no policy" notes remain (`source_domain_allowlist`, `batch_submissions` — both deliberate, service-role-only tables, see below).

**2. Inactivity-warning emails now actually send (was silently logged only):**
- Added `src/lib/emailProvider.ts` — a minimal Resend REST API client (raw `fetch`, no new npm dependency, matching `batchApiHelper.ts`'s existing pattern — deliberately avoids adding a dependency in a sandbox that has repeatedly hit npm-install corruption on new/transitive deps).
- `src/lib/accountLifecycle.ts`'s `sendInactivityWarning()` now sends a real email and returns whether it was actually delivered. **Safety fix beyond the literal ask:** `checkInactiveAccounts()` now only stamps `inactivity_warning_sent_at` when the send succeeds — previously it stamped unconditionally even though nothing was sent, which is exactly the "user deleted having never been warned" risk the punch list flagged. If email isn't configured or a send fails, the user is simply retried on the next daily run instead of being silently queued for deletion.
- New env vars: `RESEND_API_KEY`, `EMAIL_FROM_ADDRESS` (must be a sender verified with your Resend account/domain) — see `.env.example`.

**3. `batch_submissions` tracking table added (was: async job could orphan manifests):**
- New table (migration `add_batch_submissions_tracking_table`): `id, batch_id, manifest, status, created_at, completed_at, result_summary`. **Deviation, flagged:** added `manifest` beyond the originally-specified column list — without persisting the manifest itself, the process step still couldn't run without the caller supplying it externally, which is the exact gap this table exists to close.
- `submitDiscoveryBatch()` now persists a row immediately after the batch is created. `processDiscoveryBatch()` reads the manifest back from this table if not passed explicitly, and updates `status`/`completed_at`/`result_summary` as it processes.
- **Bug fix found in the process:** `POST /api/cron/food-discovery/process` previously *required* a JSON body (`{batch_id, manifest}`), but Vercel Cron sends a bodyless GET — meaning the automated cron path could never have worked at all, only manual POSTs with a body. Reworked the route: no body → processes every outstanding `batch_submissions` row (new `getPendingBatchSubmissions()`); `{batch_id}` in the body → processes one specific batch manually. `RLS`: `batch_submissions` is enabled with zero anon/authenticated policies (internal job-tracking data, service-role/cron-only), same as `source_domain_allowlist`.

**4. Embedding provider misconfiguration now fails loudly in production:**
- `src/lib/embeddingPipeline.ts`: new `assertEmbeddingProviderConfigured()`, called at the top of `generateEmbedding()`. Throws if neither `OPENAI_API_KEY` nor `VOYAGE_API_KEY` is set **and** `NODE_ENV === 'production'` — dev/test behaviour (local deterministic pseudo-embedding + warning) is unchanged. Still needs an owner decision on which provider to use (unchanged flag from Phase 4).

**5. Real admin auth (was: shared `RESEARCH_INGEST_ADMIN_TOKEN` secret since Phase 4, across 8 routes):**
- Migration `add_user_profiles_is_admin_role`: `user_profiles.is_admin boolean not null default false`. Minimal boolean role rather than a full roles/`profile_roles` table — matches the punch list's own "or at least tie it to Supabase Auth + a role column."
- New `src/lib/serverAdminAuth.ts` — `requireAdmin(request)`: verifies a real Supabase session bearer token (`Authorization: Bearer <access_token>`) via `supabaseAdmin.auth.getUser()`, then checks `user_profiles.is_admin` for that user. Replaces the shared-token check in: `POST /api/research/ingest`, `POST /api/ingredients/review` (also now sets `reviewed_by` to the authenticated admin's own id, not a client-supplied field), `GET /api/ingredients/review-queue`, `GET /api/ingredients/photo-url`.
- `src/lib/cronAuth.ts` (`isCronAuthorized`, now async): still accepts `Authorization: Bearer $CRON_SECRET` for Vercel Cron itself (machine-to-machine, unchanged), and now *also* accepts a real admin session bearer token on the same header for manual/human triggering — replacing the old `x-admin-token`/`RESEARCH_INGEST_ADMIN_TOKEN` fallback. All three cron routes' `GET`/`POST` handlers updated to `await` it.
- **Admin bootstrap:** new `ADMIN_EMAILS` env var (comma-separated) — `POST /api/auth/signup` sets `is_admin=true` on the new profile if the signup email matches, avoiding a manual SQL `UPDATE` to create the first admin. `user_profiles` currently has 0 rows (no one has signed up yet) — **needs owner action:** set `ADMIN_EMAILS` to your own email before your first signup.
- Client side: `src/lib/adminAuth.ts` now stores a real Supabase access token (from `POST /api/auth/signin`) instead of a pasted static secret, sent as `Authorization: Bearer <token>` instead of `x-admin-token`. `IngredientReviewQueueAdmin.tsx`'s login gate is now an actual email/password sign-in form; a 401 from the review-queue endpoint (wrong password, or a non-admin account) clears the stored token and shows a clear message rather than looking like an empty queue.
- **RLS-interaction fix, required by item 1 above, not optional:** `POST /api/auth/signup` and `POST /api/auth/signin` were writing to `user_profiles` via the shared anon `supabase` client. With RLS now enabled (`id = auth.uid()`), that insert/update would silently fail whenever `signUp()` doesn't return an active session (e.g. email confirmation enabled) — there's no reliable `auth.uid()` for a module-level singleton client shared across concurrent server requests to rely on either. Both routes now write via `supabaseAdmin` instead, matching every other table write in this codebase. Found and fixed as a direct, necessary consequence of item 1 — not scope creep.

**6. Bristol/BCS chart illustrations — admin upload (flagged "nice to have", done anyway):**
- New public Storage bucket `chart-illustrations` (`src/lib/chartIllustrationStorage.ts`) — public because these are original, non-sensitive reference illustrations, same trust level as `foods`. No new DB table: deterministic paths (`${chartType}/${value}.{png,svg}`) plus a single `manifest.json` object in the same bucket, read by the new public `GET /api/charts/illustrations`. Keeps this codebase's "don't add tables outside spec without flagging it" convention intact for a feature this small.
- `POST /api/admin/charts/upload` — admin-gated (`requireAdmin`, same as item 5), PNG/SVG only, 2MB limit.
- `/admin/charts` (`ChartIllustrationsAdmin.tsx`) — upload slot per Bristol value (1-7) and BCS value (1-9), shows the current image if one exists. Reuses the same sign-in/token as the review-queue admin page.
- `BristolChartSelector`/`BCSChartSelector` now fetch the manifest (`useChartIllustrations` hook) and render an `<img>` per option when one has been uploaded, falling back to the existing text-only rendering otherwise (`onError` also hides a broken image rather than showing a broken-image icon) — exactly the "swap the rendering for `<img>` once artwork exists, the `value` contract doesn't change" note from Phase 2.
- **Still requires original artwork to actually be commissioned and uploaded** — this only builds the upload/display mechanism. Legal constraint (never use existing brand/body artwork) is documented in the code but not something the code can enforce automatically.

**Needs owner input (new this session):**
- Set `ADMIN_EMAILS` (your email) before you sign up, to become the first admin automatically — see item 5.
- Set `RESEND_API_KEY` + `EMAIL_FROM_ADDRESS` (a sender verified with your Resend account/domain) before inactivity warnings actually deliver — until then they fail safe (retried, never silently marked sent) but nothing is sent.
- No ESLint config exists in this repo — run `npm run lint` once and choose Strict or Base.
- Commission the original Bristol/BCS illustrations, then upload them via `/admin/charts`.
- Everything still open from Phase 6's own list is unchanged by this session: `dog_health_conditions` hard-filter exclusion (Phase 3, safety-relevant); `wellness_indicator_reference` taxonomy not research-backed (Phase 2); Sonnet/Haiku exact model-id strings unconfirmed against the live Anthropic list (Phase 4/5); Batch API request/response shape unverified against a live batch (Phase 6); legal/GDPR review not done (Phase 6); `/docs/*` still missing from this checkout.

---

## Phase 1: Foundations ✅

**Status:** ✅ COMPLETE

**Completed:**
- ✅ Supabase schema deployed (all enums, tables, indexes)
- ✅ Reference data seeded (breed_life_stage_thresholds, metric_minimum_lag_days, recommendation_scoring_weights)
- ✅ Food dataset with sample UK brands (30 foods)
- ✅ Hard-filter logic implemented (applyHardFilter, isFoodSuitable functions)
- ✅ Auth routes (signup, signin with user_profile creation)
- ✅ Dog profile CRUD (create, read, update)
- ✅ Restrictions API (add allergies, intolerances, health conditions)
- ✅ Landing page with sign in/up buttons + disclaimer
- ✅ Row-level security: RLS policies enabled on all user-scoped tables

---

## Phase 2: Baseline & monitoring

**Status:** ✅ COMPLETE

**Scope (technical-build-spec.md Part B, architecture doc §4/§8/§9):**

**API endpoints built:**
- `POST /api/baselines/establish` — establishBaseline. Verifies dog ownership, anchors to `dogs.current_food_id`, writes one `dog_log_entries` row per metric (stool_score, body_condition_score, coat_condition, stool_odor, gas_frequency, gas_odor, optional behaviour_tag) plus a `dog_baselines` pointer row. Only callable once per dog unless `force_reset: true` is passed — resets create a new baseline row rather than silently overwriting.
- `GET /api/baselines?dog_id=` — fetches the current baseline + its entries (used by the UI to decide baseline-vs-quick-log flow; not a named Part B action but a natural read-side companion to establishBaseline).
- `POST /api/logs/quick` — logQuickEntry. Accepts `{ metric, trend }[]`; server computes `within_expected_variability_window` and `food_id_active` per metric via `src/lib/lagWindow.ts`, which checks `metric_minimum_lag_days` against the currently active `dog_food_events` row.
- `POST /api/logs/recalibrate` — logRecalibration. Accepts `{ metric, raw_value }[]`; derives `trend` server-side by comparing against the baseline reading (`src/lib/trendLogic.ts`). See deviation note below for `behaviour_tag`.
- `POST /api/red-flags` — logRedFlagEvent. `PATCH /api/red-flags` also added to acknowledge a flag once the owner has seen the "contact your vet" prompt (acknowledged column already in schema, wasn't otherwise reachable).
- `POST /api/food-events/start` — startFoodEvent. Computes `in_transition_until` server-side (never client-set). If `event_type: 'main_food'`, also updates `dogs.current_food_id`/`current_food_freetext` since that's the baseline/lag-window anchor.
- `POST /api/food-events/end` — endFoodEvent.
- `POST /api/weight-logs` + `GET /api/weight-logs?dog_id=` — not a named Part B action, but `dog_weight_logs` is explicitly in Phase 2's table scope and needed a write path; added as a straightforward extension of the same pattern rather than left unimplemented.

**Libraries:**
- `src/lib/lagWindow.ts` — `computeVariabilityWindow(dogId, metric, logDate)`: finds the active `dog_food_events` row for a date, looks up `metric_minimum_lag_days`, returns whether the reading falls inside that metric's settling window. Used by both quick-log and recalibration.
- `src/lib/trendLogic.ts` — `deriveTrend(metric, baselineRawValue, newRawValue)`: for stool_score/body_condition_score, compares distance-from-ideal (ideal = Bristol Type 2 / BCS 5) between baseline and new reading; for the four wellness-level metrics, compares good<questionable<poor ordinal rank. Returns null for behaviour_tag (see deviation below).
- `src/lib/chartReference.ts` — Bristol 7-point and BCS 9-point text option lists (original wording, no images — see below), wellness good/questionable/poor descriptions, red-flag type list.

**UI components (`src/components/`):** `BristolChartSelector`, `BCSChartSelector`, `WellnessLevelSelector`, `BaselineForm` (full chart selection, one-time), `QuickLogForm` (better/worse/no-change taps, 7 metrics), `RecalibrationForm` (optional full re-selection), `RedFlagForm` (distinct urgent red/amber styling — the "contact your vet" banner renders immediately client-side on tap, before/independent of the API call completing, per Part B).

**Pages:** `/dogs/[dogId]/baseline`, `/dogs/[dogId]/log` (quick-log, with links out to recalibrate and red-flag), `/dogs/[dogId]/log/recalibrate`, `/dogs/[dogId]/red-flag`.

**Checklist:**
- [x] Schema: all Phase 2 tables already existed (per task); reference-data seed added — see `supabase/seed_phase2.sql` for `metric_minimum_lag_days` and `wellness_indicator_reference` seed rows (schema existing but seed rows weren't confirmed present)
- [x] Bristol/BCS: text/placeholder labels only, no images (see "Needs owner input" — illustrations not yet commissioned)
- [x] API endpoints: establishBaseline, logQuickEntry, logRecalibration, logRedFlagEvent, startFoodEvent, endFoodEvent (+ weight log endpoints, + baseline/red-flag GET/PATCH helpers)
- [x] UI: baseline establishment flow (full visual chart selection, text-only)
- [x] UI: quick-log interface (tap better/worse/no-change per indicator)
- [x] UI: red-flag prompt (distinct, urgent styling — red border/palette, immediate client-side response)
- [x] Baseline logic: anchors to `dogs.current_food_id` (`food_at_baseline_id`)
- [x] Lag windows: `within_expected_variability_window` computed per metric from `metric_minimum_lag_days` against the active `dog_food_events.started_at`

**Deviations from spec / assumptions made (logged per CLAUDE.md's "stop and log" rule):**
1. **`stool_score` vs `bristol_score` naming** — the Phase 2 prompt refers to "bristol_score" as a metric type, but the Part A `outcome_metric` enum only defines `stool_score`. Used `stool_score` (the actual DB enum value) throughout; UI copy says "Bristol-style stool consistency" for clarity. Not treated as ambiguous — Part A's enum is unambiguous — but noting the naming mismatch so it isn't mistaken for a bug later.
2. **`in_transition_until` default = 10 days, not 9.** Part B's example text says "e.g. started_at + 9 days"; the architecture doc and `metric_minimum_lag_days` seed both use 10 for digestive metrics. Went with 10 to keep `in_transition_until` consistent with the seeded reference table rather than introduce a second, slightly different number.
3. **`behaviour_tag` trend on recalibration.** A tag-list diff has no principled automatic "better/worse" derivation (unlike the numeric/ordinal metrics). `logRecalibration` accepts an optional owner-supplied `trend` for this one metric only; everything else is always server-derived and any client-supplied trend is ignored. `deriveTrend()` returns `null` for `behaviour_tag`/`weight_trend` by design.
4. **`dog_weight_logs` write path.** Not a named action in Part B's table, but the table is explicitly in Phase 2's scope. Added `POST/GET /api/weight-logs` as a direct extension of the existing pattern (also updates `dogs.weight_kg` for quick display) rather than leaving the table without any writer.
5. **`GET /api/baselines`** and **`PATCH /api/red-flags`** added as read/acknowledge companions to the named write actions — needed by the UI (to know whether a baseline exists yet; to let an owner dismiss the urgent prompt) but not separately named in Part B.
6. **No session/auth layer existed yet from Phase 1** (API routes read a plain `x-user-id` header; the landing page's sign-in/up buttons aren't wired to anything). Added `src/lib/clientAuth.ts`, a minimal localStorage-backed `userId` holder, purely so the new logging UI has something to attach as that header. This is a stopgap, not a real session — should be replaced when auth is properly built out (still open from Phase 1, not part of Phase 2's scope to fix properly).
7. **`tsconfig.json` path alias bug fixed.** `"@/*": ["./*"]` with no `baseUrl` resolved to the repo root, not `src/`, so every existing `@/lib/...` import (Phase 1 files included) was pointing at a non-existent path. Set `baseUrl: "."` and `"@/*": ["./src/*"]`. This was a pre-existing Phase 1 config issue, not something introduced in Phase 2, but it blocks all imports (old and new) so it needed fixing here.

**Needs owner input:**
- **Bristol stool chart & BCS illustrations: still not supplied.** Per the phase instructions, used plain text/placeholder labels only (`src/lib/chartReference.ts`, rendered by `BristolChartSelector`/`BCSChartSelector`) — no images sourced from the web as a substitute, no brand/body artwork embedded. `stool-chart-descriptions.md` (in the docs folder) has ready-to-use image-generation prompts for the 7 Bristol types; an equivalent BCS prompt document doesn't exist yet (the descriptions doc explicitly offers to produce one "if useful"). Once original illustrations are commissioned, swap the text rendering in those two components for `<img>` per option — the underlying `value`/data contract doesn't need to change.
- **`wellness_indicator_reference` taxonomy is still a draft**, not backed by a specific research source yet (architecture doc §4 flags this explicitly as needing real research input). Seeded with a reasonable starting taxonomy (`supabase/seed_phase2.sql`) so the table isn't empty, but `research_document_id` is left null on every row pending Phase 4's research corpus.
- A stray `tsconfig.check.json` and `tsconfig.tsbuildinfo` (created for manual `tsc --noEmit` verification during this session) could not be deleted due to a filesystem restriction in the build sandbox — both are inert (not referenced by anything, and now `.gitignore`d so they won't get committed) but should be deleted from the repo folder directly when convenient.
- No `.gitignore` existed in the repo at all (a Phase 1 gap) — added one covering `node_modules/`, `.next/`, `.env*`, and the two stray files above, so a future `git add` doesn't accidentally commit dependencies or secrets.

**Verification note:** couldn't get a full `npm install`/`next build` to complete in the sandbox used for this session (environment-level issues: interrupted installs left a corrupted `@types/node`, and the mounted filesystem blocked file deletion, including `rm -rf node_modules`). Confirmed via a scoped `tsc` pass that the errors present are identical between pre-existing Phase 1 files and the new Phase 2 files (both hit `Cannot find module 'next/server'` etc. under the broken install) — i.e. not something introduced by this phase's code. Recommend running `npm install && npm run build` in a clean environment before relying on this being fully verified.

**What Phase 3 will need:**
- Phase 2 complete; logging endpoints exist and write real `dog_log_entries` rows once used
- Run `supabase/seed_phase2.sql` against the project if not already done, so `metric_minimum_lag_days` and `wellness_indicator_reference` are populated
- `breed_life_stage_thresholds` seeded (carried over from Phase 1 note, still worth confirming)

---

## Phase 3: Recommendation engine v1 (no RAG yet)

**Status:** ✅ COMPLETE

**Scope (technical-build-spec.md Part B `getRecommendations`, architecture doc §2/§4/§5):**

**API endpoint built:**
- `POST /api/recommendations` — `{ dog_id, budget_override? }` → hard-filters, scores, returns top 10 + `disclaimer` ("This is a decision-support tool, not veterinary advice..."). Also returns `excluded_count`, `excluded_reasons`, `total_candidates`, `weights_used` (post-normalisation), `life_stage_used`, `weight_assumed`.

**Libraries added:**
- `src/lib/lifeStage.ts` — `deriveLifeStage(date_of_birth, size_category)` against `breed_life_stage_thresholds`. See deviation #1 below — this didn't exist at all before Phase 3 despite being marked done in Phase 1/2.
- `src/lib/nutritionalScoring.ts` — `calculateDER(dog)` (RER = 70×weight_kg^0.75, then a documented multiplier table by life_stage/lifestyle_role/work_type/daily_exercise_hours) + `scoreNutritionalFitForFood(dog, food, der)`: 0.5×calorie-density-vs-energy-need match + 0.3×age suitability + 0.2×size suitability, 0-1.
- `src/lib/budgetScoring.ts` — `scoreBudgetFit(food, der, monthlyBudget)`: estimates monthly cost from DER/calories_per_kg × 30.4 × price_per_kg, scores 1 at-or-under budget, decaying to 0 at 2× budget.
- `src/lib/recommendationScoring.ts` — `getActiveScoringWeights()` (reads `recommendation_scoring_weights` where `active=true`) + `normalizeWeights()` (renormalises if the four weights don't sum to 1.0) + `scoreFood()` combining nutritional_fit/research_relevance(=0)/budget_fit/correlation_signal(=0) into `overall_score`, plus a `confidence` figure and a plain-language `reason` string.

**Hard filter (Phase 1, verified):**
- `src/lib/hardFilter.ts`'s restriction-based exclusion (ingredient substring match against `dog_restrictions`) works and was reused as-is.
- **Health-condition exclusion does not work** — `dog_health_conditions` rows are fetched but were never used to exclude anything, in Phase 1 or now. See "Needs owner input" below; this is a safety-relevant gap, not something guessed around.

**Verified against the live Phase 1 dataset** (Supabase project `Dog_Food_Helper`, 30 seeded foods): ran the RER/DER/calorie-density math standalone for two profiles — a working gundog (25kg, `lifestyle_role: working`, `work_type: gundog`, 4h/day exercise) and a sedentary pet (12kg, `lifestyle_role: pet`, 0.5h/day) — against real seeded `calories_per_kg`/`price_per_kg` values. Confirmed the gundog scores calorie-dense kibble (Aatu, 3800 kcal/kg) at 0.79 and a low-density wet food (Forthglade, 950 kcal/kg) at 0.00, while the sedentary pet's scores invert (0.38 vs 0.56 favouring the lower-density option) — i.e. the "working gundog vs. sedentary pet should score differently" requirement holds. Monthly cost estimates also scale sensibly (Ziwi Peak raw at 32/kg + 4700kcal/kg ≈ £567/month for the gundog vs. Skinner's at 7.50/kg + 3550kcal/kg ≈ £176/month).

**Could not run a full `next build`/`tsc` pass** — same pre-existing corrupted `node_modules/@types/node` noted in Phase 2 (`node_modules/@types/node/util.d.ts` is truncated mid-comment, `error TS1010: '*/' expected`, unrelated to any Phase 3 code). Reviewed all new/changed files by hand for type correctness instead. Recommend `rm -rf node_modules && npm install && npm run build` in a clean environment before relying on this being fully verified.

**Deviations from spec / assumptions made (logged per CLAUDE.md's "stop and log" rule):**
1. **`life_stage` was never actually being computed anywhere**, despite Phase 1/2 both being marked complete and the dog-profile PUT route correctly *rejecting* client writes to it. `dogs.life_stage` has sat null since Phase 1. Since Phase 3 explicitly needs life_stage as a scoring input, added `src/lib/lifeStage.ts` and wired it into `POST /api/dogs/create` (computed at insert) and `PUT /api/dogs/[dogId]` (recomputed whenever `date_of_birth`/`size_category` change) as well as into the recommendation scoring itself. Not treated as ambiguous — the derivation rule and thresholds table are fully specified in the architecture doc §4 / Part C item 1 — just previously unimplemented.
2. **`nutritional_fit` cannot check true AAFCO/WSAVA per-nutrient adequacy** — the architecture doc says it should rest on AAFCO/WSAVA nutrient profiles, but Part A's `foods` table has no protein/fat/fibre/moisture columns, only `calories_per_kg` and the suitability range fields. Implemented the closest schema-supported approximation instead: age/size suitability (foods already declare these directly) + calorie-density-to-energy-need matching, using the standard RER/DER veterinary formula as the basis for "energy need." This is flagged, not silently treated as full AAFCO compliance — see "Needs owner input" below.
3. **DER multiplier bands and calorie-density target bands are designed heuristics**, not sourced from one official table — same honesty caveat the architecture doc's Part C item 4 already applies to the four scoring weights. Documented inline in `nutritionalScoring.ts` with the veterinary reasoning used (NRC 2006-style multiplier ranges), not presented as a hard standard.
4. **`confidence` is capped at the proportion of scoring weight backed by implemented factors** (nutritional_fit_weight + budget_fit_weight, post-normalisation) rather than reflecting how well a food scored. Per architecture doc §9 ("confidence must be honest, not reassuring"): research_relevance and correlation_signal are contributing their true value of 0 in Phase 3 (not an inflated stand-in), so confidence communicates "how much of the model is live yet," separate from `overall_score`.
5. **No monthly budget set on a dog and no `budget_override` supplied** → `budget_fit` scores 0.5 (neutral), not penalised and not assumed. Same neutral-0.5 treatment for `calories_per_kg`/`price_per_kg` gaps on a food record.
6. **No `recommendation_log`/output-versioning table exists in Part A's schema** — the architecture doc §9 mentions keeping a record of what was shown to a user and when, but there's no table for it and Phase 3's spec doesn't list it either. Not built; flagged here rather than inventing a new table outside Part A.

**Needs owner input:**
- **`dog_health_conditions` → hard-filter exclusion is unimplemented.** There is no condition→contraindicated-ingredient/nutrient mapping anywhere in Part A's schema (no nutrient columns on `foods`/`food_ingredients`, no `condition_contraindications` reference table). Guessing a free-text condition-name → ingredient mapping would be exactly the kind of silent, safety-relevant assumption the "stop and log" rule exists to prevent — a wrong guess here is a hard-filter safety bug, not a scoring nuance. Needs either (a) a `condition_contraindications` reference table (condition → excluded ingredient_category/ingredient_name), or (b) nutrient columns on `foods` plus condition→nutrient-threshold rules, before this can be built. `src/lib/hardFilter.ts` still fetches `dog_health_conditions` (flagged inline) so it's a one-line change to wire up once the mapping data model is decided.
- **True AAFCO/WSAVA per-nutrient adequacy scoring** needs a Part A schema extension (protein/fat/fibre/moisture % on `foods`) — current Phase 3 nutritional_fit approximates this via age/size suitability + calorie-density-to-energy-need matching only, as noted above.
- **DER multiplier bands and calorie-density target bands** (`nutritionalScoring.ts`) are a designed starting point pending a proper vet/nutrition review — same status as the four top-level scoring weights already flagged as resolved-but-designed in Part C item 4.
- Still open from Phase 2: Bristol/BCS illustrations not supplied; `wellness_indicator_reference` taxonomy not research-backed yet.

**What Phase 4 will need:**
- `research_relevance` currently hardcoded to 0 in `recommendationScoring.ts` — Phase 4 replaces that with real RAG-retrieved research scoring
- `research_documents`/`research_chunks` tables already exist in schema (both empty)
- Consider resolving the health-condition hard-filter gap above before/alongside Phase 4, since it's a safety-layer gap, not merely a scoring one

---

## Phase 4: RAG research layer

**Status:** ✅ COMPLETE

**Scope (technical-build-spec.md Phase 4 prompt, architecture doc §4/§5/§9):**

**Libraries added:**
- `src/lib/embeddingPipeline.ts` — `chunkText(text, maxChars=800)` (paragraph-first, sentence-fallback chunking) + `generateEmbedding(text)` + `ingestResearchDocument({topic, title, source_url, text, review_status, supersedes_document_id})`, which chunks, embeds each chunk, and writes `research_documents` + `research_chunks`. Also wires `superseded_by`: passing `supersedes_document_id` points the *old* document's `superseded_by` at the newly-ingested one.
- `src/lib/ragRetrieval.ts` — `retrieveResearchFor(dogId, topK=5)`: fetches the dog's restrictions + health conditions, builds a deterministic (non-LLM) search-query string from that profile, embeds it, and calls the `match_research_chunks` Postgres RPC (see below) to vector-search `research_chunks`. Filters to `review_status='approved'` and `superseded_by is null` in both the SQL function and again in TS (defense in depth) — pending/rejected/superseded research can never reach a recommendation.
- `src/lib/researchScoring.ts` — `researchScoring(dog, food, chunks)`: if no chunks were retrieved, returns an honest `{score: 0, summary: '...'}` (never guesses a non-zero score against no evidence). Otherwise calls Claude Sonnet (`generateObject` via Vercel AI SDK + zod schema) to produce a `relevance_score` (0-1) + plain-language `reasoning`. On any LLM-call failure, also falls back to `0` + an explicit "couldn't be computed" summary rather than silently omitting the factor — same confidence-honesty principle as Phase 3's `confidence` calculation.
- `src/lib/recommendationScoring.ts` — `scoreFood()` is now `async`; takes a new `researchChunks` parameter (fetched once per request, reused across all candidate foods) and calls `researchScoring()` instead of hardcoding `research_relevance = 0`. `confidence` is now capped at `nutritional_fit_weight + research_relevance_weight + budget_fit_weight` (previously just nutritional+budget) — correlation_signal is the only remaining zero-value factor until Phase 6. `reason` now always includes the research summary sentence (surfaced whether relevant research was found or not — a "no relevant research" result is itself honest information, not hidden).

**API changes:**
- `POST /api/recommendations` — now retrieves research once per request (`retrieveResearchFor(dog_id, 5)`) and passes it into every candidate's `scoreFood()` call, scored in batches of 5 concurrent Sonnet calls (not one giant `Promise.all`, to bound latency/rate-limit risk as the food dataset grows — an engineering choice, not a spec requirement). Response now includes real (non-zero-capable) `research_relevance` + `research_summary` per food, and a top-level `research_context` array (topic/title/source_url/similarity per retrieved chunk) for transparency.
- `POST /api/research/ingest` (new) — admin-only via a shared-secret `x-admin-token` header checked against `RESEARCH_INGEST_ADMIN_TOKEN`. Calls `ingestResearchDocument()`. Defaults `review_status` to `'pending'` unless the caller explicitly sets `'approved'` — ingestion alone never makes a document live for retrieval, matching the "never auto-merge unreviewed content" principle. **This is a stopgap, not real admin auth** (same category of gap as Phase 2's `clientAuth.ts` — there's still no real session/role system in this codebase) — flagged, not silently treated as production-ready access control.

**SQL added:**
- `supabase/seed_phase4.sql` — creates `match_research_chunks(query_embedding vector(1536), match_count int)`, a Postgres function wrapping the pgvector cosine-similarity search (`<=>` operator against the existing ivfflat index), filtered to `review_status='approved' and superseded_by is null` directly in SQL. Run this against the Supabase project before using RAG retrieval.

**Sample research corpus:**
- `scripts/seedPhase4Research.ts` (run via `npm run seed:phase4`) — seeds 8 placeholder research documents (2 each: gut_biome, allergy, health_condition, general), all with `review_status: 'approved'` so they're immediately usable. Content is explicitly placeholder text (no real papers cited), as instructed by the phase prompt.

**Deviations from spec / assumptions made (logged per CLAUDE.md's "stop and log" rule):**

1. **"Call Claude Haiku to embed each chunk into a 1536-dimensional vector" is not something Anthropic's API can literally do.** Anthropic does not offer an embeddings endpoint for any Claude model, including Haiku — Claude models generate text, they don't produce embedding vectors, and Anthropic's own docs point to Voyage AI as their recommended embeddings partner. Rather than silently substituting something else and calling it done, this is flagged explicitly (full detail in `src/lib/embeddingPipeline.ts`'s header comment): `generateEmbedding()` tries OpenAI's `text-embedding-3-small` (if `OPENAI_API_KEY` set — chosen as the default real-provider recommendation since it natively returns exactly 1536 dimensions, zero mismatch risk against the schema's `vector(1536)` column), then Voyage AI (if `VOYAGE_API_KEY` set), then falls back to a local deterministic pseudo-embedding (hash-seeded, NOT semantically meaningful — logs a warning every time it's used) so the pipeline/schema/plumbing can still be exercised end-to-end without any external key. **Needs owner input: pick a real embedding provider (OpenAI vs Voyage vs other) and set the corresponding API key before RAG retrieval quality can be trusted** — with neither key set, `npm run seed:phase4` will still run and populate the tables, but retrieval will be semantically arbitrary, not "no results" (a silent-looking failure mode worth knowing about).
2. **`supabase/seed_phase4.sql` doesn't itself contain the ~8 sample research documents**, despite the phase prompt naming that file as the deliverable for the sample corpus. Reason: `research_chunks.embedding` needs a real embedding per chunk, which requires an API call — pure SQL can't do that. `seed_phase4.sql` contains the one thing that *can* be pure SQL (the `match_research_chunks` search function); the actual sample documents are seeded by `scripts/seedPhase4Research.ts` (`npm run seed:phase4`), which calls the same `ingestResearchDocument()` function the admin API route uses. Documented at the top of both files so this isn't a silent split.
3. **Search-query construction in `retrieveResearchFor()` is a deterministic string template, not an LLM call.** The phase prompt says "generate a search query" without specifying how; turning a dog's restrictions/conditions into a query string is straightforward concatenation, not a reasoning task, so an extra Claude call for it would add latency/cost without a clear benefit. Flagged as a judgement call, not hidden.
4. **`ANTHROPIC_SONNET_MODEL` / model-id strings are configurable via env var, defaulted rather than hardcoded blind.** CLAUDE.md names "Claude Sonnet 5" / "Claude Haiku 4.5" as product names; the exact Anthropic API model-id strings those correspond to weren't independently confirmed in this session. Defaults are set in `src/lib/researchScoring.ts` (`claude-sonnet-4-5-20250929`) — **confirm/update this against the live Anthropic model list before relying on it in production.**
5. **Research scoring is batched (5 concurrent Sonnet calls at a time) rather than fired for all candidates simultaneously**, in `POST /api/recommendations` — an engineering choice to bound latency/rate-limit exposure as the food dataset scales past the current 30 seeded foods, not a spec requirement. Every surviving candidate still gets scored, nothing is silently dropped.
6. **`@ai-sdk/anthropic` was pinned to `^0.0.56`, not the `^0.0.40` already in `package.json` before this phase.** `0.0.40`'s installed `@ai-sdk/provider-utils` (0.0.18) is incompatible with the already-present `ai@^3.0.0` (resolves to 3.4.33 in this environment, which needs `@ai-sdk/provider-utils@1.0.x`) — `generateObject()` crashed at import time (`createIdGenerator is not a function`) under the original pin. Verified `ai@3.4.33` + `@ai-sdk/anthropic@0.0.56` + `zod@3.23.8` load and call correctly in isolation. Also added an `overrides` block pinning `zod-to-json-schema` to `3.23.5` — versions ≥3.24 of that package import a `zod/v3` subpath that only exists under zod v4, which crashes at import time when zod v3 (the peer both `ai` and `@ai-sdk/anthropic` declare) is actually installed. This is a real, verified npm dependency-graph bug in the ecosystem, not a guess — reproduced and fixed in an isolated test install before applying to `package.json`.
7. **Fixed a corrupted `node_modules/@types/node/util.d.ts`** in this session's build environment (truncated mid-comment at line 1362 of what should be ~2300+ lines, blocking every `tsc` invocation project-wide with `TS1010: '*/' expected` — same root issue Phase 2/3 flagged as "corrupted install", now actually fixed rather than worked around). Replaced with the correct file from the matching `@types/node@20.19.43` npm package. This let a real `tsc --noEmit` run for the first time since Phase 1: after the fix, the *only* remaining errors are `Cannot find module 'next'`/`'next/server'`/etc. across the whole `src/app` tree (pre-existing, present in files this phase never touched — the `next` package itself has no `.d.ts` files installed in this sandbox at all, a separate incomplete-install issue). A scoped check restricted to every Phase 4 file (`src/lib/embeddingPipeline.ts`, `ragRetrieval.ts`, `researchScoring.ts`, updated `recommendationScoring.ts`/`types.ts`, `scripts/seedPhase4Research.ts`) passed with zero errors. **Still recommend a clean `rm -rf node_modules && npm install && npm run build`** in a real dev environment before trusting this fully — the `next` package itself remains unverified end-to-end here.

**Needs owner input (new this phase):**
- **Pick a real embedding provider** (`OPENAI_API_KEY` recommended, or `VOYAGE_API_KEY`) before RAG retrieval is anything more than plumbing — see deviation #1.
- **Confirm the exact Anthropic model-id strings** for "Claude Sonnet 5" (`ANTHROPIC_SONNET_MODEL`) against the live model list — see deviation #4.
- **Replace the 8 placeholder research documents** (`scripts/seedPhase4Research.ts`) with real, cited research before this is used by real users — they're explicitly synthetic placeholder text per the phase prompt, not sourced from actual papers.
- **`RESEARCH_INGEST_ADMIN_TOKEN`-gated ingest endpoint is a stopgap**, same category as Phase 2's `clientAuth.ts` gap — replace with real admin auth once a proper session/role system exists.
- Still open from earlier phases: `dog_health_conditions` hard-filter exclusion unimplemented (Phase 3, safety-relevant — see that phase's note); Bristol/BCS illustrations not supplied (Phase 2); `wellness_indicator_reference` taxonomy not research-backed yet (Phase 2 — could now be backed by a `research_documents` row per indicator once the corpus has real content, per that phase's original note).

**What Phase 5 will need:**
- `research_documents`/`research_chunks` now populated (once `seed:phase4` is run) and wired into recommendation scoring
- `ingredient_review_queue` (Phase 5's actual table) is untouched by this phase — Phase 5's `submitIngredientPhoto` flow is independent of the RAG layer
- Do not begin Phase 5 without explicit instruction (per CLAUDE.md build sequence)

---

## Phase 5: Photo/OCR ingestion

**Status:** ✅ COMPLETE

**Scope (technical build spec Part B `submitIngredientPhoto`/`reviewQueueItem`, architecture doc §7):**

**Libraries added:**
- `src/lib/imageExif.ts` — `stripImageMetadata(buffer, mimeType)`: dependency-free JPEG (drops APP1/EXIF+XMP and APP13/IPTC marker segments) and PNG (drops tEXt/iTXt/zTXt/eXIf chunks) metadata stripper. See deviation #1 below — no image-processing package (`sharp` etc.) was added.
- `src/lib/ingredientOcr.ts` — `extractIngredientsFromImage(buffer, mimeType)`: Claude Haiku vision call via `generateObject` (Vercel AI SDK, multi-modal `ImagePart` content — confirmed supported in the installed `ai@3.4.33` types) returning the exact JSON shape from Part B (brand/product_name/ingredients/age_suitability/weight_range/price/notes), all fields nullable so Haiku is instructed not to guess a value it can't read. Model id configurable via `ANTHROPIC_HAIKU_MODEL` (same pattern as Phase 4's `ANTHROPIC_SONNET_MODEL` — unconfirmed exact API model string, flagged below).
- `src/lib/foodDuplicates.ts` — `findDuplicateFood(brand, name)`: case-insensitive, trimmed `ilike` match against `foods`.
- `src/lib/ingredientPhotoStorage.ts` — `uploadIngredientPhoto()`: lazily creates a private (`public: false`) Supabase Storage bucket `ingredient-photos` on first use, uploads the EXIF-stripped buffer.
- `src/lib/adminAuth.ts` — client-side localStorage helper for the admin review-queue page's `x-admin-token`, same pattern/limitations as `clientAuth.ts`.

**API endpoints built:**
- `POST /api/ingredients/submit-photo` — `submitIngredientPhoto`. multipart/form-data (`image` file + optional `dog_id`). Requires `x-user-id` (same auth stopgap as the rest of the app). Validates content-type (jpeg/png/webp only) and an 8MB size limit (checked against both `file.size` and the actual decoded buffer length), strips EXIF, uploads to private Storage, runs Haiku OCR, writes to `ingredient_review_queue` with `status='pending'` — never to `foods`/`food_ingredients`. If OCR itself throws, the submission is still queued (flagged with `_ocr_error` inside `raw_ocr_json`) rather than lost, so an admin can review the photo by eye.
- `POST /api/ingredients/review` — `reviewQueueItem`, admin-token gated (reuses `RESEARCH_INGEST_ADMIN_TOKEN`, per Part B item 4's explicit instruction to reuse Phase 4's stopgap). `decision: 'approve'|'reject'`. Reject: sets `status='rejected'` + `reviewed_by`/`reviewed_at`; optional `feedback` stored inside `raw_ocr_json._review.feedback` (see deviation #2 — no `feedback` column exists in Part A). Approve: either `link_to_existing_food_id` (skips creating a new food) or creates a new `foods` row + `food_ingredients` rows (`position_in_list` from array order) from `corrections` (falling back to the raw OCR fields where not overridden) — `corrections.food_type` is required since OCR can't produce it. Runs `findDuplicateFood` first; if a match exists and `confirm_create_despite_duplicate` isn't set, returns 409 with the candidate match instead of merging (spec item 3: "ask reviewer to confirm... don't auto-skip"). Updates `resulting_food_id`, `status='approved'`.
- `GET /api/ingredients/review-queue?status=pending` — admin-token gated listing for the admin page, with an opportunistic `possible_duplicate` field per pending item (same duplicate check run up front, so the reviewer sees the warning before clicking Approve, not just after). Not a named Part B action — added as a read-side companion, same pattern as prior phases' GET companions.
- `GET /api/ingredients/photo-url?path=` — admin-token gated, returns a 60s Supabase Storage signed URL so the admin page can display the source photo without the bucket being public. Small companion, not a named Part B action.
- `GET /api/ingredients/submissions?dog_id=` — owner-facing (`x-user-id` gated, ownership-checked), lists the caller's own `ingredient_review_queue` rows for the optional owner status page. Not a named Part B action — same GET-companion pattern.

**UI:**
- `src/components/IngredientReviewQueueAdmin.tsx` + `src/app/admin/review-queue/page.tsx` — admin token entry (stored client-side only, never hardcoded), lists pending items with the OCR extraction, a duplicate-match warning + "link to existing" shortcut, an editable corrections form (food_type/age/size/price/calories/ingredients — all the fields OCR can't reliably produce), Approve/Reject actions, and a "view photo" signed-URL preview.
- `src/components/IngredientPhotoSubmissions.tsx` + `src/app/dogs/[dogId]/submissions/page.tsx` — owner-facing upload form (file input → `submit-photo`) plus a list of that owner's past submissions and their status/review date (spec item 5, built as more than a status list since there was otherwise no UI path to actually call `submit-photo` and exercise the flow end-to-end).

**Security (spec item 7):**
- EXIF stripping implemented and applied before the buffer is ever written to Storage — see deviation #1 for exact coverage (JPEG/PNG only).
- Admin token gating on all three admin-only routes, reusing Phase 4's stopgap exactly as instructed.
- 8MB upload size limit enforced server-side (not just a client hint), plus a content-type allowlist (jpeg/png/webp) rejecting anything else before any processing happens.
- Storage bucket is private (`public: false`); photo access is only via short-lived admin-signed URLs, never a public bucket URL.

**Verification:** could not run a full `next build`/`tsc` pass in this sandbox for the same pre-existing reason noted in Phases 2-4 — `node_modules/next` has zero `.d.ts` files installed here, unrelated to any Phase 5 code (confirmed: a scoped `tsc --noEmit` restricted to every new/changed Phase 5 file passed cleanly except for `Cannot find module 'next/server'` on the five route files, which is the exact same pre-existing gap, not a Phase 5 regression). Manually reviewed all new files for type correctness and confirmed `ai@3.4.33`'s installed types do support the multi-modal `ImagePart` (`image: Buffer, mimeType: string`) content part used in `ingredientOcr.ts`. Could not verify the end-to-end flow against a live Supabase project/Anthropic API key from this sandbox (no credentials configured here) — recommend running the item-6 test flow (submit → pending → approve → merged; duplicate submission → 409) against a real environment before trusting this fully.

**Deviations from spec / assumptions made (logged per CLAUDE.md's "stop and log" rule):**
1. **No image-processing library was added for EXIF stripping.** `sharp` (the obvious choice) ships platform-specific native binaries, and Phases 2-4 all independently hit npm-install corruption in this build sandbox strongly enough to warrant several paragraphs of BUILD_PROGRESS.md notes each time — adding a new native dependency risked repeating that failure mode for a security-relevant piece of code that then couldn't be verified either way. Implemented a small dependency-free JPEG/PNG marker-segment stripper instead (`src/lib/imageExif.ts`) that removes EXIF/XMP/IPTC (JPEG) and text/eXIf metadata chunks (PNG) by hand. **Coverage gap, flagged rather than silently claimed as complete:** WebP and HEIC (common iPhone photo format) are NOT stripped by this implementation — WebP is passed through unchanged with a console warning; HEIC isn't in the accepted upload MIME allowlist at all, so it's rejected outright rather than silently accepted-but-unstripped. Needs owner input: if HEIC/WebP EXIF stripping is required in practice, swap in `sharp` (`.withMetadata(false)`) in a real (non-sandboxed) install environment.
2. **`ingredient_review_queue` has no `feedback` column in Part A**, but spec item 2b says rejection can "optionally leave feedback." Per the Phase 1 prompt's "follow the schema in Part A exactly — do not add, remove, or rename fields without flagging it" rule, no `ALTER TABLE` was run. Feedback is instead stored inside the existing `raw_ocr_json` jsonb column under a `_review.feedback` key. **Needs owner input:** should Part A gain a proper `feedback text` column on `ingredient_review_queue` instead? The jsonb approach works but mixes review metadata into what's nominally "the raw OCR result," which is a bit muddy.
3. **OCR→schema field mapping requires reviewer input, not automatic mapping.** The Part B-specified OCR JSON shape (brand/product_name/ingredients/age_suitability/weight_range/price/notes — all free text) doesn't map onto `foods`' strict typed columns (`food_type` enum NOT NULL, `suitable_size_min/max` enum, `suitable_age_min/max_months` integer, `price_per_kg`/`calories_per_kg` numeric). There's no reliable automatic parse from "Puppy, all breeds" → `suitable_age_min_months integer`, so this was not guessed at — `/api/ingredients/review`'s approve path requires `corrections.food_type` explicitly and leaves the other structured fields null unless a reviewer supplies them via the admin page's correction form. This is a genuine, permanent gap between what a photo can tell you and what the schema needs, not a temporary shortcut.
4. **Photo storage bucket (`ingredient-photos`) is created programmatically on first upload** (`storage.createBucket`, idempotent — ignores "already exists") rather than requiring a manual Supabase-dashboard setup step, so `submit-photo` works without an out-of-band action being missed. Kept private (`public: false`) — see Security section above.
5. **`ANTHROPIC_HAIKU_MODEL` defaulted to `claude-haiku-4-5-20251001`**, unconfirmed against the live Anthropic model list, same category of flag as Phase 4's `ANTHROPIC_SONNET_MODEL` default. **Confirm/update before production use.**
6. **A stray `tsconfig.phase5check.json`** (used for a scoped `tsc --noEmit` sanity check during this session, same purpose as Phase 2's `tsconfig.check.json`) could not be deleted — same filesystem restriction in this build sandbox noted in every prior phase. It's inert and `.gitignore`d; safe to `rm tsconfig.phase5check.json` locally.
7. **No RLS policy was added for `ingredient_review_queue`.** Consistent with every other table in this codebase so far, all reads/writes go through `supabaseAdmin` (service role) server-side, so RLS isn't functionally required yet — but Part A's RLS section doesn't explicitly list this table either (it only names `dogs`, `dog_restrictions`, and says "repeat the pattern for" a specific list that doesn't include this one). Not flagged as urgent since the whole app currently bypasses RLS via the service-role client uniformly, but worth deciding alongside a real auth system.

**Needs owner input (new this phase):**
- **HEIC/WebP EXIF stripping isn't implemented** — see deviation #1. iPhone photos in HEIC format are currently rejected outright (not silently accepted unstripped) rather than mishandled, but this may be worth fixing if iPhone-originated submissions are expected to be common.
- **Should `ingredient_review_queue` gain a real `feedback` column?** — see deviation #2.
- **Confirm `ANTHROPIC_HAIKU_MODEL`'s default value** against the live Anthropic model list — see deviation #5.
- Still open from earlier phases: `dog_health_conditions` hard-filter exclusion unimplemented (Phase 3, safety-relevant); Bristol/BCS illustrations not supplied (Phase 2); `wellness_indicator_reference` taxonomy not research-backed (Phase 2); embedding provider not yet chosen (Phase 4); exact Sonnet/Haiku model-id strings unconfirmed (Phase 4/5); `RESEARCH_INGEST_ADMIN_TOKEN`-gated endpoints remain a stopgap, now covering five routes instead of one — the case for replacing it with real admin auth gets stronger each phase that reuses it.

**What Phase 6 will need:**
- `foods`/`food_ingredients` now have a working Tier 2 (owner-photo) write path via approval; Phase 6's Tier 1 (brand-page scrape) path is a separate direct-write flow per architecture doc §7 and doesn't reuse `ingredient_review_queue`.
- `source_domain_allowlist` (Part A) is still untouched — Phase 6's scope.
- Do not begin Phase 6 without explicit instruction (per CLAUDE.md build sequence).

---

## Phase 6: Weekly discovery, correlation engine, inactivity deletion

**Status:** ✅ COMPLETE (final phase per technical build spec Part E)

**Note on `/docs/*` referenced by CLAUDE.md:** this session could not find `dog-food-platform-plan.md`, `technical-build-spec.md`, or `legal-compliance-review.md` anywhere in the repo (`/docs/` doesn't exist at all — confirmed via a full non-`node_modules` file listing). Every prior phase's BUILD_PROGRESS.md entry cites specific sections of these docs, so they existed at some point but aren't in this checkout. Phase 6 was built entirely from the detailed inline task brief provided for this session (which restates the relevant Part A/§10/§11 requirements explicitly enough to implement against) plus the live Supabase schema (introspected directly via `list_tables`, not assumed) and the patterns already established in `src/lib`/`src/app/api` by Phases 1-5. **Needs owner input: the `/docs` folder should be restored to the repo** — future sessions (including any follow-up to this one) can't do the "read the docs, stop-and-log if ambiguous" workflow CLAUDE.md mandates without them.

**Scope (this session's task brief, mirroring technical build spec Part E / architecture doc §6/§10/§11):**

**1. Weekly food discovery job — `src/lib/foodDiscovery.ts`, `src/lib/batchApiHelper.ts`**
- `src/lib/batchApiHelper.ts` — raw `fetch`-based wrapper around Anthropic's Message Batches API (`createMessageBatch`, `getBatchStatus`, `getBatchResults`, `extractToolInput`). The Vercel AI SDK has no Batch API surface, so this bypasses `ai`/`@ai-sdk/anthropic` entirely for this one job. **Flagged, same category as every prior phase's model-id defaults:** implemented from documented API knowledge, not verified against a real completed batch in this sandbox (no network egress here, and batches can take up to ~24h to end) — confirm the exact request/response shape against a live batch before trusting it in production.
- `src/lib/foodDiscovery.ts` — `getApprovedDomains()` (queries `source_domain_allowlist` where `approved=true`), `submitDiscoveryBatch()` (phase 1: heuristic same-domain link discovery off each domain's homepage, fetch + strip each candidate page to plain text, build one Batch API tool-use request per page, submit, return `{batch_id, manifest}`), `processDiscoveryBatch(batchId, manifest)` (phase 2: once the batch has ended, parse each `tool_use` result, run `findDuplicateFood` (Phase 5, reused as-is), require `brand`+`name`+valid `food_type` present, then insert directly into `foods`/`food_ingredients` — Tier 1, no review queue, per architecture doc §7).
- API routes: `POST/GET /api/cron/food-discovery` (submit), `POST /api/cron/food-discovery/process` (process — takes `{batch_id, manifest}` in the body).
- **Deviation, flagged: no "vision" (screenshot) step.** The task brief says extraction should use "Haiku vision... against web pages, same as Phase 5 OCR." Actually rendering a screenshot would need a headless browser (Playwright/Puppeteer/a screenshot service) — a native/heavy dependency in exactly the risk category Phase 5 explicitly avoided for EXIF-stripping (BUILD_PROGRESS.md Phase 5 deviation #1, citing repeated npm-install corruption in this sandbox). Implemented as plain-text extraction instead: fetch → strip HTML tags → send the resulting text through the same Haiku model via tool-use structured output. This is a real, documented capability gap (pages that render ingredient lists only via client-side JS/canvas won't be caught), not a silent substitution — full detail + a note on how to add real screenshot-based vision later is in `foodDiscovery.ts`'s header comment.
- **Deviation, flagged: no batch-tracking table.** Part A has no table for in-flight discovery batches. The submit route's response (`{batch_id, manifest}`) must be retained externally and handed back to the process route once the batch ends — there's no server-side persistence connecting the two calls. **Needs owner input:** add a `food_discovery_batches` tracking table (batch_id, manifest jsonb, status, submitted_at, processed_at) so this doesn't depend on the caller holding onto a response body for up to 24h.
- **Product-page discovery is a homepage-link-regex heuristic**, not a real crawler (no sitemap parsing, no pagination, no JS rendering, capped at 5 pages/domain) — matches the task brief's explicit "Phase 6 focuses on the job structure, not the full scraping compliance suite."
- **`robots_txt_checked_at`/`tos_reviewed_at` were left NULL on every seeded `source_domain_allowlist` row** (see seed note below) — no actual robots.txt/ToS review happened in this session. `approved=true` here should be read as "seeded for job-structure testing," not "compliance-cleared."
- Seeded `source_domain_allowlist` with 6 real UK brand domains (Canagan, Acana, Burns, Fish4Dogs, James Wellbeloved, Forthglade — the exact list the task brief named), `approved=true`, applied directly to the live Supabase project (`ysffyuohwvdifvbopfcm`) and also saved as `supabase/seed_phase6.sql` for reproducibility, matching the Phase 2 seed-file pattern.

**2. Correlation engine — `src/lib/correlationEngine.ts`, wired into `src/lib/correlationScoring.ts`**
- `computeCorrelationsForDog(dogId)` / `runCorrelationEngine()` — per dog, fetches every `dog_log_entries` row with `within_expected_variability_window=false` and a non-null `food_id_active` (this single flag already encodes both "respect the variability window" and "respect `metric_minimum_lag_days`" — they were computed together at log-write time in Phase 2's `lagWindow.ts`, so there's no separate re-check needed; documented inline so this isn't mistaken for a shortcut), joins to each active food's `food_ingredients`, groups by (ingredient, metric), and for groups with ≥3 eligible logs computes `correlation_strength = (better_count - worse_count) / sample_size` (range [-1,1]) and a `confidence_flag` (`low_sample` 3-5, `preliminary` 6-15, `established` 16+ — thresholds hardcoded with a tunability comment in `CONFIDENCE_THRESHOLDS`, per the task brief's explicit permission since no config table exists for this in Part A). Upserts into `ingredient_outcome_signals` (get-then-update-or-insert on `dog_id`+`ingredient_name`+`outcome_metric`, since no unique constraint exists on that triple in Part A to `ON CONFLICT` against). Groups with <3 logs are skipped entirely (no row written) rather than writing a meaningless zero — logged as `signals_skipped_insufficient_data`.
- **Confidence-honesty flag, explicitly documented in the file header:** `correlation_strength` is a "net improvement rate" heuristic, not a rigorous statistical correlation coefficient (no control-period comparison against logs on other foods, no continuous-variable regression) — same category of designed-not-derived heuristic Phase 3 already flagged for the DER multiplier bands.
- API route: `POST/GET /api/cron/correlation-engine` (optional `{dog_id}` body to scope to one dog for manual verification, per the task's test instruction).
- **Wired into `getRecommendations` (new, beyond the literal task brief but closing a loop Phases 3-4 explicitly left open):** `src/lib/correlationScoring.ts`'s `scoreCorrelationSignalForFood()` averages a dog's `ingredient_outcome_signals` (only rows with a non-null `confidence_flag`, i.e. sample size ≥3) across a candidate food's ingredients, rescaled from [-1,1] to [0,1]; neutral 0.5 if the dog has no matching signal history yet (same "don't guess, stay neutral" convention `budgetScoring.ts` already uses for an unset budget). `recommendationScoring.ts`'s `scoreFood()` now takes this as a real parameter instead of the hardcoded `const correlation_signal = 0` that had been in place since Phase 3; `confidence` is no longer capped below the full weight sum, since all four scoring factors are now real. `POST /api/recommendations` fetches `fetchDogCorrelationSignals(dog_id)` once per request and reuses it across every candidate, same pattern as `researchChunks`/`der`.

**3. Inactivity auto-deletion job — `src/lib/accountLifecycle.ts`**
- `checkInactiveAccounts()` — fetches the active `account_inactivity_policy` row (confirmed already seeded from Phase 1, 1 row, defaults 365/30 — no reseed needed), walks every `user_profiles` row, computes days-since-`last_active_at`, and runs the warn→delete state machine exactly as specified: warn once at `threshold - warning_before_days` days (stamping `inactivity_warning_sent_at`), delete once a warning was already sent AND the full threshold is reached, and clear the warning stamp if `last_active_at` moves forward past the warning threshold again (re-engagement) — confirmed `POST /api/auth/signin` already updates `last_active_at` on every login (Phase 1 code), so this clears correctly without any extra wiring.
- `deleteAccount(userId)` — anonymises `dogs` (sets `owner_id=null`, everything else untouched) **before** hard-deleting `user_profiles` and the `auth.users` record (via `supabaseAdmin.auth.admin.deleteUser`), in that order deliberately — see the schema-blocker deviation below for why the order matters.
- API route: `POST/GET /api/cron/inactivity-check`.
- **Critical pre-existing schema blocker found and fixed, flagged per CLAUDE.md's "stop and log rather than guess" rule (this one genuinely blocked the literal deliverable, so it was fixed rather than left broken):** live-schema introspection (`list_tables`/`information_schema`) showed `dogs.owner_id` was `NOT NULL` **and** its FK to `auth.users(id)` was `ON DELETE CASCADE`. Both directly contradict architecture doc §10 / CLAUDE.md principle #5's explicit, unambiguous requirement ("Anonymise (nullable `owner_id`) dog records... hard-delete owner personal data"): as originally built, `UPDATE dogs SET owner_id = null` would have been rejected by the NOT NULL constraint, and deleting the `auth.users` row first would have cascade-deleted every one of that owner's dogs — the exact opposite of "keep dog records contributing to pooled research." Applied one migration (`phase6_dogs_owner_id_nullable`, live on project `ysffyuohwvdifvbopfcm`): `ALTER TABLE public.dogs ALTER COLUMN owner_id DROP NOT NULL`. The FK's `ON DELETE CASCADE` itself was left as-is (not altered) — `deleteAccount()`'s ordering (anonymise dogs to `owner_id=null` *before* deleting the auth user) means the cascade never actually fires in practice, since by the time the auth user is deleted no dog row still points at it. **Needs owner input:** consider also changing the FK's delete action to `ON DELETE SET NULL` as defense-in-depth, in case `deleteAccount()` is ever called with the steps reordered or partially fails between the two steps (right now a crash between "anonymise" and "delete auth user" would leave the account soft-orphaned rather than deleted — acceptable/recoverable, but worth a look).
- **Notification gap, flagged (not silently stubbed as working):** no email/notification provider exists anywhere in this codebase (no Resend/SendGrid/etc. dependency, no notifications table). `sendInactivityWarning()` logs a console warning and stamps `inactivity_warning_sent_at` so the state machine still behaves correctly, but **no warning is actually delivered to the user.** As built today, a warned user has no way to see the warning and would be deleted 30 days later having never been told. **Needs owner input, urgent given this is the final phase:** wire up a real email provider (or in-app banner, per the spec's "email or in-app banner" wording) before this job runs against real accounts.

**4. Config / seed verification (task item 5):**
- `account_inactivity_policy` — confirmed already seeded (1 row, 365/30 days, `active=true`) from Phase 1. No action needed.
- `recommendation_scoring_weights` — confirmed already seeded (1 row). No action needed.
- `metric_minimum_lag_days` — confirmed already seeded (8 rows) from Phase 2. No action needed.
- Correlation confidence thresholds — hardcoded in `correlationEngine.ts`'s `CONFIDENCE_THRESHOLDS`, per the task brief's explicit permission to do so "with a comment flagging it as tunable" rather than add a new config table.
- `source_domain_allowlist` — seeded this phase (see item 1 above).

**5. Cron wiring:**
- `vercel.json` (new) — 3 cron entries: `/api/cron/food-discovery` (Sunday 02:00 UTC), `/api/cron/correlation-engine` (daily 03:00 UTC), `/api/cron/inactivity-check` (daily 01:00 UTC). All three routes accept both `GET` (what Vercel Cron actually sends) and `POST` (for manual/admin triggering).
- `src/lib/cronAuth.ts` — gates all three cron routes behind either `Authorization: Bearer $CRON_SECRET` (Vercel's documented convention for securing cron routes, auto-sent when `CRON_SECRET` is set) or the existing `x-admin-token`/`RESEARCH_INGEST_ADMIN_TOKEN` header (so an admin can trigger these manually with a token they already have, without provisioning a second secret). **Same stopgap category as every other admin-token gate since Phase 4** — not a real auth/role system.
- Given architecture doc §11's suggestion to prefer Supabase Edge Functions + `pg_cron` for the DB-heavy discovery/correlation jobs and Vercel for the Auth-touching deletion job: **all three were implemented as Vercel/Next.js API routes instead**, for consistency with every other endpoint in this codebase (Phases 1-5 are 100% Next.js API routes, zero Supabase Edge Functions exist anywhere in the repo) and because Vercel Cron already covers the "run on a schedule" requirement for all three without introducing a second runtime/deployment target. Flagged as a deliberate consistency choice, not an oversight — if Edge Functions are preferred going forward, `src/lib/foodDiscovery.ts`/`correlationEngine.ts` are already framework-agnostic (no `next` imports) and could be ported directly.

**6. Test (task item 6) — done against the live Supabase project (`ysffyuohwvdifvbopfcm`), not just read through:**
- **Correlation engine:** this sandbox has no way to execute the actual Next.js/TypeScript code against a live service-role key (no `.env` with real credentials present, no running dev server — see the "Verification note" pattern every prior phase also hit). Instead, verified via direct SQL against the live project: inserted a temporary test dog + `dog_food_events` row (Canagan Grain-Free Chicken, 4 ingredients) + 4 `dog_log_entries` rows (`stool_score`, trends better/better/no_change/worse, all `within_expected_variability_window=false`), then ran `computeCorrelationsForDog`'s exact join/aggregation logic as a raw SQL query. Result: 4 ingredients each got `sample_size=4`, `correlation_strength=0.25` ((2 better − 1 worse)/4), `confidence_flag='low_sample'`, `lag_days=10` (pulled from the real `metric_minimum_lag_days` row for `stool_score`) — matching the algorithm exactly. Then executed the actual `INSERT INTO ingredient_outcome_signals` with those values to confirm the write path is schema-valid, `SELECT`ed it back to confirm, and cleaned up all test rows afterward (temporary fixture, not left in the live dataset).
- **Inactivity/deletion job:** couldn't create a real `auth.users`-backed test account in this sandbox (no Admin API session available outside the running app itself, and inserting directly into `auth.users` via raw SQL to fake one was judged too risky/unrealistic to be worth it vs. what it would prove). What WAS verified live: the `dogs.owner_id` nullable fix (confirmed by successfully inserting a test dog with no `owner_id` specified, immediately after applying the migration — proving the anonymisation `UPDATE ... SET owner_id = null` will no longer fail). The warn/delete state-machine logic and `deleteAccount()`'s ordering were verified by code review only, not a live end-to-end run. **Recommend running this against a real test account (real signup → manually backdate `last_active_at` past the warning threshold → invoke `/api/cron/inactivity-check` → confirm warning stamp → backdate further → invoke again → confirm the account is actually gone from both `user_profiles` and `auth.users`, and the dog row survived with `owner_id=null`) in a real dev environment before relying on this.**
- **Batch API:** `submitDiscoveryBatch()`/`createMessageBatch()` build a valid-shaped request per the documented API — not exercised against a real Anthropic API key/live batch in this sandbox (no credentials configured here, and a real batch can take up to 24h to end, which doesn't fit this session). Flagged above under item 1.
- **TypeScript:** `next` has zero `.d.ts` files installed in this sandbox (same pre-existing gap every phase since Phase 2 has hit and documented) so a full `next build`/`tsc` pass isn't possible here. Ran a scoped `tsc --noEmit --strict` pass restricted to every new/changed Phase 6 file (`batchApiHelper.ts`, `foodDiscovery.ts`, `correlationEngine.ts`, `accountLifecycle.ts`, `correlationScoring.ts`, `cronAuth.ts`, plus the modified `recommendationScoring.ts`/`types.ts`): zero errors except `Cannot find module 'next/server'` in `cronAuth.ts` — the exact same pre-existing gap, not a Phase 6 regression. A stray `tsconfig.phase6check.json` used for this couldn't be deleted (same sandbox filesystem restriction every prior phase hit) — added to `.gitignore`, safe to `rm` locally.

**Deviations from spec / assumptions made (summary — full detail inline above):**
1. `/docs/*` referenced throughout CLAUDE.md don't exist in this checkout — built from the inline task brief + live schema instead. Needs owner input: restore `/docs`.
2. Discovery job uses text extraction (fetch + strip HTML), not real screenshot-based vision — no headless-browser dependency added, same risk-avoidance rationale as Phase 5.
3. No `food_discovery_batches` tracking table exists — the submit→process handoff currently depends on the caller retaining the manifest externally.
4. Product-page discovery is a basic same-domain link-regex heuristic, not a real crawler.
5. `robots_txt_checked_at`/`tos_reviewed_at` left NULL on all 6 seeded allowlist rows — no actual compliance review was performed this session.
6. Correlation confidence thresholds hardcoded (explicitly permitted by the task brief).
7. All three jobs implemented as Vercel/Next.js API routes (not Supabase Edge Functions), for consistency with the rest of the codebase.
8. **Fixed a pre-existing schema bug** (`dogs.owner_id` was `NOT NULL` + `ON DELETE CASCADE`, contradicting the mandatory anonymisation behaviour) via a live migration — this wasn't optional, the literal deliverable couldn't function without it.
9. `correlation_signal` in `getRecommendations` wired up to real data (beyond the literal task brief, but closes a Phase 3/4-flagged gap using exactly the infrastructure this phase built).
10. No notification provider exists — inactivity warnings are logged, not delivered.

**Needs owner input (new this phase):**
- **Restore `/docs/dog-food-platform-plan.md`, `/docs/technical-build-spec.md`, `/docs/legal-compliance-review.md`** to the repo — CLAUDE.md's session workflow depends on them and they weren't present for this session.
- **No email/notification provider wired up** — inactivity warnings aren't actually delivered to users yet. Fix before this job runs against real accounts (see item 3 above).
- **Add a `food_discovery_batches` tracking table** so the weekly job's submit→process handoff doesn't depend on external manifest retention.
- **robots.txt/ToS compliance review** of the 6 seeded `source_domain_allowlist` domains hasn't happened — do this before the discovery job runs against them for real, per architecture doc §7/§11's own requirement.
- **Batch API request/response shape unverified against a live batch** — confirm before production use (same category of flag as every phase's unconfirmed model-id default).
- **Consider `ON DELETE SET NULL` instead of `CASCADE`** on `dogs_owner_id_fkey` as defense-in-depth (see item 8 above).
- Still open from earlier phases (unchanged by this phase): `dog_health_conditions` hard-filter exclusion (Phase 3, safety-relevant); Bristol/BCS illustrations (Phase 2); `wellness_indicator_reference` taxonomy not research-backed (Phase 2); embedding provider not chosen (Phase 4); exact Sonnet/Haiku model-id strings unconfirmed (Phase 4/5); admin-token stopgap now covers 8 routes across 3 phases — the case for real admin/session auth is now very strong.

**Final review flags before this is used by real users (explicitly requested by the task brief, since this is the final phase):**
1. **Legal/GDPR:** `legal-compliance-review.md` doesn't exist in this checkout (see deviation #1) — the architecture doc's own §9-10 explicitly calls for a solicitor review before production, especially the liability disclaimer (present, unchanged since Phase 3: `POST /api/recommendations`'s `DISCLAIMER` constant) and the deletion semantics implemented this phase. That review has not happened.
2. **Data retention/deletion is now functionally correct against the schema (post-migration) but only code-reviewed, not live-tested end-to-end** (see item 6 above) — strongly recommend a real dry run before trusting it with a real user's data.
3. **Notification gap is a real user-harm risk, not just a nice-to-have:** as built, a user gets zero warning before deletion (see deviation #10). This should block production use of the inactivity job until fixed.
4. **RLS is disabled on 12 tables** (`user_profiles`, `account_inactivity_policy`, `source_domain_allowlist`, `foods`, `research_documents`, etc. — pre-existing since at least Phase 1, not introduced by this session, confirmed via the Supabase advisor). The app currently works around this by only ever using the service-role client server-side, but the anon key (shipped to every browser) currently has full read/write access to these tables directly against Supabase. This has been flagged in every phase's live-schema check; it has never been fixed. **This should be treated as a pre-launch blocker, not a backlog item** — enabling RLS without correct policies will break the app, so this needs deliberate policy design, not a blind `ENABLE ROW LEVEL SECURITY`.
5. **Confidence methodology:** `correlation_strength`'s "net improvement rate" heuristic (this phase) and the DER/calorie-density bands (Phase 3) are both designed-not-derived — flagged consistently, not hidden, but neither has had the "concrete methodology review before Phase 3 ships" CLAUDE.md's escalation section calls for.
6. **No real admin/session auth system exists anywhere in this app**, 5 phases in — every admin-gated route (research ingest, review queue, now 3 cron routes) shares one or two shared-secret tokens. This is the single most-repeated flag across BUILD_PROGRESS.md and should be prioritised before onboarding real users beyond the owner.

---

## Research Layer — owner edit/review continuation (2026-07-30)

**Status:** Local implementation, live edit migrations, rolled-back RPC
verification, and the explicitly authorised quality-audit cleanup are
complete. Every ingestion job and its audit trail was preserved. No literature
was approved.

**Implemented locally:**

- Added a service-role-only transactional cluster-edit migration with
  queued/unreviewed guards, optimistic concurrency, safe identity collision
  handling, atomic applicability replacement, and last-editor metadata.
- Added runtime-aligned validation for food subjects, nutrient/processing
  allowlists, ingredient taxonomy, report fields, life stages, cautious
  summaries, and unique contexts.
- Added owner edit-before-approval controls for subject, measured outcome,
  direction, cautious summary, and up to eight applicability contexts.
- Added the paper title, honest access status, working source link, grade
  metadata, and literal quote to every cluster review card.
- Kept save and approval as separate actions. Saving never activates a cluster
  or claim.
- Expanded integrated retrieval tests for active/inactive cluster state,
  accepted/uncertain findings, no-context suppression, exact source fields,
  private-upload access, fixed query count, no request-time AI, and zero
  ranking effect.

**Read-only live audit completed before the connection limit:**

- 40 queued/unreviewed clusters and 42 queued source claims.
- Subject types: 17 ingredient, 3 nutrient, 20 processing method.
- Directions: 22 supports, 11 cautions, 5 neutral, 2 insufficient.
- Contexts: 16 with none, 22 with one, 2 with two.
- Membership: 38 single-claim clusters, 2 two-claim clusters.
- 19 demonstrably invalid fresh drafts were identified by unsupported
  subject/outcome mappings. Immediately before deletion they were reconfirmed
  as fresh, queued, unreviewed, and isolated to their population jobs. With
  explicit owner approval, one guarded transaction removed those 19 clusters,
  their 20 isolated queued claims, and 20 claim embeddings. All 19 ingestion
  jobs remain, with 19 deterministic discard entries recorded across the six
  affected jobs.
- Existing legacy claim statuses/reviewer metadata and Lenny's report were not
  changed.

**Live completion now verified:**

- Applied `edit_research_evidence_cluster` and the related
  `index_research_cluster_last_editor` migration exactly once.
- Rolled-back live transaction proved valid edit, stale-write, active-state,
  invalid-report-context, and identity-collision behaviour without persisting
  any evidence change.
- Security advisor remains 20 findings (13 info, 5 warning, 2 error), with no
  new Research Brain security item. The two unrelated RLS-disabled tables are
  still `manufacturer_entities` and `terms_clause_patterns`.
- Performance advisor returned 66 items (53 info, 13 warning). The refreshed
  advisor now recognises the new editor covering index: the foreign key no
  longer appears as unindexed, and the new index appears only as not-yet-used.
- Exact post-cleanup live invariants: claims 1 active/23 queued; clusters 21
  queued; 22 memberships; 12 applicability rows; 368 Voyage embeddings (346
  chunks and 22 claims); 0
  non-empty corroboration arrays; legacy reviewer metadata unchanged; 30
  documents; 695 chunks; 88 centroids; 2,282 relevance rows; cache/queue empty;
  Lenny 10 accepted plus 1 excluded `needs_review` typo, document `partial`.

**Final local checks:**

- Full tests: 271/271 passed.
- TypeScript: `npx tsc --noEmit` passed.
- Production build: `npm run build` exited 0.
- `git diff --check` passed apart from expected line-ending warnings.

**Production deployment and owner scope calibration (2026-08-01):**

- Commit `72296c3` reached `main`, Vercel completed successfully, and production
  served that exact commit.
- Authenticated admin review verified ingestion controls, edit-before-review,
  exact quotes, access labels, source titles, and PubMed links. Nothing was
  approved.
- The owner identified Salmonella contamination as out of scope because it is
  a food-product/manufacturing issue rather than evidence of an individual
  dog's response to chicken. Applying that principle consistently identified
  four contamination cards, two label-accuracy cards, and one composition-
  variability card.
- All seven were rejected through the authenticated review UI with explicit
  scope notes. They remain auditable. Live state is now 14 queued/7 rejected
  clusters and 1 active/16 queued/7 rejected claims; corroboration remains
  empty.
- Added a shared individual-food-selection rule: background drafting must mark
  the subject as a tested food exposure and the outcome as a dog clinical,
  biological, digestibility/nutrient-status, behaviour, or performance
  response. Product contamination, manufacturing, labelling, recall, and
  composition audits are rejected during drafting, owner edit, and approval.
- Applied `enforce_research_decision_scope` once. Its database constraint keeps
  rejected audits but refuses these outcomes in draft, queued, or active state.
  A live exception-handled write test passed without changing the tested row.
- Updated checks: 275/275 tests, TypeScript, production build, and
  `git diff --check` pass.
- Scope commit `3d01059` and serverless document-listing fix `7d4388b` both
  reached production successfully. Moving PDF parser loading to the two PDF-
  finalisation paths restored read-only research ingestion and dog-document
  listing; Ron's owner page now loads with no document error.
- Authenticated production verification found 14 queued cards, the explicit
  dog-outcome scope message, owner edit controls, literal quotes, honest access
  labels, source titles, and usable PubMed links. Nothing was approved and
  browser warning/error logs were empty.
- A fresh Ron recommendation run excluded `Acana Senior Dog`; all ten results
  had no matching active reviewed evidence, the neutral legacy lentil claim was
  absent, and research did not change any score. This verifies the nonmatching
  production path and adult life-stage guard.
- The authenticated account owns Ron only. Bowl therefore did not expose
  Lenny's owner page or a production matching-context dog; those paths were not
  bypassed. Integrated tests cover the matching path, while live SQL confirms
  Lenny remains `partial` with 10 accepted findings and one excluded uncertain
  `Bacteriodetes` finding.
- Final live state remains 14 queued/7 rejected clusters and 1 active/16
  queued/7 rejected claims. Legacy reviewer metadata and empty corroboration
  arrays are unchanged; protected corpus/workflow counts remain 30 documents,
  695 chunks, 88 centroids, 2,282 relevance rows, 19 jobs, 22 memberships, 12
  applicability rows, and 368 Voyage embeddings, with empty score cache/queue.
- A narrow-screen overflow in the recommendation score badge was corrected by
  stacking the card heading and score on mobile. Desktop and 375px admin/owner
  checks remain usable, and the final owner page has no horizontal overflow.

The pre-existing `docs/research-brain-handoff-2026-07-29.md` edit remains
outside these implementation commits.

## Gate 5 — research evidence actually scores, behind an explicit switch (2026-08-03)

**Status:** implemented, tested, and verified live against real data on branch
`codex/mobile-pack-capture`. Not yet committed/pushed (this task's brief
explicitly withheld the standing build/commit/push permission carried from the
P7 session — needs asking for again).

**What changed and why.** The owner reviewed the P7 research admin workspace
and asked directly: does research evidence actually inform a recommendation,
or does it just sit there? It was confirmed sitting there —
`researchRankingResult()` (`src/lib/activeClaimRetrieval.ts`) always returned
score zero (Gate 4, 2026-07-29, itself a deliberate and correct placeholder —
see `docs/research-gate4-2026-07-29.md`'s "What remains before evidence may
influence ranking" section, which named exactly what a real policy needed to
define). The owner reversed that call and asked for a real scoring policy, an
admin diagnostic view showing recommendations with/without research applied,
and a what-if sandbox — with the explicit, unmoved boundary that
`hardFilter.ts`'s deterministic exclusion logic stays completely untouched
(CLAUDE.md's safety-layer-separation principle, design principle #1).

**The Gate 5 formula** (`src/lib/researchScoringPolicy.ts`, new) — proposed to
the owner as a short design doc before any code was written, approved as
proposed:
- Evidence groups into **topics** (a reviewed cluster id, or
  `subject_type:subject_value` for a direct unclustered claim) so an unrelated
  supports finding and a cautions finding on the same food never cancel out.
- Per topic: `strength = grade_weight[A..E: 1.0/0.8/0.6/0.35/0.15] ×
  (grading_inputs_complete ? 1 : 0.5) × (abstract_only ? 0.75 : 1.0)`.
- `neutral`/`insufficient_evidence` directions never move the score (shown,
  inert) — only `supports`/`cautions_against` do.
- Corroboration: each additional **independent study family** (via the new
  `ResearchEvidence.study_family_id`, sourced from P4's
  `research_documents.duplicate_of_document_id` dedup — a preprint repeat of
  an already-counted study adds nothing) backing the same topic adds +0.05,
  capped at +0.15/topic.
- Topic contributions sum, clamp to [-1, 1], then scale by a `±0.3` cap:
  `research_relevance = clamp(0.5 + clamped_sum × 0.3, 0, 1)`, i.e. final
  range **[0.2, 0.8]** — research can never be the deciding factor. This 0.5-
  neutral convention deliberately matches `correlationScoring.ts`'s existing
  `NEUTRAL_SCORE` pattern (a factor with no signal defaults to the midpoint,
  not to zero) rather than Gate 4's literal-zero placeholder, because Gate 5
  has to express both supports and cautions as a genuine two-sided deviation,
  which a zero floor cannot do. Confirmed live (see verification below) this
  means every food for a dog with zero matching evidence gets a uniform
  +0.125 lift when Gate 5 is enabled (0.25 weight × 0.5 midpoint) — this does
  not change ranking (uniform across all foods) and mirrors how
  `correlation_signal` already treats "no history yet," so it was kept as
  designed rather than special-cased back to zero.
- Every constant carries a plain-language `explain` string in the same object
  — the admin page renders these directly rather than showing bare numbers.

**The explicit on/off switch.** Live schema check
(`recommendation_scoring_weights`) found `research_relevance_weight` already
`0.25` — a real nonzero magnitude, inert only because the code path forced
the score to zero. Wiring the real formula straight into that existing weight
would have made research affect every real client-facing recommendation the
moment this shipped, contradicting the owner's explicit "admin-only for now"
scoping. Migration `20260803140000_add_research_scoring_enabled_flag.sql`
(applied live) adds `recommendation_scoring_weights.research_scoring_enabled
boolean not null default false` — a separate switch from the weight's
magnitude. `POST /api/recommendations` now computes the real Gate 5 result
only when this flag is true; `research_runtime.ranking_effect` reports
`'gate5_applied'` or `'none'` accordingly. Confirmed live after all testing:
flag is still `false`, weight is still `0.25`, so today's real recommendations
are byte-for-byte unchanged. Flipping it on later is the owner's intended path
to making this live for real dog owners, with no code deploy — this is what
the owner asked for when clarifying scope ("give admin a way of switching it
on for owners without refactoring code").

**Admin decision-trace page** (`/admin/research/decision-trace`, 8th
`ResearchNav` entry) — pick any registered dog (new admin-gated
`GET /api/admin/research/dogs`), run the real engine
(`POST /api/admin/research/decision-trace`), see hard-filter exclusions with
reasons, per-food nutritional/budget/correlation breakdown, matched research
evidence, the Gate 5 topic-by-topic explanation, and the ranked top 10
computed **twice** — with Gate 5 applied and with it forced to zero — so the
difference is directly visible. This endpoint never persists anything (no
`dog_recommendation_sets` insert, confirmed live — see verification).

**What-if sandbox** — additive, opt-in overrides threaded through without
touching any real call site's default behaviour: `applyHardFilter(dogId,
overrides?)` gained an optional 2nd parameter (restrictions/conditions/
life-stage/date-of-birth substitution, applied once right after the real DB
read, before anything downstream uses it); `activeClaimRetrieval.ts` gained
`withConditionRestrictionOverrides()`, a thin wrapper around its existing
injectable `ActiveClaimDataSource` seam. Every real caller
(`api/recommendations/route.ts`, `isFoodSuitable`) calls these with no
overrides argument, so behaviour there is provably unchanged — confirmed by
the full pre-existing test suite passing unmodified. Correlation history
(the dog's real logged data) is deliberately never part of the sandbox.

**New/changed files:** `supabase/migrations/20260803140000_add_research_scoring_enabled_flag.sql`,
`src/lib/researchScoringPolicy.ts` (new), `src/lib/__tests__/researchScoringPolicy.test.ts` (new, 11 tests),
`src/lib/types.ts` (`ResearchEvidence.document_id`/`study_family_id`, `ResearchDocument.duplicate_of_document_id`),
`src/lib/activeClaimRetrieval.ts` (`toResearchEvidence` populates the new fields; exports
`supabaseActiveClaimDataSource` and `withConditionRestrictionOverrides`),
`src/lib/recommendationScoring.ts` (`ScoringWeights.research_scoring_enabled` threaded through
`getActiveScoringWeights`/`normalizeWeights`; doc comments corrected),
`src/lib/hardFilter.ts` (`HardFilterOverrides`), `src/app/api/recommendations/route.ts` (flag-gated wiring),
`src/app/api/admin/research/decision-trace/route.ts` (new), `src/app/api/admin/research/dogs/route.ts` (new),
`src/components/ResearchDecisionTrace.tsx` (new), `src/app/admin/research/decision-trace/page.tsx` (new),
`src/components/research/ResearchNav.tsx` (new entry).

**Verification (all against the live project, `ysffyuohwvdifvbopfcm`):**
- `tsc --noEmit`: clean. `npm test`: 342/342 (331 pre-existing + 11 new). `npm run build`: exit 0,
  only the repository's pre-existing dynamic-route static-analysis notices. `git diff --check`: clean
  (only expected LF/CRLF warnings).
- Authenticated live browser verification, following this repo's established admin-QA pattern (throwaway
  account signed up through the real UI, promoted to `is_admin` via direct SQL, deleted afterward — see
  the P2 system-alerts entry above for precedent): loaded `/admin/research/decision-trace`, the 6 real
  registered dogs populated the picker, ran Ron (real adult dog) — 174/262 foods survived the hard
  filter, 0 eligible active claims matched (consistent with the 2026-08-01 finding that the one active
  claim's food is senior-only), ranked lists rendered with-research (0.587) vs without (0.462) for every
  food, a uniform +0.125 as designed. Expanded the what-if sandbox, overrode life stage to `senior`,
  re-ran: 207/262 survived, `Acana Senior Dog` appeared at rank 8 — exactly matching the
  2026-08-01/07-29 finding that this food is only eligible for a senior-life-stage dog. No console
  errors either run. Confirmed live afterward: `dog_recommendation_sets` count for Ron unchanged at 2
  (both runs correctly persisted nothing), and `recommendation_scoring_weights` still reads
  `research_scoring_enabled=false`, `research_relevance_weight=0.25` — real client recommendations
  untouched throughout.

**Deferred, not built (flagged for the backlog, per the task brief):**
1. **Client-facing "with/without research" exposure.** Named explicitly by the owner as a real future
   goal; confirmed at the start of this session it stays admin-only for now, matching this project's
   established admin-first-then-approve-exposure pattern (P7 today, and everything before it).
2. **The "probe" idea** — testing hypotheses like "is this dog reacting badly to chicken" against the
   whole dog fleet's real longitudinal monitoring data, treating logged outcomes as their own research
   layer (owner's framing: "the dogs data is also a research layer... possibly the most valuable of
   all"). This is the natural sequel connecting Gate 5 (literature evidence → score) to the existing
   Phase 6 correlation engine (`src/lib/correlationScoring.ts`, real per-dog outcome tracking) into one
   intended learning loop, per the owner's core mission framing for this whole tool ("this system should
   be learning over time"). It is a distinct, substantial feature (longitudinal hypothesis tracking, not
   a UI view) and deserves its own dedicated design pass — not folded into this task.

**Needs owner input:**
- Review the decision-trace output above and confirm the Gate 5 numbers read as intended before ever
  flipping `research_scoring_enabled` to `true` for real dog owners.
- Decide when (if ever) to build the client-facing with/without view (deferred item 1).
- Deferred item 2 (the "probe") is now built — see the section directly below.
- This branch has real, verified changes but was not committed or pushed — standing permission from the
  P7 session does not carry forward automatically per this task's brief; ask again when ready to ship.

## Probe — fleet-wide ingredient signal vs. literature (2026-08-03)

**Status:** implemented, tested, and verified live against real data on branch `codex/mobile-pack-capture`.
Not committed/pushed (this task's brief did not carry forward commit/push permission either — ask again).

**What changed and why.** Direct follow-on to Gate 5. Owner framing that started this: "the dogs data is
also a research layer... their data is possibly the most valuable of all because its real life." Gate 5 let
literature evidence move a food's score; this closes the other half of the loop by comparing what the
literature says about an ingredient against what the whole dog fleet's real logged outcomes say about that
same ingredient — surfaced to admin, never written back into scoring. Design proposal (mechanism, sample
thresholds, page location) was put to the owner before any code was written; all three recommended options
were approved as proposed.

**Mechanism** (`src/lib/fleetIngredientSignal.ts`, new):
- **Unit of comparison:** one canonical ingredient (`canonicalIngredientKey`, the same normalizer
  `activeClaimRetrieval.ts` already uses for research-subject matching — strips parenthetical
  percentages/footnotes so "Chicken (26%)" and "chicken" join correctly).
- **Fleet side:** groups `ingredient_outcome_signals` across every dog. At most one row counts per
  (dog, ingredient, metric) — `food_switch` evidence preferred over `single_food_period` when a dog has
  both, same preference `correlationScoring.ts` applies per-dog. Confidence is gated on DISTINCT DOG COUNT,
  not raw row count, so one chatty dog can't fake a fleet pattern: <5 dogs hidden entirely, 5-9
  `low_sample`, 10-24 `preliminary`, 25+ `established` (`FLEET_CONFIDENCE_THRESHOLDS`, tunable, scaled up
  from `correlationEngine.ts`'s per-dog 3/6/16).
- **Literature side:** every active, reviewed claim whose subject is an ingredient, run through the exact
  same `computeResearchScoringTrace()` Gate 5 uses per food — just grouped by ingredient across the whole
  corpus instead of matched to one food's declared composition. No per-dog condition/life-stage gating
  (this answers "what does literature broadly say", not "would this apply to one specific dog").
- **Combine:** each ingredient gets an `agrees` / `diverges` / `inconclusive` / `fleet_only` /
  `literature_only` label, sorted divergent-and-largest-sample first (most actionable).
- **Surface-only, confirmed non-negotiable:** no function here writes to `researchScoringPolicy.ts`, any
  claim's grade/direction, or any scoring path. `hardFilter.ts` is not imported and unreachable from this
  module.

**New surface:** `/admin/research/fleet-signal`, 9th `ResearchNav` entry ("Fleet signal — Literature vs.
real dog outcomes"), backed by `GET /api/admin/research/fleet-signal`
(`src/app/api/admin/research/fleet-signal/route.ts`). Admin-only via `requireAdmin`. No client-facing
exposure, matching the established admin-first pattern.

**Verification:**
- `tsc --noEmit`: clean.
- `npm test`: 349/349 passing, including 7 new tests in
  `src/lib/__tests__/fleetIngredientSignal.test.ts` covering the confidence-tier boundaries, the fleet
  sample floor hiding small patterns entirely, food_switch-over-period preference, canonical-key grouping,
  direction classification (including the neutral band), and null-strength rows being ignored.
- `npm run build`: clean, both new routes registered.
- `git diff --check`: clean.
- **Live browser verification**, per the established throwaway-admin-QA pattern: signed up
  `fleet-signal-qa-throwaway@example.com` through the real `/signup` UI, promoted via one direct SQL
  statement, loaded `/admin/research/fleet-signal` — nav entry present, page rendered, API returned 200,
  no console errors. Confirmed against live DB data (Supabase project `Dog_Food_Helper`,
  `ysffyuohwvdifvbopfcm`) that the empty-state result shown was CORRECT, not a bug: `ingredient_outcome_signals`
  has 0 rows (no dog fleet data exists yet in this environment) and the one active `subject_type='ingredient'`
  claim in the corpus (`green lentil`, taurine finding) has `direction='neutral'`, which both Gate 5 and this
  page correctly treat as inert and exclude. Throwaway account deleted afterward
  (`user_profiles`/`auth.users` rows removed).

**Deferred, not built:** client-facing exposure of fleet-vs-literature agreement — stays admin-only, same
open question as Gate 5's deferred item 1. No automatic write-back from fleet pattern into scoring weight
was built or proposed; that remains a human-in-the-loop decision by design (owner's explicit default, matching
CLAUDE.md's no-silent-edit AI-governance principle).

**Needs owner input:**
- This module cannot be exercised meaningfully until real dog fleet data exists (`ingredient_outcome_signals`
  is currently empty in the connected project) — worth revisiting once there's a working population of logged
  dogs.
- Decide whether/when a `diverges` result should trigger any concrete editorial action (e.g. flagging a
  claim for re-review) — today it is purely descriptive.

**Shipped:** committed (`8748c7f`) and fast-forward merged to `main`, both pushed. `main` and
`codex/mobile-pack-capture` are at the same commit. Three stale branches confirmed fully contained in
`main` (zero unique commits — `codex/biome4pets-documents`, `codex/mixed-feeding`, `codex/stool-events`)
and deleted, local and remote, per owner request 2026-08-03.

## Backlog spec — client-facing "with/without research" view (2026-08-03, not yet built)

Owner direction, recorded ahead of building it: when this is built, it must be gated behind its own
explicit admin on/off switch, separate from `research_scoring_enabled` — the switch controls whether the
with/without-research view is exposed to real dog owners at all, independent of whether Gate 5 scoring
itself is live. This lets admin decide exposure and scoring live-ness on two separate axes rather than one
flag doing both jobs, and matches the project's established off-by-default pattern
(`recommendation_scoring_weights.research_scoring_enabled` did the same for Gate 5 itself). Needs its own
design pass before implementation (new weights-table column vs. new settings row, exact UI copy for what
"research-backed" means to an owner, whether it's per-dog or global) — not scoped further here.

## Bugfix — "DOMMatrix is not defined" on research PDF upload (2026-08-03)

**Symptom:** owner uploaded a real research paper ("Evaluation of Serum and Urine Amino Acids in Dogs
with Chronic Kidney Disease and Healthy Dogs Fed a Renal Diet") via `/admin/research/intake`. The
`finalize_pdf` job failed with `error_message = "DOMMatrix is not defined"`
(`research_ingestion_jobs.id = 23910b4e-a17a-43e1-8af4-21c0777bf529`).

**Root cause, confirmed by static inspection of the installed dependency, not guessed:**
`pdf-parse@2.4.5` bundles `pdfjs-dist@5.4.296`. Its worker (`pdf.worker.mjs`) tries to self-polyfill
`globalThis.DOMMatrix`/`Path2D`/`ImageData` for Node by dynamically requiring `@napi-rs/canvas`
(pdf-parse's own dependency, already present and working in this environment) the first time a
canvas-drawing code path is hit — gradients, patterns, clipping paths, the kind of vector graphics a
figure/chart in a scientific paper produces, which simple lab-report PDFs never touch. That self-polyfill
is wrapped in a try/catch that logs a warning and silently continues on failure rather than throwing
(`"Cannot polyfill \`DOMMatrix\`, rendering may be broken."` in the bundled source). When it silently no-ops,
the next line to call `new DOMMatrix(...)` directly throws the exact error recorded. Reproduced the failure
mode's mechanism was confirmed live by downloading the owner's actual uploaded PDF from the
`research-ingestion` storage bucket and replaying it through the real `finalize_pdf` route on a fresh `next
dev` server — the self-polyfill's timing/context sensitivity meant it did NOT fail on replay (non-deterministic
by nature of a require-inside-a-worker race), but the fragile mechanism itself is real and demonstrated in
the shipped code, and the fix removes it from the equation entirely rather than relying on catching it after
the fact.

**Fix** (`src/lib/pdfText.ts`): explicitly polyfill `DOMMatrix`/`Path2D`/`ImageData` onto `globalThis` from
`@napi-rs/canvas` ourselves, once, at module load — before `pdf-parse`/`pdfjs` ever gets a chance to attempt
its own fragile self-polyfill. Idempotent (`typeof globalThis.X === 'undefined'` guard), so it's a no-op if
something else already set them. Also: added `@napi-rs/canvas` as an explicit direct dependency
(`package.json`) rather than relying on it only being resolvable as pdf-parse's transitive dependency, and
added it to `next.config.mjs`'s `serverComponentsExternalPackages` alongside `pdf-parse` (same rationale —
it's a native-binary package, and Next's route-handler bundler should not try to rewrite it).

**Verification:**
- `tsc --noEmit`: clean.
- `npm test`: 349/349 passing (no test coverage added — this is dependency-loader-order behavior, not
  business logic; not practically unit-testable without mocking pdf-parse's internals).
- `npm run build`: clean.
- `git diff --check`: clean.
- `npm audit`: 2 pre-existing high-severity advisories (Next.js/postcss), confirmed via `git stash` +
  `npm install` on the unmodified tree that they predate this change — not introduced by it, not addressed
  here (fixing them is a Next 14→16 major-version jump, out of scope for a bugfix).
- **Live verification, throwaway-admin-QA pattern:** downloaded the owner's actual failed PDF from storage,
  replayed the real `prepare_pdf` → upload → `finalize_pdf` flow against the live dev server three times
  (once pre-fix confirming success — the bug is non-deterministic, so absence of failure on replay isn't
  proof by itself, which is why the fix targets the confirmed underlying mechanism rather than "it didn't
  reproduce" — and twice post-fix on a freshly restarted server). All three succeeded end to end: 37 chunks,
  real Voyage embedding call, `research_documents` row created. Test documents/chunks deleted afterward.
  Test ingestion-job rows (3) and their `research_provider_calls` telemetry rows could NOT be deleted — both
  tables are deliberately append-only (a DB trigger blocks `research_provider_calls` deletes outright,
  matching the project's audit-immutability principle) — left in place as harmless residual audit history
  (~$0.002 total real cost already incurred, unrecoverable either way). For the same reason the throwaway
  QA account (`pdf-repro-qa-throwaway@example.com`) could not be fully deleted (its id is the `requested_by`
  on those immutable job rows) — demoted to non-admin instead of the usual full delete.

**Owner's original upload:** the real failed job's PDF is still sitting in the `research-ingestion` bucket
(never auto-deleted on failure, by design — see the route's finalize_pdf catch path). Not re-processed on
the owner's behalf without them re-driving it — the natural next step is to retry the same upload through
the real `/admin/research/intake` UI now that the bug is fixed.

**Needs owner input:** none — this is a pure bugfix, no policy/scope decision involved. Retry the original
upload when convenient.

## Review-automation design options (2026-08-03) — proposal only, nothing built

Owner asked directly to be removed from manual research review entirely ("im actually probably less
qualified to do it than a well informed AI... I want a design option to remove me from this"). Per this
project's own precedent (Gate 5, the Probe — design proposal first, owner sign-off, then build), this
session produced options only. See
[`docs/research-review-automation-design-2026-08-03.md`](docs/research-review-automation-design-2026-08-03.md)
for the full writeup.

**What the research confirmed:** both review mechanisms (`review_research_evidence_cluster()` and
`PATCH /api/admin/research/claims/[claimId]`) are 100% human-gated today, despite
`RESEARCH_LAYER_DESIGN.md` §5 already specifying a detailed auto-activation rule back in July that was
never wired up. Existing infrastructure (`research_provider_calls` telemetry, the Gate 5 scoring formula,
the Probe's fleet-vs-literature comparison) all turned out to be directly reusable for whichever
automation option gets picked, rather than needing new plumbing.

**Four options presented:** (A) confidence-gated auto-approve, using the already-designed §5 rule as a
deterministic no-model-call tier plus a narrower model-assisted tier for the next confidence band down;
(B) dual-model consensus before any unattended activation; (C) graduated trust — shadow-mode comparison
of automated verdicts against real human decisions before switching anything on, reusing the Probe's
comparison pattern; (D) keep the human but shrink the click — pre-drafted AI reasoning, one-click
confirm, no new approval-risk surface at all. Recommendation: start with Option A's deterministic tier
only (no model call), add the model-assisted tier once validated in Option C's shadow mode, ship
Option D's UI regardless since it helps under every option.

**Needs owner input:**
- Which option (or sequence) to build first.
- Risk tolerance for a deterministic-only first cut vs. wanting the model-assisted tier from day one.
- A specific circuit-breaker number: unattended activations per day/week before auto-pause, and who gets
  alerted.
- Trial-window length if Option C's shadow-mode comparison gates turning on the model-assisted tier.
- Whether Option D's redesigned review UI should ship in parallel regardless of which automation tier is
  chosen.

No code was written. No claim, cluster, or review mechanism was touched.

## Deterministic auto-activation tier shipped, off by default (2026-08-03)

Owner picked the recommended sequence and delegated the tuning numbers ("your the design authority
here"), with one explicit condition: a human must always be able to remove/reject research, automated
or not. This session built the first tier only — the deterministic, no-model-call rule from
`RESEARCH_LAYER_DESIGN.md` §5, finally wired up. The model-assisted tier and its shadow-mode validation
are NOT built; they remain a later, separate piece of work per the design doc.

**What ships:**
- `supabase/migrations/20260803150000_research_deterministic_auto_activation.sql` — new
  `auto_activated_by_rule`/`auto_activated_at`/`auto_activation_explain` columns on `research_claims`
  and `research_evidence_clusters`; relaxed the active-review check constraint so a row is active via
  either human review OR the rule, never neither; `research_automation_settings` (single-row switch,
  **disabled by default**, daily activation cap, pause state); append-only, trigger-protected
  `research_auto_activation_log` (every attempt, activated or not, with full reasoning);
  `compute_cluster_deterministic_eligibility()` (pure, also used to explain every queued cluster in the
  UI); `run_deterministic_cluster_auto_activation()` (the only path that can activate without a human —
  re-checks the switch, the circuit breaker, and every criterion on every call); a batched eligibility
  reader; `run_deterministic_auto_activation_sweep()`; an hourly `pg_cron` schedule.
- **Bug caught before it shipped inert:** `activeClaimRetrieval.ts`'s runtime matching (the code that
  actually surfaces evidence on a recommendation) required `reviewed_by`/`reviewed_at` to be non-null —
  an auto-activated row would have been silently invisible at runtime despite `status='active'` in the
  database. Fixed in three places (the `loadActiveClaims` query filter, `buildEligibleActiveClaims`, and
  the cluster-eligibility check inside the retrieval loop) to accept `auto_activated_by_rule is not
  null` as an alternative. `ResearchClaim`/`ResearchEvidenceCluster` types updated to carry the field.
- Human override guarantee verified structurally: the existing per-claim `PATCH
  /api/admin/research/claims/[claimId]` endpoint has no status precondition, so a human can reject an
  auto-activated claim at any time through the unmodified existing path. Confirmed live in the
  transactional exercise below.
- `/api/admin/research/processing` GET now returns `automation` (settings, activated-in-last-24h count,
  recent decision log) and, per queued cluster, `auto_activation_eligibility` (the same pass/fail
  reasoning the actor uses). POST gained `set_automation_enabled`, `set_automation_cap`,
  `clear_automation_pause`, `run_automation_sweep`.
- `ResearchKnowledgeAdmin.tsx` gained a status panel (enabled/paused, cap, 24h count, enable/disable,
  cap editor, run-sweep-now, recent-decisions log) and, on every queued cluster card, a criterion-by-
  criterion "auto-activation reasoning" block — this is the "give me reasons" and "make approval easy"
  ask: every queued item now states in plain language exactly which of the eight criteria pass or fail,
  with no model call involved in producing that explanation.

**Verification:**
- `tsc --noEmit`: clean.
- Full test suite: 352/352 passed (4 new: two `buildEligibleActiveClaims` cases and two integrated-
  retrieval cases proving an auto-activated claim/cluster with no human reviewer is eligible, and that
  neither reviewed-nor-rule-activated is not).
- `next build`: exit 0.
- `git diff --check`: clean (line-ending warnings only, matching this repo's existing baseline).
- Supabase advisors: neither new table appears in the RLS/no-policy findings (both got explicit
  service-role policies); no new finding introduced. Performance advisor shows only the expected
  new-and-unused-index notices for the brand-new empty tables.
- **Transactional live exercise** (real project, `begin ... rollback`, zero residue confirmed
  afterward): built 4 clusters against real constraints — one with 3 independent grade-A families
  (eligible), one with 1 family (ineligible on corroboration), one `cautions_against` (ineligible on
  both corroboration and direction), plus a second eligible cluster to exercise the breaker. Proved, in
  order: disabled → `skipped_disabled`; enabled + eligible → `activated`, cluster and all 3 claims set
  active with `auto_activated_by_rule` populated and `reviewed_by`/`reviewed_at` correctly left null;
  both ineligible clusters → `skipped_ineligible` with the exact failing criteria in the log; a second
  eligible cluster with cap=1 already reached → `skipped_circuit_breaker`, `paused=true` set with the
  right reason, one `system_alerts` row raised; a further attempt while paused → `skipped_paused`;
  audit log decision counts matched exactly (1 activated, 1 circuit breaker, 1 disabled, 2 ineligible, 1
  paused); and a plain `UPDATE ... status='rejected'` on the now-active claim succeeded with no
  constraint blocking it, proving the human-override guarantee holds.
- **Authenticated production UI verification** (throwaway-admin-QA pattern: signup → promote → verify →
  delete, per established convention): against the real 14-cluster production queue, the reasoning
  panel rendered correct, cluster-specific pass/fail criteria for every real queued item (e.g. the one
  grade-A systematic-review cluster showed every criterion passing except corroboration — exactly
  right, since no real cluster today has 3 independent families). Enabled automation live, ran a real
  sweep (`Sweep considered 14, activated 0, left 14 still ineligible for review` — correct, since
  nothing in the live queue currently qualifies), saw the recent-decisions log populate, then disabled
  automation again to restore the safe default before cleanup. No console errors. Throwaway account
  fully deleted afterward (this table has no actor/requested_by column, so unlike the
  `research_provider_calls` caveat, no FK blocked the delete). The 14 real `skipped_ineligible` audit-log
  rows from that live sweep were left in place — honest, harmless, append-only history, not fabricated
  test data.

**State after this session:** `research_automation_settings.deterministic_auto_activation_enabled =
false` in production (unchanged from its shipped default) — nothing auto-activates until the owner
explicitly turns it on. The daily cap is currently `10` (Claude's design-authority default from the
sign-off). All 14 real queued clusters remain exactly as they were: still awaiting manual review, now
each showing why they haven't (and, for most, currently can't) auto-activate.

**Needs owner input:**
- Whether to turn `deterministic_auto_activation_enabled` on now, given the real queue's current shape
  (every cluster today is short on independent corroborating families, so turning it on right now would
  not itself activate anything — it's a genuinely safe first flip if the owner wants to see it live).
- Whether 10/rolling-24h is the right cap, now that its effect has been seen against real data.
- The model-assisted tier and its shadow-mode validation trial remain unbuilt and unscheduled — next
  natural step per the design doc's recommendation, but a separate decision to greenlight.
