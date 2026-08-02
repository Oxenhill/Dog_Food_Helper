-- P6 acceptance assertions: recurrence cannot overlap itself, exceed caps,
-- bypass policy, or activate evidence. Run after
-- p6_pre_state_fixture.sql -> the real P0 mission-lifecycle migration -> the
-- real P6 (20260803090000) migration, in a disposable container.
--
-- "Exceed caps"/"activate evidence" for the discovery mission type are
-- proven by construction at the application layer (runDiscoveryMission never
-- touches research_claims/research_evidence_clusters/research_provider_calls
-- -- see the static assertions in researchRecurringMissions.test.ts). This
-- file proves the two properties that live in the database: overlap
-- prevention for a system actor, and the actor-identity invariants the new
-- schema introduces.

\set ON_ERROR_STOP on
\pset format unaligned
\pset tuples_only on

begin;

-- 1. A system-requested mission (no human requester) can be created.
select start_research_mission_job(
  'discovery',
  'Scheduled discovery cycle',
  'discovery',
  'discovery',
  null,
  '{"scheduled": true}'::jsonb,
  'running',
  null,
  'scheduled:discovery:monthly:2026-08',
  'system'
) as system_job_1 \gset

select case when (:'system_job_1'::jsonb ->> 'id') is not null
  then 'PASS: system-actor mission created'
  else 'FAIL: system-actor mission not created' end;

select case when (
    select requested_by is null and requested_by_actor_type = 'system'
    from research_missions
    where id = (:'system_job_1'::jsonb ->> 'mission_id')::uuid
  ) then 'PASS: mission row has null requested_by and system actor_type'
  else 'FAIL: mission row actor identity wrong' end;

-- 2. Overlap prevention: a second call with the SAME idempotency key (the
-- exact scenario a duplicate/overlapping cron trigger within the same
-- calendar month produces) must return the SAME job/mission, not create a
-- second one.
select count(*) as mission_count_before from research_missions;
select start_research_mission_job(
  'discovery',
  'Scheduled discovery cycle',
  'discovery',
  'discovery',
  null,
  '{"scheduled": true}'::jsonb,
  'running',
  null,
  'scheduled:discovery:monthly:2026-08',
  'system'
) as system_job_1_retrigger \gset

select case when (:'system_job_1_retrigger'::jsonb ->> 'id') = (:'system_job_1'::jsonb ->> 'id')
  then 'PASS: duplicate trigger within the same cycle reused the same job'
  else 'FAIL: duplicate trigger created a different job' end;

select case when (select count(*) from research_missions) = 1
  then 'PASS: overlap did not create a second mission'
  else 'FAIL: overlap created ' || (select count(*) from research_missions)::text || ' missions' end;

-- 3. The same idempotency key reused with different input must be rejected
-- (defence against the idempotency key alone being trusted blindly for
-- identity -- input must match too).
do $$
begin
  perform start_research_mission_job(
    'discovery', 'Scheduled discovery cycle', 'discovery', 'discovery',
    null, '{"scheduled": true, "different": true}'::jsonb, 'running', null,
    'scheduled:discovery:monthly:2026-08', 'system'
  );
  raise exception 'FAIL: reused idempotency key with different input did not raise';
exception
  when others then
    if sqlerrm like '%idempotency key was reused for different input%' then
      raise notice 'PASS: reused idempotency key with different input correctly rejected';
    else
      raise exception 'FAIL: wrong error for reused key: %', sqlerrm;
    end if;
end $$;

-- 4. An owner-requested mission still requires a real requester (unchanged
-- regression behaviour, and the new check constraint is real, not just
-- documented).
do $$
begin
  perform start_research_mission_job(
    'discovery', 'Manual discovery', 'discovery', 'discovery',
    null, '{}'::jsonb, 'running', null, null, 'owner'
  );
  raise exception 'FAIL: owner-actor mission with null requested_by did not raise';
exception
  when others then
    if sqlerrm like '%requires p_requested_by%' then
      raise notice 'PASS: owner-actor mission without a requester correctly rejected';
    else
      raise exception 'FAIL: wrong error for owner without requester: %', sqlerrm;
    end if;
end $$;

-- 5. requested_by_actor_type is restricted to owner/system (no 'worker' or
-- arbitrary value can create a mission).
do $$
begin
  perform start_research_mission_job(
    'discovery', 'Bad actor type', 'discovery', 'discovery',
    '11111111-1111-1111-1111-111111111111', '{}'::jsonb, 'running', null, null, 'worker'
  );
  raise exception 'FAIL: worker actor_type was accepted for mission creation';
