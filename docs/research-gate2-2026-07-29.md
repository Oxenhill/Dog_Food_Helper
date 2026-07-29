# UI UNVERIFIED — Research Layer Gate 2 report (2026-07-29)

The production research-admin page redirected to `/signin`; no authenticated
test-admin session was available. Nothing in this report describes intended UI
behaviour as observed behaviour.

## Outcome

Gate 2 ingestion and pre-drafting relevance ranking completed against Supabase
project `ysffyuohwvdifvbopfcm`. The owner-approved, frozen 30-document selection
was ingested without identifier substitutions. The live result is:

- 30 research documents, 695 document chunks, 88 topic centroids and 2,282
  document/topic relevance rows.
- 24 OA full-text documents and 6 abstract-only documents.
- Evidence grades: A 3, B 4, C 0, D 23, E 0.
- Grading-input completeness: 27 complete, 3 incomplete.
- Evidence scope: 28 `canine_direct`, 2 `veterinary_methodology`.
- 0 claims; every document remains `pending`; auto-activation is disabled.
- Every chunk and centroid embedding has exactly 1,536 dimensions.
- The exact-manifest idempotency dry run proposed 0 inserts, 0 updates and 30
  skips.

Gate 3 claim drafting was not started.

## What was built

- A frozen Gate 1 identifier manifest and owner-approved, group-balanced
  30-document selection.
- A repeatable offline Gate 2 runner that revalidates frozen PubMed metadata,
  retrieves same-record Europe PMC JATS or PubMed abstracts, preserves
  provenance, chunks source text, makes one offline Vercel AI Gateway embedding
  operation, computes relevance and performs repeatable database upserts.
- Versioned relevance storage:
  `research_topic_centroids.centroid_version` and
  `research_document_relevance.{centroid_version,embedding_model}`.
- An index for the relevance topic-key foreign key and topic-ranked reads.
- Unit tests for evidence grading, source eligibility, chunking, dimensionality,
  ranking policy and deterministic funding classification.

The implementation is in local commit
`308a3ab6c9197bcd53a7f92f3c7947be0b9ac1ed`.

## Immutable corpus and selection

The Gate 1 report SHA-256 is
`02466e9510664fef24d110bf65daa6f83716821f810ac0e4695c6c67b8ead43b`.
The reconstructed manifest contains the same 138 unique candidates as Gate 1.
All current PubMed PMID/PMCID/DOI values for the selected records matched the
frozen manifest. There were no newly appearing candidates, substitutions or
silent discovery changes.

Selection used fixed group quotas A6, B4, C5, D6, E4, F3 and G2, with
deduplication and a preference for usable OA canine evidence. The exact
owner-approved list is
`docs/research-gate2-proposed-selection-2026-07-28.json`.

## Documents and per-document provenance

First live run: **30 inserted, 0 updated, 0 skipped, 0 deduplicated**.

`Metadata` is PubMed structured XML for every row. `OA JATS` content is the
same PMCID's Europe PMC `fullTextXML`; `abstract` content is the same PMID's
PubMed XML. The complete endpoint, retrieval timestamp, source-payload SHA-256,
reduced-text SHA-256, Gate 1 report SHA-256, PubMed payload, topic memberships,
chunk count, model and dimension are stored in each document's
`source_metadata`. Funding and competing-interest text found in JATS is stored
verbatim. `funding_independent` is derived by deterministic text rules; sample
size is deliberately null on every document.

