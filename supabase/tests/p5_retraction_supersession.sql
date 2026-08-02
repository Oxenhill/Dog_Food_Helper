-- P5 atomic retraction/supersession propagation assertions.
-- Run against supabase/tests/p3_minimal_research_fixture.sql plus
-- supabase/migrations/20260802170000_research_graph_projection.sql plus
-- supabase/migrations/20260802190000_research_document_study_family.sql plus
-- supabase/migrations/20260802210000_research_retraction_supersession_propagation.sql
-- applied on top, in that order. Disposable validation only.

-- The shared p3 fixture reconstructs only what P3's graph projection needed
-- and predates abstract_only (a real production research_documents column
-- researchStudyFamily.ts already reads, added by
-- 20260728200000_research_claims_and_grading.sql, out of scope for the p3
-- fixture). P5's study-family promotion ranking needs it.
alter table public.research_documents
  add column if not exists abstract_only boolean not null default true,
  add column if not exists retraction_checked_at timestamptz;

create extension if not exists pgcrypto;

-- research_evidence_lifecycle_events.actor_id is a real FK to auth.users
-- (matching production's research_claims.reviewed_by pattern), unlike the
-- p3 fixture's plain-uuid workaround for reviewed_by/last_edited_by. The
-- disposable postgres image's auth.users is writable by the postgres
-- superuser, so a real fixture row is used here instead of dropping the FK.
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-000000000001', 'p5-test-owner@example.invalid')
on conflict (id) do nothing;

-- A fixed reviewer id so review-related check constraints are satisfiable.
-- ============ Scenario A: plain retraction, single claim, no clusters, no family ============

insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, abstract_only)
values
  ('a0000000-0000-0000-0000-000000000001', 'Scenario A source', false, 'dog', 'rct', 30, true, false, false);

insert into public.research_chunks (id, document_id, content) values
  ('a0000000-0000-0000-0000-000000000002', 'a0000000-0000-0000-0000-000000000001',
   'Pumpkin fibre improved stool consistency in adult dogs.');

insert into public.research_claims
  (id, document_id, chunk_id, supporting_quote, subject_type, subject_value,
   direction, effect_summary, claim_identity, status, reviewed_by, reviewed_at)
values
  ('a0000000-0000-0000-0000-000000000003',
   'a0000000-0000-0000-0000-000000000001',
   'a0000000-0000-0000-0000-000000000002',
   'improved stool consistency',
   'ingredient', 'pumpkin', 'supports',
   'Improved stool consistency in adult dogs.',
   repeat('c1', 32), 'active',
   '00000000-0000-0000-0000-000000000001', now());

do $$
declare
  v_event public.research_evidence_lifecycle_events;
begin
  select * into v_event from public.propagate_research_document_status_change(
    'a0000000-0000-0000-0000-000000000001'::uuid,
    'retract',
    null,
    '00000000-0000-0000-0000-000000000001'::uuid,
    'owner',
    'Scenario A: test retraction, no replacement.'
  );

  if v_event.event_type <> 'retracted' then
    raise exception 'expected event_type retracted, got %', v_event.event_type;
  end if;
  if v_event.affected_claim_ids <> array['a0000000-0000-0000-0000-000000000003'::uuid] then
    raise exception 'expected affected_claim_ids to contain the one active claim, got %', v_event.affected_claim_ids;
  end if;
  if v_event.promoted_primary_document_id is not null then
    raise exception 'no study family existed; promoted_primary_document_id must be null, got %', v_event.promoted_primary_document_id;
  end if;

  if (select retracted from public.research_documents where id = 'a0000000-0000-0000-0000-000000000001') is not true then
    raise exception 'document was not marked retracted';
  end if;
  if (select status from public.research_claims where id = 'a0000000-0000-0000-0000-000000000003') <> 'superseded' then
    raise exception 'claim was not transitioned to superseded';
  end if;

  if not exists (
    select 1 from public.research_graph_edges_retracted_by
    where document_id = 'a0000000-0000-0000-0000-000000000001'
      and reason = 'Scenario A: test retraction, no replacement.'
  ) then
    raise exception 'expected RETRACTED_BY graph edge for the retracted document';
  end if;

  raise notice 'Scenario A (plain retraction): ALL PASSED';
