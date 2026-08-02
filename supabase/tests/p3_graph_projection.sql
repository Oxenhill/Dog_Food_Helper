-- P3 graph projection behavioural assertions.
-- Run against supabase/tests/p3_minimal_research_fixture.sql plus the real
-- supabase/migrations/20260802170000_research_graph_projection.sql applied
-- on top. Disposable validation only -- not part of the migration history.

-- D1: fully eligible document.
insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint)
values
  ('10000000-0000-0000-0000-000000000001', 'Eligible Study', false, 'dog', 'rct', 30, true, false);

-- D2 / D2b: D2 will be superseded by D2b after its claim is already active.
insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint)
values
  ('10000000-0000-0000-0000-000000000002', 'Superseded Study', false, 'dog', 'rct', 30, true, false),
  ('10000000-0000-0000-0000-000000000003', 'Superseding Study', false, 'dog', 'rct', 30, true, false);

-- D4: veterinary_methodology appraisal context, not a canine biological claim.
insert into public.research_documents
  (id, title, retracted, species, evidence_scope)
values
  ('10000000-0000-0000-0000-000000000004', 'Methodology Paper', false, null, 'veterinary_methodology');

insert into public.research_chunks (id, document_id, content) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001',
   'Green lentils improved stool consistency in adult dogs with mild colitis.'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002',
   'Fibre intake was associated with digestive changes in the study population.'),
  ('20000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000004',
   'This appraisal describes methodology for grading veterinary evidence quality.');

-- CL1: fully eligible claim (active, document eligible).
insert into public.research_claims
  (id, document_id, chunk_id, supporting_quote, subject_type, subject_value,
   applies_to_condition, applies_to_life_stage, direction, effect_summary,
   claim_identity, status, reviewed_by, reviewed_at)
values
  ('30000000-0000-0000-0000-000000000001',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'improved stool consistency',
   'ingredient', 'green lentil', 'colitis', 'adult', 'supports',
   'Improved stool consistency in dogs with mild colitis.',
   repeat('a1', 32), 'active',
   '00000000-0000-0000-0000-000000000001', now());

-- CL2: active at insert time; its document is superseded afterward (no
-- retracted-column trigger fires on superseded_by), so CL2 stays
-- status='active' in the base table. The projection must still exclude it.
insert into public.research_claims
  (id, document_id, chunk_id, supporting_quote, subject_type, subject_value,
   direction, effect_summary, claim_identity, status, reviewed_by, reviewed_at)
values
  ('30000000-0000-0000-0000-000000000002',
   '10000000-0000-0000-0000-000000000002',
   '20000000-0000-0000-0000-000000000002',
   'associated with digestive changes',
   'nutrient', 'fibre', 'supports',
   'Associated with digestive changes.',
   repeat('a2', 32), 'active',
   '00000000-0000-0000-0000-000000000001', now());

update public.research_documents
set superseded_by = '10000000-0000-0000-0000-000000000003'
where id = '10000000-0000-0000-0000-000000000002';

do $$
begin
  if (select status from public.research_claims
      where id = '30000000-0000-0000-0000-000000000002') <> 'active' then
    raise exception 'setup invariant broken: CL2 must remain active at the base-table level after superseded_by is set, otherwise this is not testing the join eligibility path';
  end if;
end
$$;

-- CL3: active claim whose document is veterinary_methodology scope.
insert into public.research_claims
  (id, document_id, chunk_id, supporting_quote, subject_type, subject_value,
   direction, effect_summary, claim_identity, status, reviewed_by, reviewed_at)
values
  ('30000000-0000-0000-0000-000000000003',
   '10000000-0000-0000-0000-000000000004',
   '20000000-0000-0000-0000-000000000004',
   'methodology for grading',
   'processing_method', 'grading methodology', 'insufficient_evidence',
   'Describes an evidence-grading method.',
   repeat('a3', 32), 'active',
   '00000000-0000-0000-0000-000000000001', now());

-- CL4/CL5/CL6: draft / rejected / queued claims on the otherwise-eligible D1.
insert into public.research_claims
  (id, document_id, chunk_id, supporting_quote, subject_type, subject_value,
   direction, effect_summary, claim_identity, status, review_note)
values
  ('30000000-0000-0000-0000-000000000004',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'improved stool consistency',
   'ingredient', 'green lentil', 'supports', 'Draft claim.',
   repeat('a4', 32), 'draft', null),
  ('30000000-0000-0000-0000-000000000005',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'improved stool consistency',
   'ingredient', 'green lentil', 'supports', 'Rejected claim.',
   repeat('a5', 32), 'rejected', 'not applicable');

insert into public.research_claims
  (id, document_id, chunk_id, supporting_quote, subject_type, subject_value,
   direction, effect_summary, claim_identity, status)