exception
  when others then
    if sqlerrm like '%Unsupported requested_by_actor_type%' then
      raise notice 'PASS: unsupported requested_by_actor_type correctly rejected';
    else
      raise exception 'FAIL: wrong error for bad actor_type: %', sqlerrm;
    end if;
end $$;

-- 6. The table-level constraint is also real (defence in depth: a direct
-- insert bypassing the RPC is still rejected).
do $$
begin
  insert into research_missions (mission_type, objective, requested_by, requested_by_actor_type)
  values ('discovery', 'direct insert bypass attempt', null, 'owner');
  raise exception 'FAIL: direct insert with owner actor_type and null requested_by succeeded';
exception
  when others then
    if sqlerrm like '%research_missions_owner_actor_check%' then
      raise notice 'PASS: table-level owner-actor check constraint enforced';
    else
      raise exception 'FAIL: wrong error for direct insert bypass: %', sqlerrm;
    end if;
end $$;

-- 7. An admin can retry a system-requested mission's failed stage (no single
-- human "owns" a scheduled mission), while an owner-requested mission's
-- retry ownership check is unchanged.
select start_research_mission_job(
  'discovery', 'Scheduled discovery cycle 2', 'discovery', 'discovery',
  null, '{}'::jsonb, 'running', null, 'scheduled:discovery:monthly:2026-09', 'system'
) as system_job_2 \gset

update research_ingestion_jobs
  set status = 'failed', error_message = 'injected failure for test'
  where id = (:'system_job_2'::jsonb ->> 'id')::uuid;
update research_mission_stages
  set status = 'failed', completed_at = now(), reason_code = 'injected_test_failure'
  where id = (:'system_job_2'::jsonb ->> 'mission_stage_id')::uuid;

select retry_research_mission_job_stage(
  (:'system_job_2'::jsonb ->> 'id')::uuid,
  '11111111-1111-1111-1111-111111111111',
  null
) as system_retry \gset

select case when (:'system_retry'::jsonb ->> 'id') is not null
  then 'PASS: an admin retried a system-requested mission stage'
  else 'FAIL: admin could not retry a system-requested mission' end;

select start_research_mission_job(
  'discovery', 'Manual discovery 2', 'discovery', 'discovery',
  '11111111-1111-1111-1111-111111111111', '{}'::jsonb, 'running', null,
  'manual:owner1:test', 'owner'
) as owner_job \gset

update research_ingestion_jobs
  set status = 'failed', error_message = 'injected failure for test'
  where id = (:'owner_job'::jsonb ->> 'id')::uuid;
update research_mission_stages
  set status = 'failed', completed_at = now(), reason_code = 'injected_test_failure'
  where id = (:'owner_job'::jsonb ->> 'mission_stage_id')::uuid;

-- psql client-side :'var' substitution does not reach inside a $$-quoted
-- plpgsql body, so the failed job is re-looked-up here via SQL instead of
-- the captured owner_job psql variable.
do $$
declare
  v_job_id uuid;
begin
  select job.id into v_job_id
  from public.research_mission_stages stage
  join public.research_ingestion_jobs job on job.mission_stage_id = stage.id
  where stage.idempotency_key = 'manual:owner1:test';

  perform retry_research_mission_job_stage(
    v_job_id,
    '22222222-2222-2222-2222-222222222222',
    null
  );
  raise exception 'FAIL: a different admin retried another owner''s mission';
exception
  when others then
    if sqlerrm like '%retry requester does not match mission owner%' then
      raise notice 'PASS: owner-requested mission retry ownership still enforced';
    else
      raise exception 'FAIL: wrong error for cross-owner retry: %', sqlerrm;
    end if;
end $$;

-- 8. Grants: the new/updated functions remain service_role-only.
select case when not exists (
    select 1 from information_schema.routine_privileges
    where routine_name = 'start_research_mission_job'
      and grantee in ('anon', 'authenticated', 'PUBLIC')
  ) then 'PASS: start_research_mission_job has no anon/authenticated/PUBLIC grant'
  else 'FAIL: start_research_mission_job is exposed to anon/authenticated/PUBLIC' end;

select case when exists (
    select 1 from information_schema.routine_privileges
    where routine_name = 'start_research_mission_job'
      and grantee = 'service_role'
      and privilege_type = 'EXECUTE'
  ) then 'PASS: start_research_mission_job is executable by service_role'
  else 'FAIL: start_research_mission_job is missing its service_role grant' end;

rollback;