end
$$;

-- Idempotency guard: calling it again on the same document must fail loudly,
-- not silently re-apply.
do $$
begin
  begin
    perform public.propagate_research_document_status_change(
      'a0000000-0000-0000-0000-000000000001'::uuid,
      'retract', null,
      '00000000-0000-0000-0000-000000000001'::uuid, 'owner', 'second attempt'
    );
    raise exception 'expected re-retraction of an already-retracted document to fail';
  exception
    when others then
      if position('already retracted' in sqlerrm) = 0 then
        raise exception 'unexpected error re-retracting: %', sqlerrm;
      end if;
  end;
end
$$;

-- ============ Scenario B: cluster with two independent claims -- retracting
-- one document's claim must NOT invalidate the cluster (still supported by
-- the other document's active claim). ============

insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, abstract_only)
values
  ('b0000000-0000-0000-0000-000000000001', 'Scenario B source 1', false, 'dog', 'rct', 30, true, false, false),
  ('b0000000-0000-0000-0000-000000000002', 'Scenario B source 2', false, 'dog', 'rct', 40, true, false, false);

insert into public.research_chunks (id, document_id, content) values
  ('b0000000-0000-0000-0000-000000000003', 'b0000000-0000-0000-0000-000000000001',
   'Green lentils reduced inflammatory markers in dogs with colitis.'),
  ('b0000000-0000-0000-0000-000000000004', 'b0000000-0000-0000-0000-000000000002',
   'Green lentils reduced inflammatory markers in a second independent cohort.');

insert into public.research_claims
  (id, document_id, chunk_id, supporting_quote, subject_type, subject_value,
   direction, effect_summary, claim_identity, status, reviewed_by, reviewed_at)
values
  ('b0000000-0000-0000-0000-000000000005',
   'b0000000-0000-0000-0000-000000000001',
   'b0000000-0000-0000-0000-000000000003',
   'reduced inflammatory markers',
   'ingredient', 'green lentil', 'supports',
   'Reduced inflammatory markers in dogs with colitis.',
   repeat('c2', 32), 'active',
   '00000000-0000-0000-0000-000000000001', now()),
  ('b0000000-0000-0000-0000-000000000006',
   'b0000000-0000-0000-0000-000000000002',
   'b0000000-0000-0000-0000-000000000004',
   'reduced inflammatory markers',
   'ingredient', 'green lentil', 'supports',
   'Reduced inflammatory markers in a second independent cohort.',
   repeat('c3', 32), 'active',
   '00000000-0000-0000-0000-000000000001', now());

insert into public.research_evidence_clusters
  (id, cluster_identity, label, subject_type, subject_value, outcome_type,
   outcome_value, direction, cautious_summary, status, reviewed_by, reviewed_at)
values
  ('b0000000-0000-0000-0000-000000000007', repeat('d1', 32), 'Green lentil and colitis',
   'ingredient', 'green lentil', 'condition', 'colitis', 'supports',
   'Limited evidence suggests reduced inflammatory markers.', 'active',
   '00000000-0000-0000-0000-000000000001', now());

insert into public.research_evidence_cluster_members (cluster_id, claim_id, relationship, independently_reviewed) values
  ('b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000005', 'same_proposition', true),
  ('b0000000-0000-0000-0000-000000000007', 'b0000000-0000-0000-0000-000000000006', 'same_proposition', true);

do $$
declare
  v_event public.research_evidence_lifecycle_events;
