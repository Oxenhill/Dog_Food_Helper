-- Behavioral assertions for a disposable database after the real P0, P1, and
-- candidate P2 migrations have been applied in order.

do $$
declare
  owner_id constant uuid := '10000000-0000-4000-8000-000000000001';
  first_job jsonb;
  retry_job jsonb;
  first_job_id uuid;
  retry_job_id uuid;
  target_mission_id uuid;
  first_stage_id uuid;
  retry_stage_id uuid;
  route_id uuid;
  voyage_rate_id uuid;
  sonnet_rate_id uuid;
  reservation jsonb;
  completion jsonb;
  replay jsonb;
  halt jsonb;
  call_id uuid;
  row_count bigint;
  total_actual bigint;
  total_estimated bigint;
  mission_status text;
  stage_status text;
  job_status text;
  caught_expected boolean;
begin
  insert into auth.users (id) values (owner_id);

  first_job := public.start_research_mission_job(
    p_mission_type => 'source_import',
    p_objective => 'Isolated P2 provider telemetry validation',
    p_stage_key => 'document_ingestion',
    p_job_type => 'embed',
    p_requested_by => owner_id,
    p_input => '{"fixture":true}'::jsonb,
    p_initial_status => 'running',
    p_gateway_model => 'voyage/voyage-4',
    p_idempotency_key => 'p2-isolated-first'
  );
  first_job_id := (first_job ->> 'id')::uuid;

  select mission_id, mission_stage_id
  into target_mission_id, first_stage_id
  from public.research_ingestion_jobs
  where id = first_job_id;

  select route.id
  into route_id
  from public.research_mission_stages stage
  join public.research_model_stage_routes route
    on route.stage_configuration_version_id = stage.model_stage_configuration_version_id
  where stage.id = first_stage_id
    and route.route_key = 'semantic_embedding';

  select id into voyage_rate_id
  from public.research_usage_estimate_rate_versions
  where rate_key = 'vercel_gateway_voyage_4' and version = 1;
  select id into sonnet_rate_id
  from public.research_usage_estimate_rate_versions
  where rate_key = 'vercel_gateway_claude_sonnet_5_launch' and version = 1;

  if route_id is null or voyage_rate_id is null or sonnet_rate_id is null then
    raise exception 'P2 route or estimate-rate seed was not pinned';
  end if;

  caught_expected := false;
  begin
    perform public.begin_research_provider_call(
      first_job_id, route_id, 'wrong_rate', 100, 0, 100, 0.000006,
      'character_count_divided_by_4_with_declared_output_cap',
      'bowl_provider_estimate_v1', sonnet_rate_id
    );
  exception when others then
    if position('estimate rate does not match' in sqlerrm) > 0 then
      caught_expected := true;
    else
      raise;
    end if;
  end;
  if not caught_expected then
    raise exception 'A rate for a different pinned model was accepted';
  end if;

  reservation := public.begin_research_provider_call(
    first_job_id, route_id, 'document_embedding.batch_1', 100, 0, 100, 0.000006,
    'character_count_divided_by_4_with_declared_output_cap',
    'bowl_provider_estimate_v1', voyage_rate_id
  );
  if not (reservation ->> 'accepted')::boolean
    or (reservation ->> 'replay')::boolean then
    raise exception 'The first valid provider call was not accepted exactly once';
  end if;
  call_id := (reservation -> 'call' ->> 'id')::uuid;

  completion := public.complete_research_provider_call(
    p_provider_call_id => call_id,
    p_status => 'succeeded',
    p_actual_usage_source => 'provider_reported',
    p_actual_input_tokens => 100,
    p_actual_output_tokens => 0,
    p_actual_total_tokens => 100,
    p_actual_cost_usd => 0.000006,
    p_actual_cost_source => 'gateway_reported',
    p_actual_provider => 'voyage',
    p_actual_model_identifier => 'voyage/voyage-4',
    p_provider_request_id => 'isolated-request-1',
    p_client_duration_ms => 321,
    p_provider_duration_ms => 280
  );
  if (completion ->> 'replay')::boolean then
    raise exception 'The first completion was incorrectly marked as a replay';
  end if;

  replay := public.complete_research_provider_call(
    p_provider_call_id => call_id,
    p_status => 'succeeded',
    p_actual_usage_source => 'provider_reported',
    p_actual_input_tokens => 999,
    p_actual_output_tokens => 0,
    p_actual_total_tokens => 999,
    p_actual_cost_usd => 1,
    p_actual_cost_source => 'must_not_replace',
    p_client_duration_ms => 999
  );
  if not (replay ->> 'replay')::boolean then
    raise exception 'A duplicate completion was not treated as an idempotent replay';
  end if;

  reservation := public.begin_research_provider_call(
    first_job_id, route_id, 'document_embedding.batch_1', 100, 0, 100, 0.000006,
    'character_count_divided_by_4_with_declared_output_cap',
    'bowl_provider_estimate_v1', voyage_rate_id
  );
  if (reservation ->> 'accepted')::boolean
    or not (reservation ->> 'replay')::boolean then
    raise exception 'A duplicate call key could start another provider call';
  end if;

  select count(*), sum(actual_total_tokens), sum(estimated_total_tokens)
  into row_count, total_actual, total_estimated
  from public.research_provider_calls
  where mission_id = target_mission_id;
  if row_count <> 1 or total_actual <> 100 or total_estimated <> 100 then
    raise exception 'Replay double-counted provider telemetry';
  end if;

  halt := public.begin_research_provider_call(
    first_job_id, route_id, 'document_embedding.batch_2', 250001, 0, 250001, 0.015001,
    'character_count_divided_by_4_with_declared_output_cap',
    'bowl_provider_estimate_v1', voyage_rate_id
  );
  if (halt ->> 'accepted')::boolean
    or halt ->> 'reason_code' <> 'provider_call_estimated_input_cap_exceeded' then
    raise exception 'The deterministic per-call input cap did not halt before provider start';
  end if;

  select m.status, s.status, j.status
  into mission_status, stage_status, job_status
  from public.research_missions m
  join public.research_mission_stages s on s.mission_id = m.id
  join public.research_ingestion_jobs j on j.mission_stage_id = s.id
  where m.id = target_mission_id and s.id = first_stage_id;
  if mission_status <> 'partial' or stage_status <> 'failed' or job_status <> 'failed' then
    raise exception 'Cap halt did not preserve a partial mission and a retryable failed attempt';
  end if;
  if (select count(*) from public.research_provider_calls where mission_id = target_mission_id) <> 1 then
    raise exception 'Rejected provider call created a call row or removed prior history';
  end if;

  retry_job := public.retry_research_mission_job_stage(
    p_failed_job_id => first_job_id,
    p_requested_by => owner_id,
    p_idempotency_key => 'p2-isolated-retry'
  );
  retry_job_id := (retry_job ->> 'id')::uuid;
  select mission_stage_id into retry_stage_id
  from public.research_ingestion_jobs where id = retry_job_id;
  if retry_stage_id = first_stage_id
    or (select attempt_number from public.research_mission_stages where id = retry_stage_id) <> 2 then
    raise exception 'Retry did not create a distinct second stage attempt';
  end if;
  if (select budget_policy_version_id from public.research_mission_stages where id = retry_stage_id)
    <> (select budget_policy_version_id from public.research_missions where id = target_mission_id) then
    raise exception 'Retry did not retain the exact pinned mission budget policy';
  end if;

  perform public.mark_research_mission_job_running(retry_job_id);
  select route.id into route_id
  from public.research_mission_stages stage
  join public.research_model_stage_routes route
    on route.stage_configuration_version_id = stage.model_stage_configuration_version_id
  where stage.id = retry_stage_id and route.route_key = 'semantic_embedding';

  reservation := public.begin_research_provider_call(
    retry_job_id, route_id, 'document_embedding.batch_1', 100, 0, 100, 0.000006,
    'character_count_divided_by_4_with_declared_output_cap',
    'bowl_provider_estimate_v1', voyage_rate_id
  );
  if not (reservation ->> 'accepted')::boolean then
    raise exception 'A new stage attempt could not create its own deterministic call key';
  end if;
  call_id := (reservation -> 'call' ->> 'id')::uuid;
  perform public.complete_research_provider_call(
    p_provider_call_id => call_id,
    p_status => 'failed',
    p_actual_usage_source => 'not_reported',
    p_client_duration_ms => 50,
    p_error_code => 'fixture_stop',
    p_error_message => 'Intentional isolated retry stop.'
  );
  perform public.finish_research_mission_job(
    p_job_id => retry_job_id,
    p_job_status => 'failed',
    p_reason_code => 'fixture_stop',
    p_error_message => 'Intentional isolated retry stop.'
  );

  select count(*), sum(actual_total_tokens), sum(estimated_total_tokens)
  into row_count, total_actual, total_estimated
  from public.research_provider_calls
  where mission_id = target_mission_id;
  if row_count <> 2 or total_actual <> 100 or total_estimated <> 200 then
    raise exception 'Retry history was lost or actual usage was double-counted';
  end if;
  if exists (
    select 1
    from public.research_provider_calls call
    join public.research_mission_stages stage on stage.id = call.mission_stage_id
    join public.research_model_stage_routes route on route.id = call.model_route_id
    where call.mission_id = target_mission_id
      and (
        stage.mission_id <> call.mission_id
        or route.stage_configuration_version_id <> call.model_stage_configuration_version_id
      )
  ) then
    raise exception 'A provider call is not linked to its exact mission, attempt, and route version';
  end if;
  if (select gateway_input_tokens from public.research_ingestion_jobs where id = retry_job_id) is not null then
    raise exception 'Incomplete actual usage was presented as a complete compatibility total';
  end if;
  if exists (
    select 1
    from generate_series(
      1,
      (select max(sequence_number) from public.research_mission_events where mission_id = target_mission_id)
    ) expected(sequence_number)
    left join public.research_mission_events event
      on event.mission_id = target_mission_id and event.sequence_number = expected.sequence_number
    where event.id is null
  ) then
    raise exception 'Persisted mission event sequence contains a gap';
  end if;

  caught_expected := false;
  begin
    update public.research_provider_calls set actual_total_tokens = 101 where id = (
      select id from public.research_provider_calls
      where mission_stage_id = first_stage_id and status = 'succeeded'
    );
  exception when others then
    if position('Completed research provider-call records are immutable' in sqlerrm) > 0 then
      caught_expected := true;
    else
      raise;
    end if;
  end;
  if not caught_expected then
    raise exception 'Completed provider telemetry was mutable';
  end if;

  caught_expected := false;
  begin
    delete from public.research_provider_calls where mission_id = target_mission_id;
  exception when others then
    if position('append-preserving and cannot be deleted' in sqlerrm) > 0 then
      caught_expected := true;
    else
      raise;
    end if;
  end;
  if not caught_expected then
    raise exception 'Provider-call history could be deleted';
  end if;

  if exists (
    select 1
    from pg_class relation
    join pg_namespace namespace on namespace.oid = relation.relnamespace
    where namespace.nspname = 'public'
      and relation.relname in (
        'research_usage_estimate_rate_versions',
        'research_budget_policy_versions',
        'research_budget_stage_cap_versions',
        'research_provider_calls'
      )
      and not relation.relrowsecurity
  ) then
    raise exception 'A P2 table does not have row-level security enabled';
  end if;
  if has_table_privilege('anon', 'public.research_provider_calls', 'select')
    or has_table_privilege('authenticated', 'public.research_provider_calls', 'select')
    or has_table_privilege('service_role', 'public.research_provider_calls', 'delete') then
    raise exception 'P2 table privileges exceed the intended private append-preserving boundary';
  end if;
  if not has_table_privilege('service_role', 'public.research_provider_calls', 'select')
    or not has_table_privilege('service_role', 'public.research_provider_calls', 'insert')
    or not has_table_privilege('service_role', 'public.research_provider_calls', 'update') then
    raise exception 'Service-role provider telemetry privileges are incomplete';
  end if;
  if has_function_privilege(
    'anon',
    'public.begin_research_provider_call(uuid,uuid,text,bigint,bigint,bigint,numeric,text,text,uuid)',
    'execute'
  ) or not has_function_privilege(
    'service_role',
    'public.begin_research_provider_call(uuid,uuid,text,bigint,bigint,bigint,numeric,text,text,uuid)',
    'execute'
  ) then
    raise exception 'Provider-call reservation RPC privileges are incorrect';
  end if;
  if exists (
    select 1
    from pg_proc function
    join pg_namespace namespace on namespace.oid = function.pronamespace
    where namespace.nspname = 'public'
      and function.proname in (
        'begin_research_provider_call',
        'complete_research_provider_call',
        'validate_research_provider_call_links',
        'prevent_research_provider_call_identity_mutation',
        'prevent_research_provider_call_delete'
      )
      and (
        function.prosecdef
        or not coalesce(function.proconfig, '{}'::text[]) @> array['search_path=""']
      )
  ) then
    raise exception 'A P2 function is security-definer or lacks an empty search path';
  end if;
  if to_regclass('public.research_provider_calls_configuration_idx') is null
    or to_regclass('public.research_provider_calls_route_idx') is null
    or to_regclass('public.research_provider_calls_rate_idx') is null
    or to_regclass('public.research_provider_calls_job_idx') is null then
    raise exception 'A provider-call foreign-key access path is missing';
  end if;

  raise notice 'P2 isolated behavior passed: mission %, calls %, actual %, estimates %',
    target_mission_id, row_count, total_actual, total_estimated;
end;
$$;