values
  ('30000000-0000-0000-0000-000000000006',
   '10000000-0000-0000-0000-000000000001',
   '20000000-0000-0000-0000-000000000001',
   'improved stool consistency',
   'ingredient', 'green lentil', 'supports', 'Queued claim.',
   repeat('a6', 32), 'queued_for_review');

-- CU1: fully eligible cluster (active), member of CL1, applicability row.
insert into public.research_evidence_clusters
  (id, cluster_identity, label, subject_type, subject_value, outcome_type,
   outcome_value, direction, cautious_summary, status, reviewed_by, reviewed_at)
values
  ('40000000-0000-0000-0000-000000000001', repeat('b1', 32), 'Green lentil and colitis',
   'ingredient', 'green lentil', 'condition', 'colitis', 'supports',
   'Limited evidence suggests improved stool consistency.', 'active',
   '00000000-0000-0000-0000-000000000001', now());

-- CU2: queued cluster (excluded), also linked to CL1 (eligible claim) to
-- prove cluster eligibility gates the edge even when the claim is fine.
insert into public.research_evidence_clusters
  (id, cluster_identity, label, subject_type, subject_value, outcome_type,
   outcome_value, direction, cautious_summary, status)
values
  ('40000000-0000-0000-0000-000000000002', repeat('b2', 32), 'Queued proposition',
   'ingredient', 'green lentil', 'condition', 'colitis', 'supports',
   'Awaiting review.', 'queued_for_review');

-- CU3: rejected cluster (excluded).
insert into public.research_evidence_clusters
  (id, cluster_identity, label, subject_type, subject_value, outcome_type,
   outcome_value, direction, cautious_summary, status, reviewed_by, reviewed_at, review_note)
values
  ('40000000-0000-0000-0000-000000000003', repeat('b3', 32), 'Rejected proposition',
   'nutrient', 'fibre', 'condition', 'colitis', 'supports',
   'Not supported on review.', 'rejected',
   '00000000-0000-0000-0000-000000000001', now(), 'insufficient basis');

-- CU4: active cluster with a neutral direction -- node exists, no directional edge.
insert into public.research_evidence_clusters
  (id, cluster_identity, label, subject_type, subject_value, outcome_type,
   outcome_value, direction, cautious_summary, status, reviewed_by, reviewed_at)
values
  ('40000000-0000-0000-0000-000000000004', repeat('b4', 32), 'Neutral proposition',
   'nutrient', 'taurine', 'general_health', 'no measured effect', 'neutral',
   'No effect was demonstrated either way.', 'active',
   '00000000-0000-0000-0000-000000000001', now());

insert into public.research_evidence_cluster_members (cluster_id, claim_id, relationship, independently_reviewed) values
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000001', 'same_proposition', true),
  ('40000000-0000-0000-0000-000000000001', '30000000-0000-0000-0000-000000000004', 'same_proposition', false),
  ('40000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000001', 'same_proposition', false);

insert into public.research_cluster_applicability (cluster_id, context_type, context_key, required) values
  ('40000000-0000-0000-0000-000000000001', 'health_condition', 'colitis', true),
  ('40000000-0000-0000-0000-000000000002', 'health_condition', 'colitis', true);

-- ============ Assertions ============

do $$
declare
  v_count integer;
