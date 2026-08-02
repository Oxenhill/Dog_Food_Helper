-- P3: deterministic graph projection.
--
-- Read-only views over already-approved research rows. This is a projection,
-- not a second source of truth: every view selects live from
-- research_documents / research_claims / research_evidence_clusters /
-- research_evidence_cluster_members / research_cluster_applicability and
-- carries no independent state. Nothing here writes, scores, ranks, or
-- activates evidence.
--
-- Eligibility (applied uniformly): document not retracted, not superseded,
-- evidence_scope = 'canine_direct' (excludes Group-G veterinary-methodology
-- appraisal context, which never makes a biological claim about dogs); claim
-- status = 'active'; cluster status = 'active'. Draft/queued/rejected/
-- superseded/retracted rows and private per-dog data never appear here.
--
-- Deferred by design, not by oversight:
--   - SAME_STUDY_FAMILY: no study_family identity exists anywhere in the
--     schema yet (documents are deduplicated only by unique doi/source
--     record, which is a different guarantee than "same underlying trial or
--     population"). Modelling that correctly is a data-model decision, not a
--     query, and belongs to whichever phase defines it -- fabricating a
--     grouping here would misrepresent independence between studies.
--   - SUPERSEDES / RETRACTED_BY: explicitly scoped to P5 ("retraction and
--     supersession validation") in docs/research-behive-architecture-review-
--     2026-08.md. A retracted/superseded document has no node in this
--     projection at all (see eligibility above), so there is nothing yet to
--     attach a transition edge to.

create or replace view public.research_graph_documents
with (security_invoker = true) as
select
  d.id as document_id,
  d.title,
  d.doi,
  d.pmid,
  d.pmcid,
  d.journal,
  d.publication_year,
  d.access_type,
  d.evidence_grade,
  d.study_design,
  d.species
from public.research_documents d
where d.retracted = false
  and d.superseded_by is null
  and d.evidence_scope = 'canine_direct';

comment on view public.research_graph_documents
is 'P3 graph node: document. Active-eligible documents only (not retracted, not superseded, canine_direct scope). Sourced live from research_documents; not a copy.';

create or replace view public.research_graph_claims
with (security_invoker = true) as
select
  c.id as claim_id,
  c.document_id,
  c.subject_type,
  c.subject_value,
  c.applies_to_condition,
  c.applies_to_life_stage,
  c.direction,
  c.effect_summary,
  c.evidence_grade,
  c.supporting_quote,
  c.reviewed_by,
  c.reviewed_at
from public.research_claims c
join public.research_graph_documents d on d.document_id = c.document_id
where c.status = 'active'
  and c.evidence_scope = 'canine_direct';

comment on view public.research_graph_claims
is 'P3 graph node: claim. Active claims whose document is also eligible. A claim from a superseded/retracted document is excluded even if the claim row itself is status=active.';

create or replace view public.research_graph_clusters
with (security_invoker = true) as
select
  id as cluster_id,
  label,
  subject_type,
  subject_value,
  outcome_type,
  outcome_value,
  direction,
  cautious_summary,
  reviewed_by,
  reviewed_at
from public.research_evidence_clusters
where status = 'active';

comment on view public.research_graph_clusters
is 'P3 graph node: evidence_cluster. Active (human-reviewed and approved) clusters only.';

create or replace view public.research_graph_concept_nodes
with (security_invoker = true) as
select distinct subject_type as concept_type, subject_value as concept_key
from public.research_graph_claims
union
select distinct subject_type, subject_value
from public.research_graph_clusters
union
select distinct outcome_type, outcome_value
from public.research_graph_clusters
union
select distinct 'condition', applies_to_condition
from public.research_graph_claims
where applies_to_condition is not null;

comment on view public.research_graph_concept_nodes
is 'P3 graph nodes: ingredient / nutrient / ingredient_class / processing_method / biome_marker / condition / clinical_marker / outcome_metric / general_health. Distinct (type, key) pairs derived only from eligible claims and clusters -- not a separate identity table.';

create or replace view public.research_graph_edges_derived_from
with (security_invoker = true) as
select
  'DERIVED_FROM'::text as edge_type,
  claim_id,
  document_id
from public.research_graph_claims;

comment on view public.research_graph_edges_derived_from
is 'P3 graph edge: claim DERIVED_FROM document.';

create or replace view public.research_graph_edges_member_of
with (security_invoker = true) as
select
  'MEMBER_OF'::text as edge_type,
  m.claim_id,
  m.cluster_id,
  m.relationship,
  m.independently_reviewed
from public.research_evidence_cluster_members m
join public.research_graph_claims c on c.claim_id = m.claim_id
join public.research_graph_clusters cl on cl.cluster_id = m.cluster_id;

comment on view public.research_graph_edges_member_of
is 'P3 graph edge: claim MEMBER_OF evidence_cluster. Both endpoints must already be eligible nodes; a queued/rejected cluster or claim drops the whole membership row.';

create or replace view public.research_graph_edges_direction
with (security_invoker = true) as
select
  case direction
    when 'supports' then 'SUPPORTS'
    when 'cautions_against' then 'CAUTIONS_AGAINST'
  end as edge_type,
  cluster_id,
  subject_type,
  subject_value,
  outcome_type,
  outcome_value
from public.research_graph_clusters
where direction in ('supports', 'cautions_against');

comment on view public.research_graph_edges_direction
is 'P3 graph edge: subject concept SUPPORTS/CAUTIONS_AGAINST outcome concept, per active cluster. neutral and insufficient_evidence clusters intentionally produce no directional edge -- they are nodes without an asserted direction, not a third edge type.';

create or replace view public.research_graph_edges_concerns
with (security_invoker = true) as
select
  'CONCERNS'::text as edge_type,
  claim_id,
  applies_to_condition as condition_key
from public.research_graph_claims
where applies_to_condition is not null;

comment on view public.research_graph_edges_concerns
is 'P3 graph edge: claim CONCERNS condition, from research_claims.applies_to_condition.';

create or replace view public.research_graph_edges_applies_to
with (security_invoker = true) as
select
  'APPLIES_TO'::text as edge_type,
  a.cluster_id,
  a.context_type,
  a.context_key,
  a.context_value,
  a.required
from public.research_cluster_applicability a
join public.research_graph_clusters c on c.cluster_id = a.cluster_id;

comment on view public.research_graph_edges_applies_to
is 'P3 graph edge: evidence_cluster APPLIES_TO dog-profile context (condition/life_stage/restriction/outcome_metric), from research_cluster_applicability. This is the same deterministic table runtime retrieval already reads; the edge is a read-model label over it, not a new eligibility rule.';

revoke all on public.research_graph_documents from public, anon, authenticated;
revoke all on public.research_graph_claims from public, anon, authenticated;
revoke all on public.research_graph_clusters from public, anon, authenticated;
revoke all on public.research_graph_concept_nodes from public, anon, authenticated;
revoke all on public.research_graph_edges_derived_from from public, anon, authenticated;
revoke all on public.research_graph_edges_member_of from public, anon, authenticated;
revoke all on public.research_graph_edges_direction from public, anon, authenticated;
revoke all on public.research_graph_edges_concerns from public, anon, authenticated;
revoke all on public.research_graph_edges_applies_to from public, anon, authenticated;

grant select on public.research_graph_documents to service_role;
grant select on public.research_graph_claims to service_role;
grant select on public.research_graph_clusters to service_role;
grant select on public.research_graph_concept_nodes to service_role;
grant select on public.research_graph_edges_derived_from to service_role;
grant select on public.research_graph_edges_member_of to service_role;
grant select on public.research_graph_edges_direction to service_role;
grant select on public.research_graph_edges_concerns to service_role;
grant select on public.research_graph_edges_applies_to to service_role;