begin
  select * into v_event from public.propagate_research_document_status_change(
    'b0000000-0000-0000-0000-000000000001'::uuid,
    'retract', null,
    '00000000-0000-0000-0000-000000000001'::uuid, 'owner',
    'Scenario B: retracting one of two independently-supporting documents.'
  );

  if v_event.affected_cluster_ids <> '{}'::uuid[] then
    raise exception 'cluster still has an active member claim (from document 2) and must not be transitioned, got affected_cluster_ids=%', v_event.affected_cluster_ids;
  end if;
  if (select status from public.research_evidence_clusters where id = 'b0000000-0000-0000-0000-000000000007') <> 'active' then
    raise exception 'cluster with a remaining active member claim must stay active';
  end if;
  if (select status from public.research_claims where id = 'b0000000-0000-0000-0000-000000000006') <> 'active' then
    raise exception 'the unrelated document''s claim must remain active';
  end if;

  raise notice 'Scenario B (cluster survives partial retraction): ALL PASSED';
end
$$;

-- Now retract the SECOND (last remaining) supporting document -- the cluster
-- must now transition too, since it has zero remaining active members.
do $$
declare
  v_event public.research_evidence_lifecycle_events;
begin
  select * into v_event from public.propagate_research_document_status_change(
    'b0000000-0000-0000-0000-000000000002'::uuid,
    'retract', null,
    '00000000-0000-0000-0000-000000000001'::uuid, 'owner',
    'Scenario B continued: retracting the last remaining supporting document.'
  );

  if v_event.affected_cluster_ids <> array['b0000000-0000-0000-0000-000000000007'::uuid] then
    raise exception 'expected the now-fully-unsupported cluster to be transitioned, got %', v_event.affected_cluster_ids;
  end if;
  if (select status from public.research_evidence_clusters where id = 'b0000000-0000-0000-0000-000000000007') <> 'superseded' then
    raise exception 'cluster with zero remaining active member claims must be transitioned to superseded';
  end if;

  raise notice 'Scenario B continued (cluster transitions when last support is retracted): ALL PASSED';
end
$$;

-- ============ Scenario C: supersession with a replacement document ============

insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, abstract_only)
values
  ('c0000000-0000-0000-0000-000000000001', 'Scenario C original', false, 'dog', 'cohort', 25, true, false, false),
  ('c0000000-0000-0000-0000-000000000002', 'Scenario C replacement (larger follow-up)', false, 'dog', 'rct', 60, true, false, false);

do $$
declare
  v_event public.research_evidence_lifecycle_events;
begin
  select * into v_event from public.propagate_research_document_status_change(
    'c0000000-0000-0000-0000-000000000001'::uuid,
    'supersede',
    'c0000000-0000-0000-0000-000000000002'::uuid,
    '00000000-0000-0000-0000-000000000001'::uuid, 'owner',
    'Scenario C: superseded by a larger follow-up study.'
  );

  if v_event.event_type <> 'superseded' then
    raise exception 'expected event_type superseded, got %', v_event.event_type;
  end if;
  if (select superseded_by from public.research_documents where id = 'c0000000-0000-0000-0000-000000000001')
     <> 'c0000000-0000-0000-0000-000000000002'::uuid then
    raise exception 'superseded_by was not set to the replacement document';
  end if;

  if not exists (
    select 1 from public.research_graph_edges_supersedes
    where old_document_id = 'c0000000-0000-0000-0000-000000000001'
      and new_document_id = 'c0000000-0000-0000-0000-000000000002'
  ) then
    raise exception 'expected SUPERSEDES graph edge from replacement to old document';
  end if;

  raise notice 'Scenario C (supersession): ALL PASSED';
end
$$;

-- A retracted replacement target must be rejected.
do $$
begin
  begin
    perform public.propagate_research_document_status_change(
      'a0000000-0000-0000-0000-000000000001'::uuid,
      'supersede', 'c0000000-0000-0000-0000-000000000001'::uuid,
      '00000000-0000-0000-0000-000000000001'::uuid, 'owner', 'invalid: already-retracted target'
    );
  exception
    when others then
      if position('already retracted' in sqlerrm) = 0 then
        raise exception 'unexpected error: %', sqlerrm;
      end if;
  end;
