-- P6: recurring missions -- system-actor identity for research_missions.
--
-- Every prior mission was created by an authenticated admin
-- (research_missions.requested_by uuid not null references auth.users(id)).
-- A scheduled/recurring trigger has no human requester, so this migration
-- extends research_missions with the same system/owner actor distinction
-- research_mission_events and the P5 propagate_research_document_status_change
-- RPC already use, rather than inventing a new convention or faking a human
-- actor with a placeholder auth.users row.
--
-- research_ingestion_jobs.requested_by (defined in
-- 20260729133601_research_brain_workflow.sql) is also relaxed to nullable:
-- every row in that table is created exclusively through the mission
-- lifecycle RPCs below (enforced by the existing
-- "current research operations use the shared mission lifecycle" test), so a
-- system-requested mission's linked job must be able to carry the same null
-- requested_by. research_missions.requested_by_actor_type remains the single
-- source of truth for who/what a mission's actor is; the job row does not
-- duplicate that column.

alter table public.research_missions
  alter column requested_by drop not null;

alter table public.research_missions
  add column requested_by_actor_type text not null default 'owner'
    check (requested_by_actor_type in ('owner', 'system'));

alter table public.research_missions
  add constraint research_missions_owner_actor_check
    check (requested_by_actor_type <> 'owner' or requested_by is not null);

alter table public.research_ingestion_jobs
  alter column requested_by drop not null;

-- Recreate start_research_mission_job with the new p_requested_by_actor_type
-- parameter. This changes the function's argument list, so the old
-- 9-parameter overload must be dropped explicitly first -- CREATE OR REPLACE
-- cannot add a parameter to an existing signature; leaving both would create
-- an ambiguous overload for PostgREST's named-parameter RPC dispatch.
drop function if exists public.start_research_mission_job(
  text, text, text, text, uuid, jsonb, text, text, text
);