| Group | PMID | PMCID | DOI | Content | Chunks | Grade | Complete |
|---|---:|---|---|---|---:|:---:|:---:|
| A | 25313818 | PMC4196927 | 10.1371/journal.pone.0109681 | OA JATS | 42 | A | yes |
| A | 34043623 | PMC8158863 | 10.1371/journal.pone.0249321 | OA JATS | 23 | A | yes |
| A | 35077028 | PMC9122446 | 10.1002/vms3.739 | OA JATS | 14 | D | yes |
| A | 33345431 | PMC7848368 | 10.1111/jvim.15972 | OA JATS | 31 | D | yes |
| A | 34798889 | PMC8605502 | 10.1186/s12917-021-03068-5 | OA JATS | 16 | D | yes |
| A | 34133456 | PMC8208530 | 10.1371/journal.pone.0253292 | OA JATS | 47 | D | yes |
| B | 29460302 | PMC5867004 | 10.1111/jvim.15072 | OA JATS | 11 | B | no |
| B | 34514619 | PMC9292158 | 10.1111/vcp.13031 | OA JATS | 31 | D | yes |
| B | 39505993 | PMC11541596 | 10.1038/s42003-024-07158-6 | OA JATS | 68 | D | yes |
| B | 33653538 | — | 10.1016/j.cvsm.2021.01.002 | abstract | 1 | D | yes |
| C | 29945610 | PMC6020431 | 10.1186/s12917-018-1528-7 | OA JATS | 18 | D | yes |
| C | 28818076 | PMC5561598 | 10.1186/s12917-017-1183-4 | OA JATS | 22 | D | yes |
| C | 34373420 | PMC8569881 | 10.1292/jvms.21-0162 | OA JATS | 9 | D | yes |
| C | 35264164 | PMC8905904 | 10.1186/s12917-022-03200-z | OA JATS | 25 | D | yes |
| C | 26260508 | PMC4531508 | 10.1186/s12917-015-0515-5 | OA JATS | 23 | D | yes |
| D | 36142319 | PMC9499673 | 10.3390/ijms231810384 | OA JATS | 37 | A | yes |
| D | 40843644 | PMC12883309 | 10.1111/jsap.70022 | OA JATS | 27 | B | no |
| D | 35751062 | PMC9229818 | 10.1186/s12917-022-03302-8 | OA JATS | 27 | D | yes |
| D | 39377170 | PMC11696473 | 10.1111/vde.13304 | OA JATS | 16 | D | yes |
| D | 27611724 | PMC5032870 | 10.1111/jvim.14559 | OA JATS | 30 | D | yes |
| D | 30523666 | PMC6335544 | 10.1111/jvim.15345 | OA JATS | 35 | D | yes |
| E | 34747447 | PMC8763241 | 10.1093/jas/skab315 | abstract | 3 | B | no |
| E | 36482834 | PMC9889624 | 10.1111/jvim.16606 | OA JATS | 25 | D | yes |
| E | 31758868 | PMC6979111 | 10.1111/jvim.15638 | OA JATS | 41 | D | yes |
| E | 30222209 | PMC6189362 | 10.1111/jvim.15247 | abstract | 3 | D | yes |
| F | 40624095 | PMC12234828 | 10.1038/s41598-025-06178-4 | OA JATS | 38 | D | yes |
| F | 34842769 | PMC8628994 | 10.3390/medsci9040072 | abstract | 1 | D | yes |
| F | 29851313 | PMC5980124 | 10.1002/vms3.92 | OA JATS | 25 | D | yes |
| G | 23035739 | PMC3527270 | 10.1186/1746-6148-8-185 | abstract | 3 | B | yes |
| G | 34438246 | — | 10.1016/j.prevetmed.2021.105472 | abstract | 3 | D | yes |

PMIDs 33653538, 34747447 and 34438246 were intentionally abstract-only.
PMIDs 30222209, 34842769 and 23035739 had PMCIDs in Gate 1, but Europe PMC
returned HTTP 404 for `fullTextXML`. They were retained as the same frozen
PMIDs using PubMed abstracts, with the fallback reason stored and OA-only
funding/competing-interest fields left null. No substitute article was used.

The three incomplete records are 29460302, 40843644 and 34747447; each is
missing `sample_size` and `funding_independent`. Missing metadata remains
separate from evidence weakness. The Group G methodology record 23035739 is
complete under the methodology-specific grading-input scope and remains
appraisal context only.

## Embeddings and paid-call accounting

All AI work used the **Vercel AI Gateway**, qualified model
`openai/text-embedding-3-small`, pinned to 1,536 dimensions. No direct OpenAI
endpoint and no request-time AI path were used.

- Approved pre-call estimate: 234,401 tokens, approximately $0.004688 at
  $0.02 per million tokens.
- Actual: 783 inputs (695 chunks and 88 centroids), 199,245 tokens,
  approximately $0.0039849.
- One offline `embedMany` operation with parallel calls limited to one.
- 695/695 stored chunk vectors and 88/88 centroid vectors have exactly 1,536
  dimensions; `research_chunks.embedding` remains `vector(1536)`.

## Relevance ranking