end
$$;

-- ============ Scenario D: study-family promotion on primary retraction ============

insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, abstract_only, evidence_grade)
values
  ('d0000000-0000-0000-0000-000000000001', 'Scenario D primary', false, 'dog', 'rct', 30, true, false, false, default);

-- Two duplicates: one weaker (preprint), one fuller (not preprint, better grade).
insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, abstract_only,
   duplicate_of_document_id, duplicate_match_basis, duplicate_detected_at)
values
  ('d0000000-0000-0000-0000-000000000002', 'Scenario D weaker duplicate (preprint)', false, 'dog', 'rct', 30, true, true, false,
   'd0000000-0000-0000-0000-000000000001',
   '{"method": "title_only", "title_similarity": 0.95}'::jsonb, now() - interval '2 days'),
  ('d0000000-0000-0000-0000-000000000003', 'Scenario D fuller duplicate', false, 'dog', 'rct', 30, true, false, false,
   'd0000000-0000-0000-0000-000000000001',
   '{"method": "title_only", "title_similarity": 0.96}'::jsonb, now() - interval '1 day');

do $$
declare
  v_event public.research_evidence_lifecycle_events;
begin
  select * into v_event from public.propagate_research_document_status_change(
    'd0000000-0000-0000-0000-000000000001'::uuid,
    'retract', null,
    '00000000-0000-0000-0000-000000000001'::uuid, 'owner',
    'Scenario D: primary retracted, fuller duplicate must be promoted.'
  );

  if v_event.promoted_primary_document_id <> 'd0000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'expected the fuller (non-preprint) duplicate to be promoted, got %', v_event.promoted_primary_document_id;
  end if;

  if (select duplicate_of_document_id from public.research_documents where id = 'd0000000-0000-0000-0000-000000000003')
     is not null then
    raise exception 'promoted primary must have duplicate_of_document_id = null';
  end if;
  if (select duplicate_of_document_id from public.research_documents where id = 'd0000000-0000-0000-0000-000000000002')
     <> 'd0000000-0000-0000-0000-000000000003'::uuid then
    raise exception 'the remaining (weaker) duplicate must be re-pointed to the newly promoted primary';
  end if;

  raise notice 'Scenario D (study-family auto-promotion): ALL PASSED';
end
$$;

-- ============ Scenario E: study-family orphaning when every duplicate is also retracted ============

insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, abstract_only)
values
  ('e0000000-0000-0000-0000-000000000001', 'Scenario E primary', false, 'dog', 'rct', 30, true, false, false),
  ('e0000000-0000-0000-0000-000000000002', 'Scenario E duplicate, already retracted', true, 'dog', 'rct', 30, true, false, false);

update public.research_documents
set duplicate_of_document_id = 'e0000000-0000-0000-0000-000000000001',
    duplicate_match_basis = '{"method": "title_only", "title_similarity": 0.99}'::jsonb,
    duplicate_detected_at = now()
where id = 'e0000000-0000-0000-0000-000000000002';

do $$
declare
  v_event public.research_evidence_lifecycle_events;
begin
  select * into v_event from public.propagate_research_document_status_change(
    'e0000000-0000-0000-0000-000000000001'::uuid,
    'retract', null,
    '00000000-0000-0000-0000-000000000001'::uuid, 'owner',
    'Scenario E: primary retracted, only duplicate is also retracted -- orphaned.'
  );

  if v_event.promoted_primary_document_id is not null then
    raise exception 'no eligible duplicate exists to promote, got %', v_event.promoted_primary_document_id;
  end if;
  if v_event.orphaned_duplicate_document_ids <> array['e0000000-0000-0000-0000-000000000002'::uuid] then
    raise exception 'expected the retracted duplicate to be recorded as orphaned, got %', v_event.orphaned_duplicate_document_ids;
  end if;

  raise notice 'Scenario E (orphaned family, disclosed not silently dropped): ALL PASSED';