create function public.start_research_mission_job(
  p_mission_type text,
  p_objective text,
  p_stage_key text,
  p_job_type text,
  p_requested_by uuid,
  p_input jsonb default '{}'::jsonb,
  p_initial_status text default 'running',
  p_gateway_model text default null,
  p_idempotency_key text default null,
  p_requested_by_actor_type text default 'owner'
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  new_mission public.research_missions%rowtype;
  new_stage public.research_mission_stages%rowtype;
  new_job public.research_ingestion_jobs%rowtype;
  existing_job public.research_ingestion_jobs%rowtype;
  started_time timestamptz;
begin
  if p_initial_status not in ('queued', 'running') then
    raise exception 'Initial research mission job status must be queued or running';
  end if;
  if jsonb_typeof(coalesce(p_input, '{}'::jsonb)) <> 'object' then
    raise exception 'Research mission input must be a JSON object';
  end if;
  if p_requested_by_actor_type not in ('owner', 'system') then
    raise exception 'Unsupported requested_by_actor_type: %', p_requested_by_actor_type;
  end if;
  if p_requested_by_actor_type = 'owner' and p_requested_by is null then
    raise exception 'An owner-requested mission requires p_requested_by';
  end if;

  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 1));
    select job.*
    into existing_job
    from public.research_mission_stages stage
    join public.research_ingestion_jobs job on job.mission_stage_id = stage.id
    where stage.idempotency_key = p_idempotency_key;
    if existing_job.id is not null then
      if existing_job.requested_by is distinct from p_requested_by
        or existing_job.job_type <> p_job_type
        or existing_job.input <> coalesce(p_input, '{}'::jsonb)
        or not exists (
          select 1
          from public.research_mission_stages stage
          join public.research_missions mission on mission.id = stage.mission_id
          where stage.id = existing_job.mission_stage_id
            and stage.stage_key = p_stage_key
            and mission.mission_type = p_mission_type
            and mission.requested_by_actor_type = p_requested_by_actor_type
        ) then
        raise exception 'Research mission idempotency key was reused for different input';
      end if;
      return to_jsonb(existing_job);
    end if;
  end if;

  started_time := case when p_initial_status = 'running' then now() else null end;

  insert into public.research_missions (
    mission_type,
    objective,
    status,
    requested_by,
    requested_by_actor_type,
    input,
    current_stage_key,
    started_at
  ) values (
    p_mission_type,
    p_objective,
    p_initial_status,
    p_requested_by,
    p_requested_by_actor_type,
    coalesce(p_input, '{}'::jsonb),
    p_stage_key,
    started_time
  )
  returning * into new_mission;

  insert into public.research_mission_stages (
    mission_id,
    stage_key,
    status,
    idempotency_key,
    input,
    started_at
  ) values (
    new_mission.id,
    p_stage_key,
    case when p_initial_status = 'running' then 'running' else 'pending' end,
    p_idempotency_key,
    coalesce(p_input, '{}'::jsonb),
    started_time
  )
  returning * into new_stage;

  insert into public.research_ingestion_jobs (
    job_type,
    status,
    requested_by,
    input,
    gateway_model,
    started_at,
    mission_id,
    mission_stage_id
  ) values (
    p_job_type,
    p_initial_status,
    p_requested_by,
    coalesce(p_input, '{}'::jsonb),
    p_gateway_model,
    started_time,
    new_mission.id,
    new_stage.id
  )
  returning * into new_job;

  perform public.append_research_mission_event(
    new_mission.id,
    null,
    'mission.created',
    p_requested_by_actor_type,
    p_requested_by,
    jsonb_build_object(
      'mission_type', p_mission_type,
      'status', p_initial_status,
      'job_id', new_job.id
    )
  );
  perform public.append_research_mission_event(
    new_mission.id,
    new_stage.id,
    case when p_initial_status = 'running' then 'stage.started' else 'stage.queued' end,
    p_requested_by_actor_type,
    p_requested_by,
    jsonb_build_object(
      'stage_key', p_stage_key,
      'attempt_number', 1,
      'job_id', new_job.id
    )
  );

  return to_jsonb(new_job);
end;
$$;