begin
  -- research_graph_documents: D1 (eligible) and D2b/"Superseding Study"
  -- (eligible -- it is the current version, not the superseded one). D2 is
  -- excluded because it was superseded; D4 is excluded (veterinary_methodology).
  select count(*) into v_count from public.research_graph_documents;
  if v_count <> 2 then
    raise exception 'expected 2 eligible documents (D1, D2b), got %', v_count;
  end if;
  if not exists (select 1 from public.research_graph_documents where document_id = '10000000-0000-0000-0000-000000000001') then
    raise exception 'D1 must appear in research_graph_documents';
  end if;
  if not exists (select 1 from public.research_graph_documents where document_id = '10000000-0000-0000-0000-000000000003') then
    raise exception 'D2b (the current, superseding document) must appear in research_graph_documents';
  end if;
  if exists (select 1 from public.research_graph_documents where document_id = '10000000-0000-0000-0000-000000000002') then
    raise exception 'D2 (superseded) must not appear in research_graph_documents';
  end if;
  if exists (select 1 from public.research_graph_documents where document_id = '10000000-0000-0000-0000-000000000004') then
    raise exception 'D4 (veterinary_methodology) must not appear in research_graph_documents';
  end if;

  -- research_graph_claims: exactly CL1. CL2 (superseded doc), CL3
  -- (veterinary_methodology), CL4 (draft), CL5 (rejected), CL6 (queued) all excluded.
  select count(*) into v_count from public.research_graph_claims;
  if v_count <> 1 then
    raise exception 'expected 1 eligible claim, got %', v_count;
  end if;
  if not exists (select 1 from public.research_graph_claims where claim_id = '30000000-0000-0000-0000-000000000001') then
    raise exception 'CL1 must appear in research_graph_claims';
  end if;
  if exists (select 1 from public.research_graph_claims where claim_id in (
    '30000000-0000-0000-0000-000000000002',
    '30000000-0000-0000-0000-000000000003',
    '30000000-0000-0000-0000-000000000004',
    '30000000-0000-0000-0000-000000000005',
    '30000000-0000-0000-0000-000000000006'
  )) then
    raise exception 'ineligible claims (superseded-doc, veterinary_methodology, draft, rejected, queued) must not appear in research_graph_claims';
  end if;

  -- research_graph_clusters: exactly CU1 and CU4 (both active). CU2 queued, CU3 rejected excluded.
  select count(*) into v_count from public.research_graph_clusters;
  if v_count <> 2 then
    raise exception 'expected 2 active clusters, got %', v_count;
  end if;
  if exists (select 1 from public.research_graph_clusters where cluster_id in (
    '40000000-0000-0000-0000-000000000002', '40000000-0000-0000-0000-000000000003'
  )) then
    raise exception 'queued/rejected clusters must not appear in research_graph_clusters';
  end if;

  -- MEMBER_OF: exactly (CL1, CU1). (CL4, CU1) excluded because CL4 is draft.
  -- (CL1, CU2) excluded because CU2 is queued.
  select count(*) into v_count from public.research_graph_edges_member_of;
  if v_count <> 1 then
    raise exception 'expected exactly 1 MEMBER_OF edge, got %', v_count;
  end if;
  if not exists (
    select 1 from public.research_graph_edges_member_of
    where claim_id = '30000000-0000-0000-0000-000000000001'
      and cluster_id = '40000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'expected MEMBER_OF edge between CL1 and CU1';
  end if;

  -- Direction edges: CU1 (supports) present; CU4 (neutral) absent.
  select count(*) into v_count from public.research_graph_edges_direction;
  if v_count <> 1 then
    raise exception 'expected exactly 1 directional edge, got %', v_count;
  end if;
  if not exists (
    select 1 from public.research_graph_edges_direction
    where cluster_id = '40000000-0000-0000-0000-000000000001' and edge_type = 'SUPPORTS'
  ) then
    raise exception 'expected SUPPORTS edge for CU1';
  end if;
  if exists (
    select 1 from public.research_graph_edges_direction
    where cluster_id = '40000000-0000-0000-0000-000000000004'
  ) then
    raise exception 'neutral-direction cluster CU4 must not produce a directional edge';
  end if;

  -- CONCERNS: CL1 has applies_to_condition = 'colitis'.
  select count(*) into v_count from public.research_graph_edges_concerns;
  if v_count <> 1 then
    raise exception 'expected exactly 1 CONCERNS edge, got %', v_count;
  end if;

  -- APPLIES_TO: only CU1's applicability row (CU2 is queued, excluded via join).
  select count(*) into v_count from public.research_graph_edges_applies_to;
  if v_count <> 1 then
    raise exception 'expected exactly 1 APPLIES_TO edge, got %', v_count;
  end if;
  if not exists (
    select 1 from public.research_graph_edges_applies_to
    where cluster_id = '40000000-0000-0000-0000-000000000001'
  ) then
    raise exception 'expected APPLIES_TO edge for CU1';
  end if;

  -- Concept nodes: derived only from eligible rows -- 'fibre' (from excluded
  -- CL2) must not leak in; 'grading methodology' (from excluded CL3) must not
  -- leak in.
  if exists (select 1 from public.research_graph_concept_nodes where concept_key = 'fibre') then
    raise exception 'concept node from an ineligible claim (fibre, CL2) leaked into the projection';
  end if;
  if exists (select 1 from public.research_graph_concept_nodes where concept_key = 'grading methodology') then
    raise exception 'concept node from an ineligible claim (grading methodology, CL3) leaked into the projection';
  end if;
  if not exists (select 1 from public.research_graph_concept_nodes where concept_type = 'ingredient' and concept_key = 'green lentil') then
    raise exception 'expected concept node green lentil from eligible claim/cluster';
  end if;
  if not exists (select 1 from public.research_graph_concept_nodes where concept_type = 'condition' and concept_key = 'colitis') then
    raise exception 'expected concept node colitis (from claim.applies_to_condition and cluster.outcome_value)';
  end if;

  raise notice 'P3 graph projection assertions: ALL PASSED';
end
$$;

-- RLS/grant assertions: anon/authenticated must have no access to any graph view.
do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'research_graph_%'
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_count <> 0 then
    raise exception 'expected zero anon/authenticated/PUBLIC grants on research_graph_* views, found %', v_count;
  end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name like 'research_graph_%'
    and grantee = 'service_role'
    and privilege_type = 'SELECT';
  if v_count <> 9 then
    raise exception 'expected exactly 9 service_role SELECT grants (one per research_graph_* view), found %', v_count;
  end if;

  raise notice 'P3 grant assertions: ALL PASSED';
end
$$;