end
$$;

-- ============ Scenario F: injected failure rolls back the entire transaction ============
--
-- A deliberately-triggered mid-transaction failure: a trigger on
-- research_evidence_clusters that raises whenever the sentinel cluster is
-- touched. The RPC's own steps run in this order: (1) document update,
-- (2) claim update, (3) cluster update [FAILS HERE], (4) study-family,
-- (5) audit insert. If steps 1-2 are not rolled back by the failure in
-- step 3, this is not real atomicity -- it is only "mostly worked."

insert into public.research_documents
  (id, title, retracted, species, study_design, sample_size, funding_independent, is_preprint, abstract_only)
values
  ('f0000000-0000-0000-0000-000000000001', 'Scenario F source', false, 'dog', 'rct', 30, true, false, false);

insert into public.research_chunks (id, document_id, content) values
  ('f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000001',
   'Chicken meal was well tolerated in adult dogs with no adverse effects.');

insert into public.research_claims
  (id, document_id, chunk_id, supporting_quote, subject_type, subject_value,
   direction, effect_summary, claim_identity, status, reviewed_by, reviewed_at)
values
  ('f0000000-0000-0000-0000-000000000003',
   'f0000000-0000-0000-0000-000000000001',
   'f0000000-0000-0000-0000-000000000002',
   'well tolerated',
   'ingredient', 'chicken meal', 'supports',
   'Well tolerated in adult dogs with no adverse effects.',
   repeat('c4', 32), 'active',
   '00000000-0000-0000-0000-000000000001', now());

insert into public.research_evidence_clusters
  (id, cluster_identity, label, subject_type, subject_value, outcome_type,
   outcome_value, direction, cautious_summary, status, reviewed_by, reviewed_at)
values
  ('f0000000-0000-0000-0000-000000000004', repeat('d2', 32), 'Chicken meal tolerance (SENTINEL)',
   'ingredient', 'chicken meal', 'condition', 'general_tolerance', 'supports',
   'Limited evidence suggests good tolerance.', 'active',
   '00000000-0000-0000-0000-000000000001', now());

insert into public.research_evidence_cluster_members (cluster_id, claim_id, relationship, independently_reviewed) values
  ('f0000000-0000-0000-0000-000000000004', 'f0000000-0000-0000-0000-000000000003', 'same_proposition', true);

create or replace function public.p5_test_injected_failure()
returns trigger
language plpgsql
as $$
begin
  if new.id = 'f0000000-0000-0000-0000-000000000004' then
    raise exception 'P5_TEST_INJECTED_FAILURE: simulated mid-transaction failure';
  end if;
  return new;
end;
$$;

create trigger p5_test_injected_failure_trigger
before update on public.research_evidence_clusters
for each row execute function public.p5_test_injected_failure();

do $$
declare
  v_pre_document_retracted boolean;
  v_pre_claim_status text;
  v_pre_event_count integer;
  v_caught boolean := false;