-- retry_research_mission_job_stage keeps its original 3-parameter signature
-- (retries in this phase are always human-initiated -- there is no automated
-- retry path), so CREATE OR REPLACE is valid here. Only the ownership check
-- changes: a system-requested mission has no single human owner to match
-- against, so any authenticated admin (already required by the calling
-- route's requireAdmin gate) may retry it. An owner-requested mission keeps
-- its original same-requester requirement unchanged. The identity comparison
-- is also made null-safe (IS DISTINCT FROM) for correctness now that
-- requested_by can be null.
create or replace function public.retry_research_mission_job_stage(
  p_failed_job_id uuid,
  p_requested_by uuid,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  failed_job public.research_ingestion_jobs%rowtype;
  failed_stage public.research_mission_stages%rowtype;
  linked_mission public.research_missions%rowtype;
  retry_stage public.research_mission_stages%rowtype;
  retry_job public.research_ingestion_jobs%rowtype;
  existing_job public.research_ingestion_jobs%rowtype;
  next_attempt smallint;
begin
  if p_idempotency_key is not null then
    perform pg_advisory_xact_lock(hashtextextended(p_idempotency_key, 2));
  end if;

  select * into failed_job
  from public.research_ingestion_jobs
  where id = p_failed_job_id
  for update;
  if failed_job.id is null
    or failed_job.status <> 'failed'
    or failed_job.mission_id is null
    or failed_job.mission_stage_id is null then
    raise exception 'Only a failed linked research mission job can be retried';
  end if;

  select * into failed_stage
  from public.research_mission_stages
  where id = failed_job.mission_stage_id
  for update;
  if failed_stage.id is null or failed_stage.status <> 'failed' then
    raise exception 'Failed research mission stage not found';
  end if;

  select * into linked_mission
  from public.research_missions
  where id = failed_job.mission_id
  for update;
  if linked_mission.id is null
    or (
      linked_mission.requested_by_actor_type = 'owner'
      and linked_mission.requested_by is distinct from p_requested_by
    ) then
    raise exception 'Research mission retry requester does not match mission owner';
  end if;

  if p_idempotency_key is not null then
    select job.*
    into existing_job
    from public.research_mission_stages stage
    join public.research_ingestion_jobs job on job.mission_stage_id = stage.id
    where stage.idempotency_key = p_idempotency_key;
    if existing_job.id is not null then
      if existing_job.requested_by is distinct from p_requested_by
        or not exists (
          select 1
          from public.research_mission_stages stage
          where stage.id = existing_job.mission_stage_id
            and stage.retry_of_stage_id = failed_stage.id
        ) then
        raise exception 'Research retry idempotency key was reused for a different attempt';
      end if;
      return to_jsonb(existing_job);
    end if;
  end if;

  select job.*
  into existing_job
  from public.research_mission_stages stage
  join public.research_ingestion_jobs job on job.mission_stage_id = stage.id
  where stage.retry_of_stage_id = failed_stage.id
  order by stage.attempt_number desc
  limit 1;
  if existing_job.id is not null then
    return to_jsonb(existing_job);
  end if;

  select (coalesce(max(attempt_number), 0) + 1)::smallint
  into next_attempt
  from public.research_mission_stages
  where mission_id = failed_stage.mission_id
    and stage_key = failed_stage.stage_key;

  insert into public.research_mission_stages (
    mission_id,
    stage_key,
    attempt_number,
    retry_of_stage_id,
    status,
    idempotency_key,
    input
  ) values (
    failed_stage.mission_id,
    failed_stage.stage_key,
    next_attempt,
    failed_stage.id,
    'pending',
    p_idempotency_key,
    failed_job.input
  )
  returning * into retry_stage;

  insert into public.research_ingestion_jobs (
    job_type,
    status,
    requested_by,
    input,
    gateway_model,
    mission_id,
    mission_stage_id
  ) values (
    failed_job.job_type,
    'queued',
    p_requested_by,
    failed_job.input,
    failed_job.gateway_model,
    failed_job.mission_id,
    retry_stage.id
  )
  returning * into retry_job;

  update public.research_missions
  set
    status = 'queued',
    current_stage_key = failed_stage.stage_key,
    result_summary = '{}'::jsonb,
    terminal_reason_code = null,
    terminal_message = null,
    completed_at = null
  where id = failed_job.mission_id;

  perform public.append_research_mission_event(
    failed_job.mission_id,
    retry_stage.id,
    'stage.retry_queued',
    'owner',
    p_requested_by,
    jsonb_build_object(
      'job_id', retry_job.id,
      'retry_of_job_id', failed_job.id,
      'retry_of_stage_id', failed_stage.id,
      'attempt_number', next_attempt
    )
  );
  perform public.append_research_mission_event(
    failed_job.mission_id,
    null,
    'mission.retry_queued',
    'owner',
    p_requested_by,
    jsonb_build_object(
      'job_id', retry_job.id,
      'retry_of_job_id', failed_job.id,
      'stage_key', failed_stage.stage_key,
      'attempt_number', next_attempt
    )
  );

  return to_jsonb(retry_job);
end;
$$;

revoke execute on function public.start_research_mission_job(
  text, text, text, text, uuid, jsonb, text, text, text, text
) from public, anon, authenticated;
grant execute on function public.start_research_mission_job(
  text, text, text, text, uuid, jsonb, text, text, text, text
) to service_role;

revoke execute on function public.retry_research_mission_job_stage(uuid, uuid, text)
  from public, anon, authenticated;
grant execute on function public.retry_research_mission_job_stage(uuid, uuid, text)
  to service_role;