The schema gap in the original design was resolved explicitly before
ingestion: centroid version and embedding model are stored with every centroid
and relevance evaluation. Scores are stored in
`research_document_relevance`; rank and drafting eligibility are derived rather
than duplicated.

Policy: for each document/topic pair, use the maximum cosine similarity across
that document's chunks. A pair is drafting-eligible only when it is in the
topic's top five and has similarity at least 0.35.

The top-five cap is the principal drafting-cost control; the 0.35 floor prevents
a topic from producing candidates merely because five documents exist. This is
an operational relevance gate, not evidence quality or biological
corroboration.

Live result:

- 2,282 stored document/topic similarities.
- 384 drafting-eligible pairs: A84, B60, C70, D78, E52, F34, G6.
- No topic has more than five eligible documents.
- 0 eligible pairs are below 0.35.
- 0 centroid-version or embedding-model mismatches.
- 0 veterinary-methodology documents ranked outside Group G.
- 0 canine-direct documents ranked in Group G.

No claims were drafted from these rankings.

## Database and isolation verification

Pre-run counts were rechecked as required:
`research_documents=0`, `research_chunks=0`, `research_claims=0`.

Post-run:
`research_documents=30`, `research_chunks=695`, `research_claims=0`,
`research_topic_centroids=88`, `research_document_relevance=2282`.

- Every one of the 28 canine-direct records has structured PubMed `Dogs` MeSH.
  No human-only or rodent biological record was ingested.
- The two methodology records have `veterinary_methodology` scope and are
  restricted to Group G. They cannot corroborate biological claims, affect
  scoring/recommendations or auto-activate.
- No Grade E record and no preprint was ingested.
- All 30 document review states are `pending`; 0 are approved or active.
- Exact document/chunk provenance is preserved by the document foreign key,
  stable chunk index and per-document source metadata.

Protected row counts were identical before and after:

| Table | Before | After |
|---|---:|---:|
| dog_documents | 1 | 1 |
| dog_document_findings | 11 | 11 |
| recommendation_scoring_weights | 1 | 1 |
| condition_contraindications | 0 | 0 |
| dog_recommendation_sets | 1 | 1 |
| research_score_cache | 0 | 0 |
| research_score_queue | 0 | 0 |
| manufacturer_targets | 108 | 108 |
| manufacturer_target_domains | 37 | 37 |
| manufacturer_entities | 3 | 3 |
| terms_clause_patterns | 7 | 7 |
| crawl_targets | 313 | 313 |
| source_domain_allowlist | 12 | 12 |
| contributed_foods | 27 | 27 |
| foods | 314 | 314 |
| food_ingredients | 1,369 | 1,369 |

The Gate 2 change set does not touch recommendation, scoring, hard-filter,
client-document or prohibited section 14.6 code/tables. The existing
`manufacturer-recon` Edge Function remains at version 5.

## Repeatability

An exact-manifest post-ingestion dry run returned:

- inserted 0
- updated 0
- skipped 30
- deduplicated 0

Every skip reason was `exact_manifest_content_and_embedding_model`. The dry run
made no writes. The live run respected the 30-document cap after all source
fallbacks and retries.

## Verification performed

- Unit/integration tests: 211 passed, 0 failed.
- Type checking: `tsc --noEmit` passed.
- Production build: passed under Next.js 14.2.35, producing 72 static pages.
  Existing `Dynamic server usage` messages for request-header-dependent routes
  remained warnings; the build exited successfully.
- The full build ran against the current shared workspace, which also contained
  unrelated, uncommitted stool-tracking changes. Those changes are not part of
  the Gate 2 commit.
- Supabase performance advisor: the new relevance topic-key foreign key is
  indexed; no Gate 2 unindexed-foreign-key warning remains.
- Browser verification: **UI UNVERIFIED**, as stated at the top.

## Outstanding security finding (not changed in Gate 2)

The Supabase security advisor reports critical, pre-existing disabled RLS on
`public.manufacturer_entities` and `public.terms_clause_patterns`. These
prohibited parallel tables were not modified. Enabling RLS without correct
policies would block access, so remediation requires a separate, owner-approved
policy design. See the
[Supabase RLS guide](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Stop

Gate 2 is complete. No Gate 3 drafting run, claim insertion, auto-activation,
recommendation/scoring connection or client-output work was performed.
