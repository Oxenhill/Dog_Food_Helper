# Research brain implementation handoff — 2026-07-29

## Purpose

This is a local checkpoint for continuing the Research Layer work after the Gate 4 calibration exposed two product requirements:

1. Literature evidence must be organised, grouped, and reviewed inside the app.
2. A private dog report must not enter a global admin queue. Exact findings should be used automatically for that dog; uncertain findings should be excluded and shown to the owner.

The live recommendation path remains deterministic and token-free. Vercel AI Gateway is used only for background literature ingestion and drafting.

## Repository checkpoint

- Workspace: `C:\dev\dog-smart-learning-centre\Dog_Food_Helper`
- Local branch: `codex/mobile-pack-capture`
- Starting HEAD for this continuation: `313b973c48e38e797df0f09467f99f50cd511410`
- Starting Gate 4 commit: `6f7d10e1586ef0d0dd506f6df43796a243a97e1e`
- Supabase project: `ysffyuohwvdifvbopfcm`
- Vercel project: `dog-food-helper`
- The working tree was clean before these changes.
- HEAD ancestry from the Gate 4 starting commit and the then-current `origin/main` was verified.

Do not reset, clean, stash, or overwrite the shared worktree. Recheck `git status -sb` and remote ancestry before continuing.

## Live data facts established before implementation

- 30 research documents
- 695 research chunks
- 2 legacy research claims
- 88 legacy centroids
- 2,282 document relevance rows
- One owner-approved active legacy claim: neutral green-lentil evidence
- One queued legacy claim: taurine evidence
- No corroborating claim relationships
- The active green-lentil claim had no dog-health context and was appearing for Ron solely because lentils were an ingredient.
- Ron is an adult without a relevant health condition.
- `Acana Senior Dog` had no numeric age range, so its explicit product name was not being used as a life-stage restriction.
- Lenny had one Biome4Pets report with 11 parsed findings: 10 accepted and one uncertain typo (`Bacteriodetes`).

## Implemented locally

### Recommendation safety

- `src/lib/hardFilter.ts`
  - Deterministic food life-stage eligibility.
  - Adult dogs cannot receive explicitly senior or puppy/junior foods.
  - Senior and puppy checks use whole words, avoiding partial-name false matches.
  - Numeric food age ranges are enforced when present.
- `src/lib/activeClaimRetrieval.ts`
  - A neutral legacy claim with no dog condition is runtime-ineligible.
  - Structured evidence clusters are usable only when the cluster and claim are active and human reviewed.
  - Required dog contexts are matched deterministically from health conditions, accepted report findings, life stage, restrictions, and outcome metrics.
  - A cluster with no required dog context is runtime-ineligible.
  - Uncertain report findings are never used.
  - Runtime retrieval remains bounded, with no per-food query.
  - No model or embedding call exists in runtime recommendation retrieval.

### Private dog report handling

- `src/lib/biome4PetsParser.ts`
  - A report with some uncertain findings is now `partial`, not globally `needs_review`.
- `src/app/api/dogs/[dogId]/documents/route.ts`
  - Returns findings with documents in a bounded query.
- `src/components/DogDocumentsCard.tsx`
  - Shows accepted findings as `Used in profile`.
  - Shows uncertain findings as `Excluded — uncertain`.
  - Explains that no admin review is required.
- Live Lenny document status was changed from `needs_review` to `partial` only when it had accepted findings and its source file had already been deleted.
- No finding review status was changed.

### In-app literature ingestion

- `src/lib/researchBrainPipeline.ts`
  - Imports selected PubMed/Europe PMC records and uploaded PDFs.
  - Uses `voyage/voyage-4` through Vercel AI Gateway only.
  - Stores 1,024-dimensional Voyage vectors separately from legacy OpenAI 1,536-dimensional vectors.
- `src/lib/researchDiscovery.ts`
  - Resolves pasted PubMed URLs, PMIDs, and DOIs through structured sources.
  - Rejects non-canine-direct and retracted sources.
- Admin APIs:
  - `src/app/api/admin/research/discovery/route.ts`
  - `src/app/api/admin/research/ingestion/route.ts`
- Admin UI:
  - `src/components/ResearchIngestionAdmin.tsx`
  - Check for new research.
  - Add a literature link/PMID/DOI.
  - Upload a PDF.
  - Explicitly import a candidate.
  - See job status and recorded usage/cost.