begin
  select retracted into v_pre_document_retracted
  from public.research_documents where id = 'f0000000-0000-0000-0000-000000000001';
  select status into v_pre_claim_status
  from public.research_claims where id = 'f0000000-0000-0000-0000-000000000003';
  select count(*) into v_pre_event_count from public.research_evidence_lifecycle_events;

  if v_pre_document_retracted is not false or v_pre_claim_status <> 'active' then
    raise exception 'test setup invariant broken: document/claim must start un-retracted/active';
  end if;

  begin
    perform public.propagate_research_document_status_change(
      'f0000000-0000-0000-0000-000000000001'::uuid,
      'retract', null,
      '00000000-0000-0000-0000-000000000001'::uuid, 'owner',
      'Scenario F: should never actually commit.'
    );
  exception
    when others then
      if position('P5_TEST_INJECTED_FAILURE' in sqlerrm) = 0 then
        raise exception 'expected the injected failure, got a different error: %', sqlerrm;
      end if;
      v_caught := true;
  end;

  if not v_caught then
    raise exception 'expected propagate_research_document_status_change to raise the injected failure';
  end if;

  -- The critical assertion: step 1 (document) and step 2 (claim) ran BEFORE
  -- the injected failure in step 3, inside the SAME function invocation. If
  -- this were not atomic, they would already be persisted here.
  if (select retracted from public.research_documents where id = 'f0000000-0000-0000-0000-000000000001') is not false then
    raise exception 'ROLLBACK FAILED: document retraction persisted despite the injected failure downstream';
  end if;
  if (select status from public.research_claims where id = 'f0000000-0000-0000-0000-000000000003') <> 'active' then
    raise exception 'ROLLBACK FAILED: claim transition persisted despite the injected failure downstream';
  end if;
  if (select status from public.research_evidence_clusters where id = 'f0000000-0000-0000-0000-000000000004') <> 'active' then
    raise exception 'ROLLBACK FAILED: cluster was left non-active despite the failure';
  end if;
  if (select count(*) from public.research_evidence_lifecycle_events) <> v_pre_event_count then
    raise exception 'ROLLBACK FAILED: an audit event was persisted despite the injected failure';
  end if;

  raise notice 'Scenario F (injected failure rolls back the entire transaction): ALL PASSED';
end
$$;

drop trigger p5_test_injected_failure_trigger on public.research_evidence_clusters;
drop function public.p5_test_injected_failure();

-- Prove the RPC still works normally after the injected-failure trigger is
-- removed (i.e. the earlier failure was isolated to that one call).
do $$
declare
  v_event public.research_evidence_lifecycle_events;
begin
  select * into v_event from public.propagate_research_document_status_change(
    'f0000000-0000-0000-0000-000000000001'::uuid,
    'retract', null,
    '00000000-0000-0000-0000-000000000001'::uuid, 'owner',
    'Scenario F re-run after removing the injected failure: should succeed cleanly.'
  );
  if (select retracted from public.research_documents where id = 'f0000000-0000-0000-0000-000000000001') is not true then
    raise exception 'expected the retry (without the injected failure) to succeed';
  end if;
  if (select status from public.research_evidence_clusters where id = 'f0000000-0000-0000-0000-000000000004') <> 'superseded' then
    raise exception 'expected the sentinel cluster to transition once the injected failure is gone';
  end if;
  raise notice 'Scenario F retry (clean success after removing the injected failure): ALL PASSED';
end
$$;

-- ============ RLS / grant assertions ============

do $$
declare
  v_count integer;
begin
  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'research_evidence_lifecycle_events'
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_count <> 0 then
    raise exception 'expected zero anon/authenticated/PUBLIC grants on research_evidence_lifecycle_events, found %', v_count;
  end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'research_evidence_lifecycle_events'
    and grantee = 'service_role'
    and privilege_type in ('SELECT', 'INSERT');
  if v_count <> 2 then
    raise exception 'expected exactly service_role SELECT+INSERT (no UPDATE/DELETE) on research_evidence_lifecycle_events, found %', v_count;
  end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name = 'research_evidence_lifecycle_events'
    and grantee = 'service_role'
    and privilege_type in ('UPDATE', 'DELETE');
  if v_count <> 0 then
    raise exception 'research_evidence_lifecycle_events must be append-only: found UPDATE/DELETE grants for service_role';
  end if;

  select count(*) into v_count
  from information_schema.role_table_grants
  where table_schema = 'public'
    and table_name in ('research_graph_edges_supersedes', 'research_graph_edges_retracted_by')
    and grantee in ('anon', 'authenticated', 'PUBLIC');
  if v_count <> 0 then
    raise exception 'expected zero anon/authenticated/PUBLIC grants on the new P5 graph views, found %', v_count;
  end if;

  raise notice 'P5 grant/RLS assertions: ALL PASSED';
end
$$;