### Background evidence drafting and grouping

- `src/lib/researchBrainDrafting.ts`
  - Uses `anthropic/claude-sonnet-5` and Voyage through Vercel AI Gateway only.
  - Semantically selects relevant chunks, then extracts literal source quotes and structured evidence.
  - Validates that supporting quotes remain literal chunk substrings.
  - Enforces food-matchable subject types and explicit nutrient/ingredient/processing taxonomies.
  - Rejects biome markers as direct food subjects.
  - Creates queued claims and queued evidence clusters only.
  - Never auto-activates evidence or populates corroboration.
- Processing API and UI:
  - `src/app/api/admin/research/processing/route.ts`
  - `src/components/ResearchKnowledgeAdmin.tsx`
- Population entry point:
  - `scripts/researchBrainPopulate.ts`
  - `npm run research:brain:populate`

### Database migrations already applied to production Supabase

- `supabase/migrations/20260729133601_research_brain_workflow.sql`
  - Ingestion jobs, discovery candidates, Voyage embeddings, evidence clusters, cluster members, deterministic applicability, private upload bucket, RLS/service-role policies.
- `supabase/migrations/20260729134735_research_cluster_review_transaction.sql`
  - Honest document access types.
  - Atomic cluster approve/reject RPC.
  - Approval validates source state and literal quote, and activates member claims with reviewer metadata.
  - Rejection preserves an audit note.

These migrations are live. Do not reapply them blindly; compare migration history first.

## Background population performed

The existing corpus was processed through Vercel AI Gateway only. All retained output is queued for owner review and has zero runtime/ranking effect.

- diet/microbiome: 2 clusters
- chronic enteropathy: 2 clusters
- deficiency markers: 6 clusters
- diabetes/fibre: 7 clusters
- large-bowel diarrhoea: 1 cluster
- osteoarthritis: 1 cluster
- urolithiasis: 4 clusters
- adverse food reactions: 4 clusters
- novel-protein diets: 2 clusters
- protein cross-reactivity: 4 clusters
- processing/nutrient availability: 3 clusters
- raw diets: 4 clusters
- dysbiosis index and grain-free DCM produced no retained claims

Bad calibration drafts were removed only while they were fresh, queued, and unreviewed. Their job audit records remain with discard reasons. No previously reviewed claim was modified.

## Verification already completed

- Focused recommendation, parser, and hard-filter tests passed.
- A full production build passed twice after the main implementation.
- `git diff --check` was clean apart from expected line-ending warnings.
- The live legacy green-lentil claim status/reviewer metadata was not changed.
- Neutral context-free evidence is suppressed by runtime logic rather than by altering its database status.

## Must be completed next

1. Quality-audit the generated queued clusters with compact Supabase queries.
   - Summarise status, subject type, direction, context count, and member count.
   - Remove only demonstrably invalid fresh queued drafts; retain their job audit records.
2. Add owner edit-before-approval.
   - Queued clusters need editable subject, measured outcome, cautious summary, direction, and applicability contexts.
   - Validate the same allowlists used by runtime.
   - Recompute cluster identity safely.
   - Never permit edits to active/rejected clusters.
3. Show source paper title/link in each cluster review card.
4. Add/finish integration tests:
   - active reviewed cluster plus accepted dog finding appears;
   - queued/rejected cluster cannot appear;
   - active claim in an inactive cluster cannot appear;
   - no-context cluster is suppressed;
   - uncertain dog finding is suppressed;
   - exact quote/source/access status reach the response;
   - `uploaded_full_text_private` is preserved;
   - no runtime AI/embedding calls;
   - no N+1 query;
   - ranking is unchanged by neutral evidence.
5. Re-run:
   - full tests;
   - type checking;
   - production build;
   - `git diff --check`.
6. Run Supabase security and performance advisors.
   - An earlier inspection found unrelated existing tables `manufacturer_entities` and `terms_clause_patterns` with RLS disabled. Do not silently fix unrelated schema; report it with the advisor remediation links.
7. Post-implementation live checks:
   - exact claim/cluster status counts;
   - reviewer metadata unchanged for existing claims;
   - all `corroborating_claim_ids` remain empty;
   - protected source/chunk/embedding/cache/queue counts unchanged except intentional new workflow rows and Voyage embeddings;
   - Lenny remains 10 accepted findings, 1 uncertain, document `partial`.
8. Update:
   - `docs/research-gate4-2026-07-29.md`
   - `BUILD_PROGRESS.md`
9. Commit only these Research Layer changes.
10. Push to `main`, wait for the Vercel deployment, then use the authenticated in-app browser:
    - admin research ingestion/processing/active states;
    - Lenny report owner presentation if an authenticated Lenny owner session is available;
    - matching and nonmatching dog recommendations;
    - desktop/mobile layout, usable links, and no console errors.

## Important product boundaries

- Do not approve literature on the owner’s behalf.
- Do not change the status of the legacy active/queued claims.
- Do not use private dog reports as global literature.
- Do not make request-time AI, embedding, or pending-document RAG calls.
- Do not let neutral or single-study evidence change food ranking.
- Do not infer numeric strength from a grade.
- Do not auto-populate corroboration.
- Do not alter food data to manufacture a production match.
- Do not change recommendation weights.

At this checkpoint, the architecture is functional but deliberately not deployed: the owner edit/review experience and final quality audit must be completed first.

## Behive assessment and ideas to build locally

Decision recorded 2026-07-29: do not adopt `qa10devteam/behive` as a dependency,
research authority, crawler, or food-population system. Its public implementation
does not meet this project's provenance, independent-corroboration, crawl-policy,
literal-quote, deterministic-grading, or human-review requirements. In particular,
its numerical "quality" score measures characteristics of the writing rather than
the truth of a claim, and its crawler's bypass behaviour is incompatible with the
existing robots.txt and Terms-of-Service gates.

Useful ideas may be rebuilt inside the existing TypeScript/Supabase architecture:

1. **Background research missions.** Keep explicit queued/running/partial/failed/
   completed states, stage timings, costs, and audit events on the existing
   `research_ingestion_jobs` workflow.
2. **Stage-specific model routing.** Allow separately configured discovery,
   relevance, drafting, and synthesis models, while preserving the rule that model
   output is offline, queued, and never a runtime decision or database fact.
3. **Structured source registry.** Maintain a small, versioned registry of approved
   structured literature APIs with rate limits and capabilities. This registry does
   not override species, access, retraction, licence, robots.txt, or ToS gates.
4. **Progress and cost telemetry.** Expose stage progress, source counts, retained
   candidates, rejected candidates, token cost, and deterministic rejection reasons
   in the admin research UI.
5. **Research graph.** Build a read model from approved records rather than a second
   source of truth. Initial node types should be `document`, `study_family`,
   `claim`, `evidence_cluster`, `ingredient`, `nutrient`, `processing_method`,
   `condition`, and `outcome`. Initial edge types should be `SUPPORTS`,
   `CAUTIONS_AGAINST`, `DERIVED_FROM`, `MEMBER_OF`, `SAME_STUDY_FAMILY`,
   `APPLIES_TO`, `CONCERNS`, `SUPERSEDES`, and `RETRACTED_BY`.

Graph rules:

- Only active, human-reviewed claims and clusters may appear in the production
  graph. Draft and queued material may appear only in an isolated admin preview.
- Every graph edge must resolve to the underlying claim, literal quote, document,
  and review metadata. An inferred visual relationship is never evidence.
- Corroboration is determined by the existing study-family and review rules, not by
  graph degree, repeated URLs, text similarity, or the number of domains.
- Retraction or supersession must remove the affected production edges in the same
  transaction that changes evidence status.
- The first implementation should use relational tables/views and recursive SQL in
  Supabase. Neo4j or another graph database should be considered only after a
  measured query or visualisation need cannot be met safely in Postgres.
- The graph may explain and navigate reviewed evidence. It must not independently
  change recommendation weights, activate claims, populate food composition, or
  infer missing product data.

Suggested delivery order:

1. Finish the existing owner edit/review experience and quality audit.
2. Add mission telemetry and a versioned structured-source registry.
3. Define a deterministic graph projection view over the approved evidence tables.
4. Add an admin-only graph explorer with node-to-quote drill-down.
5. Validate retraction, supersession, privacy, and inactive-cluster behaviour.
6. Consider a user-facing evidence map only after the reviewed projection is stable.
