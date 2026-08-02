-- P2 research control plane: provider-call telemetry, explicit estimates, and
-- deterministic mission/stage caps.
--
-- This migration is deliberately confined to global research missions. It has
-- no foreign key, trigger, policy, function, or read path into dogs,
-- dog_documents, dog_document_findings, foods, recommendation tables, or the
-- catalogue crawling subsystem.

create table public.research_usage_estimate_rate_versions (
  id uuid primary key default gen_random_uuid(),
  rate_key text not null,
  version integer not null check (version > 0),
  provider text not null,
  model_identifier text not null,
  input_usd_per_million_tokens numeric(12, 6) not null
    check (input_usd_per_million_tokens >= 0),
  output_usd_per_million_tokens numeric(12, 6) not null
    check (output_usd_per_million_tokens >= 0),
  effective_from timestamptz not null,
  effective_until timestamptz,
  source_url text not null check (source_url ~ '^https://'),
  change_note text not null,
  created_at timestamptz not null default now(),
  unique (rate_key, version),
  unique (provider, model_identifier, version),
  check (effective_until is null or effective_until > effective_from)
);

create table public.research_budget_policy_versions (
  id uuid primary key default gen_random_uuid(),
  policy_key text not null,
  version integer not null check (version > 0),
  mission_max_provider_calls integer not null check (mission_max_provider_calls >= 0),
  mission_max_actual_total_tokens bigint not null
    check (mission_max_actual_total_tokens >= 0),
  mission_max_estimated_total_tokens bigint not null
    check (mission_max_estimated_total_tokens >= 0),
  mission_max_actual_cost_usd numeric(12, 6) not null
    check (mission_max_actual_cost_usd >= 0),
  mission_max_estimated_cost_usd numeric(12, 6) not null
    check (mission_max_estimated_cost_usd >= 0),
  mission_max_elapsed_ms bigint not null check (mission_max_elapsed_ms > 0),
  deterministic_halt_reason_codes text[] not null,
  effective_from timestamptz not null,
  effective_until timestamptz,
  change_note text not null,
  created_at timestamptz not null default now(),
  unique (policy_key, version),
  check (effective_until is null or effective_until > effective_from),
  check (cardinality(deterministic_halt_reason_codes) > 0)
);

create table public.research_budget_stage_cap_versions (
  id uuid primary key default gen_random_uuid(),
  budget_policy_version_id uuid not null
    references public.research_budget_policy_versions(id) on delete restrict,
  stage_key text not null
    check (stage_key in (
      'discovery',
      'source_acquisition',
      'document_ingestion',
      'relevance_selection',
      'claim_drafting',
      'clustering',
      'review_handoff'
    )),
  max_provider_calls integer not null check (max_provider_calls >= 0),
  max_actual_total_tokens bigint not null check (max_actual_total_tokens >= 0),
  max_estimated_total_tokens bigint not null check (max_estimated_total_tokens >= 0),
  max_actual_cost_usd numeric(12, 6) not null check (max_actual_cost_usd >= 0),
  max_estimated_cost_usd numeric(12, 6) not null check (max_estimated_cost_usd >= 0),
  max_elapsed_ms bigint not null check (max_elapsed_ms > 0),
  max_estimated_input_tokens_per_call bigint not null
    check (max_estimated_input_tokens_per_call >= 0),
  max_estimated_output_tokens_per_call bigint not null
    check (max_estimated_output_tokens_per_call >= 0),
  created_at timestamptz not null default now(),
  unique (budget_policy_version_id, stage_key)
);

insert into public.research_usage_estimate_rate_versions (
  rate_key,
  version,
  provider,
  model_identifier,
  input_usd_per_million_tokens,
  output_usd_per_million_tokens,
  effective_from,
  effective_until,
  source_url,
  change_note
) values
  (
    'vercel_gateway_voyage_4',
    1,
    'vercel_ai_gateway',
    'voyage/voyage-4',
    0.06,
    0,
    '2026-08-01 00:00:00+00',
    null,
    'https://vercel.com/ai-gateway/models/voyage-4',
    'P2 estimate-only pricing snapshot. Provider-reported usage remains separate.'
  ),
  (
    'vercel_gateway_claude_sonnet_5_launch',
    1,
    'vercel_ai_gateway',
    'anthropic/claude-sonnet-5',
    2,
    10,
    '2026-08-01 00:00:00+00',
    '2026-09-01 00:00:00+00',
    'https://vercel.com/changelog/claude-sonnet-5-ai-gateway',
    'P2 estimate-only launch pricing through 2026-08-31. Never presented as actual cost.'
  );

insert into public.research_budget_policy_versions (
  policy_key,
  version,
  mission_max_provider_calls,
  mission_max_actual_total_tokens,
  mission_max_estimated_total_tokens,
  mission_max_actual_cost_usd,
  mission_max_estimated_cost_usd,
  mission_max_elapsed_ms,
  deterministic_halt_reason_codes,
  effective_from,
  change_note
) values (
  'bowl_research_budget',
  1,
  64,
  1500000,
  1500000,
  30,
  30,
  1800000,
  array[
    'mission_provider_call_cap_reached',
    'stage_provider_call_cap_reached',
    'mission_actual_token_cap_reached',
    'stage_actual_token_cap_reached',
    'mission_estimated_token_cap_exceeded',
    'stage_estimated_token_cap_exceeded',
    'mission_actual_cost_cap_reached',
    'stage_actual_cost_cap_reached',
    'mission_estimated_cost_cap_exceeded',
    'stage_estimated_cost_cap_exceeded',
    'mission_elapsed_cap_reached',
    'stage_elapsed_cap_reached',
    'provider_call_estimate_required',
    'provider_call_estimated_input_cap_exceeded',
    'provider_call_estimated_output_cap_exceeded',
    'mission_actual_token_cap_exceeded_after_call',
    'stage_actual_token_cap_exceeded_after_call',
    'mission_actual_cost_cap_exceeded_after_call',
    'stage_actual_cost_cap_exceeded_after_call'
  ],
  '2026-08-01 00:00:00+00',
  'Initial P2 deterministic cap policy for bounded owner-authorized research missions.'
);

insert into public.research_budget_stage_cap_versions (
  budget_policy_version_id,
  stage_key,
  max_provider_calls,
  max_actual_total_tokens,
  max_estimated_total_tokens,
  max_actual_cost_usd,
  max_estimated_cost_usd,
  max_elapsed_ms,
  max_estimated_input_tokens_per_call,
  max_estimated_output_tokens_per_call
)
select
  policy.id,
  cap.stage_key,
  cap.max_provider_calls,
  cap.max_actual_total_tokens,
  cap.max_estimated_total_tokens,
  cap.max_actual_cost_usd,
  cap.max_estimated_cost_usd,
  cap.max_elapsed_ms,
  cap.max_estimated_input_tokens_per_call,
  cap.max_estimated_output_tokens_per_call
from public.research_budget_policy_versions policy
cross join (values
  ('discovery', 0, 0::bigint, 0::bigint, 0::numeric, 0::numeric, 300000::bigint, 0::bigint, 0::bigint),
  ('source_acquisition', 0, 0::bigint, 0::bigint, 0::numeric, 0::numeric, 300000::bigint, 0::bigint, 0::bigint),
  ('document_ingestion', 16, 500000::bigint, 500000::bigint, 10::numeric, 10::numeric, 600000::bigint, 250000::bigint, 0::bigint),
  ('relevance_selection', 8, 250000::bigint, 250000::bigint, 5::numeric, 5::numeric, 300000::bigint, 250000::bigint, 0::bigint),
  ('claim_drafting', 24, 750000::bigint, 750000::bigint, 20::numeric, 20::numeric, 900000::bigint, 500000::bigint, 3200::bigint),
  ('clustering', 0, 0::bigint, 0::bigint, 0::numeric, 0::numeric, 300000::bigint, 0::bigint, 0::bigint),
  ('review_handoff', 0, 0::bigint, 0::bigint, 0::numeric, 0::numeric, 300000::bigint, 0::bigint, 0::bigint)
) as cap(
  stage_key,
  max_provider_calls,
  max_actual_total_tokens,
  max_estimated_total_tokens,
  max_actual_cost_usd,
  max_estimated_cost_usd,
  max_elapsed_ms,
  max_estimated_input_tokens_per_call,
  max_estimated_output_tokens_per_call
)
where policy.policy_key = 'bowl_research_budget' and policy.version = 1;

alter table public.research_missions
  add column budget_policy_version_id uuid
    references public.research_budget_policy_versions(id) on delete restrict;

alter table public.research_mission_stages
  add column budget_policy_version_id uuid
    references public.research_budget_policy_versions(id) on delete restrict;

create or replace function public.assign_research_mission_control_versions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if new.model_configuration_set_version_id is null then
    select id into new.model_configuration_set_version_id
    from public.research_model_configuration_sets
    where configuration_key = 'bowl_research'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1;
  end if;
  if new.discovery_question_policy_version_id is null then
    select id into new.discovery_question_policy_version_id
    from public.research_discovery_question_policy_versions
    where policy_key = 'bowl_research_questions'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1;
  end if;
  if new.literature_registry_version_id is null then
    select id into new.literature_registry_version_id
    from public.research_literature_registry_versions
    where registry_key = 'bowl_structured_literature'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1;
  end if;
  if new.evidence_admissibility_policy_version_id is null then
    select id into new.evidence_admissibility_policy_version_id
    from public.research_evidence_admissibility_policy_versions
    where policy_key = 'bowl_canine_outcomes'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1;
  end if;
  if new.budget_policy_version_id is null then
    select id into new.budget_policy_version_id
    from public.research_budget_policy_versions
    where policy_key = 'bowl_research_budget'
      and effective_from <= now()
      and (effective_until is null or effective_until > now())
    order by version desc
    limit 1;
  end if;

  if new.model_configuration_set_version_id is null
    or new.discovery_question_policy_version_id is null
    or new.literature_registry_version_id is null
    or new.evidence_admissibility_policy_version_id is null
    or new.budget_policy_version_id is null then
    raise exception 'No complete active research control-plane version set is available';
  end if;
  return new;
end;
$$;

create or replace function public.assign_research_stage_control_versions()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  mission_row public.research_missions%rowtype;
  expected_stage_configuration_id uuid;
begin
  select * into mission_row
  from public.research_missions
  where id = new.mission_id;
  if mission_row.id is null then
    raise exception 'Research mission not found for stage configuration';
  end if;

  select id into expected_stage_configuration_id
  from public.research_model_stage_configuration_versions
  where configuration_set_id = mission_row.model_configuration_set_version_id
    and stage_key = new.stage_key;
  if expected_stage_configuration_id is null then
    raise exception 'No model configuration exists for research stage %', new.stage_key;
  end if;

  new.model_stage_configuration_version_id := coalesce(
    new.model_stage_configuration_version_id,
    expected_stage_configuration_id
  );
  new.discovery_question_policy_version_id := coalesce(
    new.discovery_question_policy_version_id,
    mission_row.discovery_question_policy_version_id
  );
  new.literature_registry_version_id := coalesce(
    new.literature_registry_version_id,
    mission_row.literature_registry_version_id
  );
  new.evidence_admissibility_policy_version_id := coalesce(
    new.evidence_admissibility_policy_version_id,
    mission_row.evidence_admissibility_policy_version_id
  );
  new.budget_policy_version_id := coalesce(
    new.budget_policy_version_id,
    mission_row.budget_policy_version_id
  );

  if new.model_stage_configuration_version_id <> expected_stage_configuration_id
    or new.discovery_question_policy_version_id <> mission_row.discovery_question_policy_version_id
    or new.literature_registry_version_id <> mission_row.literature_registry_version_id
    or new.evidence_admissibility_policy_version_id <> mission_row.evidence_admissibility_policy_version_id
    or new.budget_policy_version_id <> mission_row.budget_policy_version_id then
    raise exception 'Research stage control-plane versions must match the parent mission snapshot';
  end if;
  return new;
end;
$$;

update public.research_missions
set budget_policy_version_id = (
  select id
  from public.research_budget_policy_versions
  where policy_key = 'bowl_research_budget' and version = 1
)
where budget_policy_version_id is null;

update public.research_mission_stages stage
set budget_policy_version_id = (
  select mission.budget_policy_version_id
  from public.research_missions mission
  where mission.id = stage.mission_id
)
where budget_policy_version_id is null;

alter table public.research_missions
  alter column budget_policy_version_id set not null;
alter table public.research_mission_stages
  alter column budget_policy_version_id set not null;

create index research_missions_budget_policy_idx
  on public.research_missions (budget_policy_version_id);
create index research_mission_stages_budget_policy_idx
  on public.research_mission_stages (budget_policy_version_id);
create index research_budget_stage_caps_policy_idx
  on public.research_budget_stage_cap_versions (budget_policy_version_id, stage_key);

create table public.research_provider_calls (
  id uuid primary key default gen_random_uuid(),
  mission_id uuid not null references public.research_missions(id) on delete restrict,
  mission_stage_id uuid not null
    references public.research_mission_stages(id) on delete restrict,
  research_ingestion_job_id uuid
    references public.research_ingestion_jobs(id) on delete restrict,
  model_stage_configuration_version_id uuid not null
    references public.research_model_stage_configuration_versions(id) on delete restrict,
  model_route_id uuid not null
    references public.research_model_stage_routes(id) on delete restrict,
  call_key text not null check (call_key ~ '^[a-z][a-z0-9_.-]{0,159}$'),
  status text not null check (status in ('started', 'succeeded', 'failed')),
  configured_provider text not null,
  configured_model_identifier text not null,
  actual_provider text,
  actual_model_identifier text,
  provider_request_id text,
  actual_usage_source text not null default 'not_reported'
    check (actual_usage_source in ('provider_reported', 'not_reported')),
  actual_input_tokens bigint check (actual_input_tokens is null or actual_input_tokens >= 0),
  actual_output_tokens bigint check (actual_output_tokens is null or actual_output_tokens >= 0),
  actual_total_tokens bigint check (actual_total_tokens is null or actual_total_tokens >= 0),
  actual_reasoning_tokens bigint
    check (actual_reasoning_tokens is null or actual_reasoning_tokens >= 0),
  actual_cache_read_tokens bigint
    check (actual_cache_read_tokens is null or actual_cache_read_tokens >= 0),
  actual_cache_write_tokens bigint
    check (actual_cache_write_tokens is null or actual_cache_write_tokens >= 0),
  actual_cost_usd numeric(12, 6) check (actual_cost_usd is null or actual_cost_usd >= 0),
  actual_cost_source text,
  estimated_input_tokens bigint not null check (estimated_input_tokens >= 0),
  estimated_output_tokens bigint not null check (estimated_output_tokens >= 0),
  estimated_total_tokens bigint not null check (estimated_total_tokens >= 0),
  estimated_cost_usd numeric(12, 6) not null check (estimated_cost_usd >= 0),
  estimate_method text not null,
  estimate_version text not null,
  estimate_rate_version_id uuid not null
    references public.research_usage_estimate_rate_versions(id) on delete restrict,
  client_duration_ms bigint check (client_duration_ms is null or client_duration_ms >= 0),
  provider_duration_ms bigint check (provider_duration_ms is null or provider_duration_ms >= 0),
  error_code text check (error_code is null or error_code ~ '^[a-z][a-z0-9_]*$'),
  error_message text,
  started_at timestamptz not null default now(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (mission_stage_id, call_key),
  constraint research_provider_calls_estimated_total_check
    check (estimated_total_tokens = estimated_input_tokens + estimated_output_tokens),
  constraint research_provider_calls_completion_check
    check (
      (status = 'started' and completed_at is null and client_duration_ms is null)
      or (status in ('succeeded', 'failed') and completed_at is not null and client_duration_ms is not null)
    ),
  constraint research_provider_calls_failure_check
    check (status <> 'failed' or length(btrim(coalesce(error_message, ''))) > 0),
  constraint research_provider_calls_usage_source_check
    check (
      (actual_usage_source = 'not_reported'
        and actual_input_tokens is null
        and actual_output_tokens is null
        and actual_total_tokens is null
        and actual_reasoning_tokens is null
        and actual_cache_read_tokens is null
        and actual_cache_write_tokens is null)
      or (actual_usage_source = 'provider_reported'
        and (
          actual_input_tokens is not null
          or actual_output_tokens is not null
          or actual_total_tokens is not null
        ))
    ),
  constraint research_provider_calls_actual_cost_source_check
    check (
      (actual_cost_usd is null and actual_cost_source is null)
      or (actual_cost_usd is not null and length(btrim(coalesce(actual_cost_source, ''))) > 0)
    )
);

create index research_provider_calls_mission_sequence_idx
  on public.research_provider_calls (mission_id, started_at, id);
create index research_provider_calls_stage_sequence_idx
  on public.research_provider_calls (mission_stage_id, started_at, id);
create index research_provider_calls_job_idx
  on public.research_provider_calls (research_ingestion_job_id, started_at)
  where research_ingestion_job_id is not null;
create index research_provider_calls_route_idx
  on public.research_provider_calls (model_route_id, started_at);
create index research_provider_calls_configuration_idx
  on public.research_provider_calls (model_stage_configuration_version_id, started_at);
create index research_provider_calls_rate_idx
  on public.research_provider_calls (estimate_rate_version_id)
  where estimate_rate_version_id is not null;

create or replace function public.validate_research_provider_call_links()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_stage public.research_mission_stages%rowtype;
  linked_job public.research_ingestion_jobs%rowtype;
  linked_route public.research_model_stage_routes%rowtype;
  linked_rate public.research_usage_estimate_rate_versions%rowtype;
begin
  select * into linked_stage
  from public.research_mission_stages
  where id = new.mission_stage_id;
  if linked_stage.id is null or linked_stage.mission_id <> new.mission_id then
    raise exception 'Provider call stage does not belong to its mission';
  end if;

  if new.research_ingestion_job_id is not null then
    select * into linked_job
    from public.research_ingestion_jobs
    where id = new.research_ingestion_job_id;
    if linked_job.id is null
      or linked_job.mission_id <> new.mission_id
      or linked_job.mission_stage_id <> new.mission_stage_id then
      raise exception 'Provider call job does not belong to its mission stage';
    end if;
  end if;

  select * into linked_route
  from public.research_model_stage_routes
  where id = new.model_route_id;
  if linked_route.id is null
    or linked_route.stage_configuration_version_id
      <> new.model_stage_configuration_version_id
    or linked_stage.model_stage_configuration_version_id
      <> new.model_stage_configuration_version_id
    or linked_route.provider <> new.configured_provider
    or linked_route.model_identifier <> new.configured_model_identifier then
    raise exception 'Provider call route does not match its pinned model configuration';
  end if;

  select * into linked_rate
  from public.research_usage_estimate_rate_versions
  where id = new.estimate_rate_version_id;
  if linked_rate.id is null
    or linked_rate.provider <> new.configured_provider
    or linked_rate.model_identifier <> new.configured_model_identifier then
    raise exception 'Provider call estimate rate does not match its configured route';
  end if;
  return new;
end;
$$;

create trigger research_provider_calls_links_valid
before insert on public.research_provider_calls
for each row execute function public.validate_research_provider_call_links();

create or replace function public.prevent_research_control_plane_version_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Research control-plane configuration, policy, cap, and estimate-rate versions are immutable';
end;
$$;

create trigger research_usage_estimate_rates_immutable
before update or delete on public.research_usage_estimate_rate_versions
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_budget_policies_immutable
before update or delete on public.research_budget_policy_versions
for each row execute function public.prevent_research_control_plane_version_mutation();
create trigger research_budget_stage_caps_immutable
before update or delete on public.research_budget_stage_cap_versions
for each row execute function public.prevent_research_control_plane_version_mutation();

create or replace function public.prevent_research_mission_identity_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.id is distinct from old.id
    or new.mission_type is distinct from old.mission_type
    or new.objective is distinct from old.objective
    or new.requested_by is distinct from old.requested_by
    or new.input is distinct from old.input
    or new.model_configuration_set_version_id is distinct from old.model_configuration_set_version_id
    or new.discovery_question_policy_version_id is distinct from old.discovery_question_policy_version_id
    or new.literature_registry_version_id is distinct from old.literature_registry_version_id
    or new.evidence_admissibility_policy_version_id is distinct from old.evidence_admissibility_policy_version_id
    or new.budget_policy_version_id is distinct from old.budget_policy_version_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Research mission identity, input, and control-plane versions are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_research_mission_stage_identity_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.id is distinct from old.id
    or new.mission_id is distinct from old.mission_id
    or new.stage_key is distinct from old.stage_key
    or new.attempt_number is distinct from old.attempt_number
    or new.retry_of_stage_id is distinct from old.retry_of_stage_id
    or new.idempotency_key is distinct from old.idempotency_key
    or new.input is distinct from old.input
    or new.model_stage_configuration_version_id is distinct from old.model_stage_configuration_version_id
    or new.discovery_question_policy_version_id is distinct from old.discovery_question_policy_version_id
    or new.literature_registry_version_id is distinct from old.literature_registry_version_id
    or new.evidence_admissibility_policy_version_id is distinct from old.evidence_admissibility_policy_version_id
    or new.budget_policy_version_id is distinct from old.budget_policy_version_id
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Research mission stage identity, input, and control-plane versions are immutable';
  end if;
  return new;
end;
$$;

create or replace function public.prevent_research_provider_call_identity_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if (
    new.id is distinct from old.id
    or new.mission_id is distinct from old.mission_id
    or new.mission_stage_id is distinct from old.mission_stage_id
    or new.research_ingestion_job_id is distinct from old.research_ingestion_job_id
    or new.model_stage_configuration_version_id is distinct from old.model_stage_configuration_version_id
    or new.model_route_id is distinct from old.model_route_id
    or new.call_key is distinct from old.call_key
    or new.configured_provider is distinct from old.configured_provider
    or new.configured_model_identifier is distinct from old.configured_model_identifier
    or new.estimated_input_tokens is distinct from old.estimated_input_tokens
    or new.estimated_output_tokens is distinct from old.estimated_output_tokens
    or new.estimated_total_tokens is distinct from old.estimated_total_tokens
    or new.estimated_cost_usd is distinct from old.estimated_cost_usd
    or new.estimate_method is distinct from old.estimate_method
    or new.estimate_version is distinct from old.estimate_version
    or new.estimate_rate_version_id is distinct from old.estimate_rate_version_id
    or new.started_at is distinct from old.started_at
    or new.created_at is distinct from old.created_at
  ) then
    raise exception 'Research provider-call identity, route, and estimate snapshot are immutable';
  end if;
  if old.status <> 'started' and new is distinct from old then
    raise exception 'Completed research provider-call records are immutable';
  end if;
  return new;
end;
$$;

create trigger research_provider_calls_identity_immutable
before update on public.research_provider_calls
for each row execute function public.prevent_research_provider_call_identity_mutation();

create or replace function public.prevent_research_provider_call_delete()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception 'Research provider-call history is append-preserving and cannot be deleted';
end;
$$;

create trigger research_provider_calls_delete_protected
before delete on public.research_provider_calls
for each row execute function public.prevent_research_provider_call_delete();

create or replace function public.begin_research_provider_call(
  p_job_id uuid,
  p_model_route_id uuid,
  p_call_key text,
  p_estimated_input_tokens bigint,
  p_estimated_output_tokens bigint,
  p_estimated_total_tokens bigint,
  p_estimated_cost_usd numeric,
  p_estimate_method text,
  p_estimate_version text,
  p_estimate_rate_version_id uuid default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_job public.research_ingestion_jobs%rowtype;
  linked_mission public.research_missions%rowtype;
  linked_stage public.research_mission_stages%rowtype;
  linked_route public.research_model_stage_routes%rowtype;
  estimate_rate public.research_usage_estimate_rate_versions%rowtype;
  policy public.research_budget_policy_versions%rowtype;
  stage_cap public.research_budget_stage_cap_versions%rowtype;
  existing_call public.research_provider_calls%rowtype;
  new_call public.research_provider_calls%rowtype;
  mission_call_count bigint;
  stage_call_count bigint;
  mission_actual_tokens numeric;
  stage_actual_tokens numeric;
  mission_estimated_tokens numeric;
  stage_estimated_tokens numeric;
  mission_actual_cost numeric;
  stage_actual_cost numeric;
  mission_estimated_cost numeric;
  stage_estimated_cost numeric;
  mission_elapsed_ms bigint;
  stage_elapsed_ms bigint;
  halt_reason text;
  halt_status text;
  halt_message text;
begin
  if p_estimated_input_tokens is null
    or p_estimated_output_tokens is null
    or p_estimated_total_tokens is null
    or p_estimated_cost_usd is null
    or p_estimate_rate_version_id is null
    or length(btrim(coalesce(p_estimate_method, ''))) = 0
    or length(btrim(coalesce(p_estimate_version, ''))) = 0 then
    halt_reason := 'provider_call_estimate_required';
  elsif p_estimated_input_tokens < 0
    or p_estimated_output_tokens < 0
    or p_estimated_total_tokens < 0
    or p_estimated_cost_usd < 0
    or p_estimated_total_tokens <> p_estimated_input_tokens + p_estimated_output_tokens then
    raise exception 'Provider-call estimates must be non-negative and internally consistent';
  end if;
  if length(btrim(coalesce(p_call_key, ''))) = 0 then
    raise exception 'A deterministic provider call key is required';
  end if;

  select * into linked_job
  from public.research_ingestion_jobs
  where id = p_job_id;
  if linked_job.id is null or linked_job.mission_id is null or linked_job.mission_stage_id is null then
    raise exception 'Linked research mission job not found';
  end if;

  select * into linked_mission
  from public.research_missions
  where id = linked_job.mission_id
  for update;
  select * into linked_stage
  from public.research_mission_stages
  where id = linked_job.mission_stage_id
  for update;
  if linked_stage.mission_id <> linked_mission.id then
    raise exception 'Research job stage does not belong to its mission';
  end if;

  select * into existing_call
  from public.research_provider_calls
  where mission_stage_id = linked_stage.id and call_key = p_call_key;
  if existing_call.id is not null then
    return jsonb_build_object(
      'accepted', false,
      'replay', true,
      'reason_code', 'provider_call_already_started',
      'call', to_jsonb(existing_call)
    );
  end if;

  if linked_job.status not in ('queued', 'running')
    or linked_stage.status not in ('pending', 'running')
    or linked_mission.status not in ('queued', 'running') then
    return jsonb_build_object(
      'accepted', false,
      'replay', false,
      'reason_code', coalesce(linked_stage.reason_code, linked_mission.terminal_reason_code, 'research_stage_not_runnable'),
      'call', null
    );
  end if;

  select * into linked_route
  from public.research_model_stage_routes
  where id = p_model_route_id;
  if linked_route.id is null
    or linked_route.stage_configuration_version_id <> linked_stage.model_stage_configuration_version_id
    or linked_route.execution_kind not in ('embedding_model', 'language_model') then
    raise exception 'Provider call route does not belong to the pinned model stage configuration';
  end if;

  if p_estimate_rate_version_id is not null then
    select * into estimate_rate
    from public.research_usage_estimate_rate_versions
    where id = p_estimate_rate_version_id;
    if estimate_rate.id is null
      or estimate_rate.provider <> linked_route.provider
      or estimate_rate.model_identifier <> linked_route.model_identifier
      or estimate_rate.effective_from > now()
      or (estimate_rate.effective_until is not null and estimate_rate.effective_until <= now()) then
      raise exception 'Provider-call estimate rate does not match the pinned route or active version';
    end if;
  end if;

  select * into policy
  from public.research_budget_policy_versions
  where id = linked_stage.budget_policy_version_id;
  select * into stage_cap
  from public.research_budget_stage_cap_versions
  where budget_policy_version_id = linked_stage.budget_policy_version_id
    and stage_key = linked_stage.stage_key;
  if policy.id is null or stage_cap.id is null then
    raise exception 'Pinned research budget policy or stage cap was not found';
  end if;

  select
    count(*),
    coalesce(sum(coalesce(actual_total_tokens, actual_input_tokens + actual_output_tokens)), 0),
    coalesce(sum(estimated_total_tokens), 0),
    coalesce(sum(actual_cost_usd), 0),
    coalesce(sum(estimated_cost_usd), 0)
  into
    mission_call_count,
    mission_actual_tokens,
    mission_estimated_tokens,
    mission_actual_cost,
    mission_estimated_cost
  from public.research_provider_calls
  where mission_id = linked_mission.id;

  select
    count(*),
    coalesce(sum(coalesce(actual_total_tokens, actual_input_tokens + actual_output_tokens)), 0),
    coalesce(sum(estimated_total_tokens), 0),
    coalesce(sum(actual_cost_usd), 0),
    coalesce(sum(estimated_cost_usd), 0)
  into
    stage_call_count,
    stage_actual_tokens,
    stage_estimated_tokens,
    stage_actual_cost,
    stage_estimated_cost
  from public.research_provider_calls
  where mission_stage_id = linked_stage.id;

  mission_elapsed_ms := floor(extract(epoch from (now() - coalesce(linked_mission.started_at, linked_mission.created_at))) * 1000);
  stage_elapsed_ms := floor(extract(epoch from (now() - coalesce(linked_stage.started_at, linked_stage.created_at))) * 1000);

  if halt_reason is null and mission_call_count >= policy.mission_max_provider_calls then
    halt_reason := 'mission_provider_call_cap_reached';
  elsif halt_reason is null and stage_call_count >= stage_cap.max_provider_calls then
    halt_reason := 'stage_provider_call_cap_reached';
  elsif halt_reason is null and p_estimated_input_tokens > stage_cap.max_estimated_input_tokens_per_call then
    halt_reason := 'provider_call_estimated_input_cap_exceeded';
  elsif halt_reason is null and p_estimated_output_tokens > stage_cap.max_estimated_output_tokens_per_call then
    halt_reason := 'provider_call_estimated_output_cap_exceeded';
  elsif halt_reason is null and mission_actual_tokens >= policy.mission_max_actual_total_tokens then
    halt_reason := 'mission_actual_token_cap_reached';
  elsif halt_reason is null and stage_actual_tokens >= stage_cap.max_actual_total_tokens then
    halt_reason := 'stage_actual_token_cap_reached';
  elsif halt_reason is null and mission_estimated_tokens + p_estimated_total_tokens > policy.mission_max_estimated_total_tokens then
    halt_reason := 'mission_estimated_token_cap_exceeded';
  elsif halt_reason is null and stage_estimated_tokens + p_estimated_total_tokens > stage_cap.max_estimated_total_tokens then
    halt_reason := 'stage_estimated_token_cap_exceeded';
  elsif halt_reason is null and mission_actual_cost >= policy.mission_max_actual_cost_usd then
    halt_reason := 'mission_actual_cost_cap_reached';
  elsif halt_reason is null and stage_actual_cost >= stage_cap.max_actual_cost_usd then
    halt_reason := 'stage_actual_cost_cap_reached';
  elsif halt_reason is null and mission_estimated_cost + p_estimated_cost_usd > policy.mission_max_estimated_cost_usd then
    halt_reason := 'mission_estimated_cost_cap_exceeded';
  elsif halt_reason is null and stage_estimated_cost + p_estimated_cost_usd > stage_cap.max_estimated_cost_usd then
    halt_reason := 'stage_estimated_cost_cap_exceeded';
  elsif halt_reason is null and mission_elapsed_ms >= policy.mission_max_elapsed_ms then
    halt_reason := 'mission_elapsed_cap_reached';
  elsif halt_reason is null and stage_elapsed_ms >= stage_cap.max_elapsed_ms then
    halt_reason := 'stage_elapsed_cap_reached';
  end if;

  if halt_reason is not null then
    halt_status := case when mission_call_count > 0 then 'partial' else 'failed' end;
    halt_message := 'Research provider call was not started because deterministic cap policy rejected it.';
    update public.research_ingestion_jobs
    set status = 'failed', error_message = halt_message, completed_at = now(), updated_at = now()
    where id = linked_job.id;
    -- A halted attempt is failed (and therefore explicitly retryable); the
    -- parent mission is partial when earlier calls remain in its history.
    update public.research_mission_stages
    set status = 'failed', reason_code = halt_reason, error_message = halt_message,
      completed_at = now()
    where id = linked_stage.id;
    update public.research_missions
    set status = halt_status, terminal_reason_code = halt_reason, terminal_message = halt_message,
      completed_at = now()
    where id = linked_mission.id;
    perform public.append_research_mission_event(
      linked_mission.id,
      linked_stage.id,
      'budget.halted',
      'worker',
      null,
      jsonb_build_object(
        'job_id', linked_job.id,
        'model_route_id', p_model_route_id,
        'call_key', p_call_key,
        'reason_code', halt_reason,
        'provider_call_started', false
      )
    );
    return jsonb_build_object(
      'accepted', false,
      'replay', false,
      'reason_code', halt_reason,
      'call', null
    );
  end if;

  insert into public.research_provider_calls (
    mission_id,
    mission_stage_id,
    research_ingestion_job_id,
    model_stage_configuration_version_id,
    model_route_id,
    call_key,
    status,
    configured_provider,
    configured_model_identifier,
    estimated_input_tokens,
    estimated_output_tokens,
    estimated_total_tokens,
    estimated_cost_usd,
    estimate_method,
    estimate_version,
    estimate_rate_version_id
  ) values (
    linked_mission.id,
    linked_stage.id,
    linked_job.id,
    linked_stage.model_stage_configuration_version_id,
    linked_route.id,
    p_call_key,
    'started',
    linked_route.provider,
    linked_route.model_identifier,
    p_estimated_input_tokens,
    p_estimated_output_tokens,
    p_estimated_total_tokens,
    p_estimated_cost_usd,
    p_estimate_method,
    p_estimate_version,
    p_estimate_rate_version_id
  )
  returning * into new_call;

  perform public.append_research_mission_event(
    linked_mission.id,
    linked_stage.id,
    'provider_call.started',
    'worker',
    null,
    jsonb_build_object(
      'job_id', linked_job.id,
      'provider_call_id', new_call.id,
      'model_route_id', linked_route.id,
      'call_key', new_call.call_key
    )
  );

  return jsonb_build_object(
    'accepted', true,
    'replay', false,
    'reason_code', null,
    'call', to_jsonb(new_call)
  );
end;
$$;

create or replace function public.complete_research_provider_call(
  p_provider_call_id uuid,
  p_status text,
  p_actual_usage_source text,
  p_actual_input_tokens bigint default null,
  p_actual_output_tokens bigint default null,
  p_actual_total_tokens bigint default null,
  p_actual_reasoning_tokens bigint default null,
  p_actual_cache_read_tokens bigint default null,
  p_actual_cache_write_tokens bigint default null,
  p_actual_cost_usd numeric default null,
  p_actual_cost_source text default null,
  p_actual_provider text default null,
  p_actual_model_identifier text default null,
  p_provider_request_id text default null,
  p_client_duration_ms bigint default null,
  p_provider_duration_ms bigint default null,
  p_error_code text default null,
  p_error_message text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  call_row public.research_provider_calls%rowtype;
  linked_mission public.research_missions%rowtype;
  linked_stage public.research_mission_stages%rowtype;
  linked_job public.research_ingestion_jobs%rowtype;
  policy public.research_budget_policy_versions%rowtype;
  stage_cap public.research_budget_stage_cap_versions%rowtype;
  mission_actual_tokens numeric;
  stage_actual_tokens numeric;
  mission_actual_cost numeric;
  stage_actual_cost numeric;
  halt_reason text;
  halt_message text;
begin
  if p_status not in ('succeeded', 'failed') then
    raise exception 'Unsupported provider-call terminal status';
  end if;
  if p_actual_usage_source not in ('provider_reported', 'not_reported') then
    raise exception 'Unsupported actual usage source';
  end if;
  if p_client_duration_ms is null or p_client_duration_ms < 0 then
    raise exception 'A non-negative measured client duration is required';
  end if;
  if p_status = 'failed' and length(btrim(coalesce(p_error_message, ''))) = 0 then
    raise exception 'A failed provider call requires an error message';
  end if;

  select * into call_row
  from public.research_provider_calls
  where id = p_provider_call_id;
  if call_row.id is null then
    raise exception 'Research provider call not found';
  end if;

  select * into linked_mission
  from public.research_missions
  where id = call_row.mission_id
  for update;
  select * into linked_stage
  from public.research_mission_stages
  where id = call_row.mission_stage_id
  for update;
  select * into call_row
  from public.research_provider_calls
  where id = p_provider_call_id
  for update;
  if call_row.status <> 'started' then
    return jsonb_build_object(
      'replay', true,
      'budget_halt_reason_code', coalesce(linked_stage.reason_code, linked_mission.terminal_reason_code),
      'call', to_jsonb(call_row)
    );
  end if;

  update public.research_provider_calls
  set
    status = p_status,
    actual_provider = p_actual_provider,
    actual_model_identifier = p_actual_model_identifier,
    provider_request_id = p_provider_request_id,
    actual_usage_source = p_actual_usage_source,
    actual_input_tokens = case when p_actual_usage_source = 'provider_reported' then p_actual_input_tokens else null end,
    actual_output_tokens = case when p_actual_usage_source = 'provider_reported' then p_actual_output_tokens else null end,
    actual_total_tokens = case when p_actual_usage_source = 'provider_reported' then p_actual_total_tokens else null end,
    actual_reasoning_tokens = case when p_actual_usage_source = 'provider_reported' then p_actual_reasoning_tokens else null end,
    actual_cache_read_tokens = case when p_actual_usage_source = 'provider_reported' then p_actual_cache_read_tokens else null end,
    actual_cache_write_tokens = case when p_actual_usage_source = 'provider_reported' then p_actual_cache_write_tokens else null end,
    actual_cost_usd = p_actual_cost_usd,
    actual_cost_source = p_actual_cost_source,
    client_duration_ms = p_client_duration_ms,
    provider_duration_ms = p_provider_duration_ms,
    error_code = case when p_status = 'failed' then p_error_code else null end,
    error_message = case when p_status = 'failed' then p_error_message else null end,
    completed_at = now()
  where id = p_provider_call_id
  returning * into call_row;

  perform public.append_research_mission_event(
    call_row.mission_id,
    call_row.mission_stage_id,
    case when p_status = 'succeeded' then 'provider_call.succeeded' else 'provider_call.failed' end,
    'worker',
    null,
    jsonb_build_object(
      'job_id', call_row.research_ingestion_job_id,
      'provider_call_id', call_row.id,
      'model_route_id', call_row.model_route_id,
      'call_key', call_row.call_key,
      'actual_usage_reported', call_row.actual_usage_source = 'provider_reported'
    )
  );

  select * into policy
  from public.research_budget_policy_versions
  where id = linked_stage.budget_policy_version_id;
  select * into stage_cap
  from public.research_budget_stage_cap_versions
  where budget_policy_version_id = linked_stage.budget_policy_version_id
    and stage_key = linked_stage.stage_key;

  select
    coalesce(sum(coalesce(actual_total_tokens, actual_input_tokens + actual_output_tokens)), 0),
    coalesce(sum(actual_cost_usd), 0)
  into mission_actual_tokens, mission_actual_cost
  from public.research_provider_calls
  where mission_id = call_row.mission_id;
  select
    coalesce(sum(coalesce(actual_total_tokens, actual_input_tokens + actual_output_tokens)), 0),
    coalesce(sum(actual_cost_usd), 0)
  into stage_actual_tokens, stage_actual_cost
  from public.research_provider_calls
  where mission_stage_id = call_row.mission_stage_id;

  if mission_actual_tokens > policy.mission_max_actual_total_tokens then
    halt_reason := 'mission_actual_token_cap_exceeded_after_call';
  elsif stage_actual_tokens > stage_cap.max_actual_total_tokens then
    halt_reason := 'stage_actual_token_cap_exceeded_after_call';
  elsif mission_actual_cost > policy.mission_max_actual_cost_usd then
    halt_reason := 'mission_actual_cost_cap_exceeded_after_call';
  elsif stage_actual_cost > stage_cap.max_actual_cost_usd then
    halt_reason := 'stage_actual_cost_cap_exceeded_after_call';
  end if;

  if halt_reason is not null then
    halt_message := 'Research work halted after a completed provider call exceeded an actual-usage cap.';
    select * into linked_job
    from public.research_ingestion_jobs
    where id = call_row.research_ingestion_job_id
    for update;
    if linked_job.id is not null and linked_job.status in ('queued', 'running') then
      update public.research_ingestion_jobs
      set status = 'failed', error_message = halt_message, completed_at = now(), updated_at = now()
      where id = linked_job.id;
    end if;
    -- Preserve the completed call, fail this attempt, and keep the parent
    -- mission partial so an owner-authorized retry can create a new attempt.
    update public.research_mission_stages
    set status = 'failed', reason_code = halt_reason, error_message = halt_message,
      completed_at = now()
    where id = linked_stage.id and status in ('pending', 'running');
    update public.research_missions
    set status = 'partial', terminal_reason_code = halt_reason, terminal_message = halt_message,
      completed_at = now()
    where id = linked_mission.id and status in ('queued', 'running');
    perform public.append_research_mission_event(
      call_row.mission_id,
      call_row.mission_stage_id,
      'budget.halted',
      'worker',
      null,
      jsonb_build_object(
        'job_id', call_row.research_ingestion_job_id,
        'provider_call_id', call_row.id,
        'reason_code', halt_reason,
        'provider_call_started', true,
        'provider_call_completed', true
      )
    );
  end if;

  return jsonb_build_object(
    'replay', false,
    'budget_halt_reason_code', halt_reason,
    'call', to_jsonb(call_row)
  );
end;
$$;

-- Keep the compatibility job totals actual-only. Caller-supplied estimates are
-- intentionally ignored; incomplete actual coverage remains null rather than
-- being presented as a complete actual total.
create or replace function public.finish_research_mission_job(
  p_job_id uuid,
  p_job_status text,
  p_result_summary jsonb default null,
  p_reason_code text default null,
  p_error_message text default null,
  p_gateway_model text default null,
  p_gateway_input_tokens bigint default null,
  p_gateway_output_tokens bigint default null,
  p_gateway_cost_usd numeric default null,
  p_event_payload jsonb default '{}'::jsonb
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  linked_job public.research_ingestion_jobs%rowtype;
  finished_time timestamptz := now();
  stage_status text;
  mission_status text;
  stage_event_type text;
  mission_event_type text;
  provider_call_count bigint;
  fully_reported_usage boolean;
  fully_reported_cost boolean;
  actual_input_tokens bigint;
  actual_output_tokens bigint;
  actual_cost_usd numeric;
  actual_models text;
begin
  -- Keep the P0 RPC signature compatible while deliberately discarding these
  -- caller-supplied fields. Only persisted call-row actuals may populate the
  -- compatibility job totals below.
  perform p_gateway_model, p_gateway_input_tokens, p_gateway_output_tokens,
    p_gateway_cost_usd;

  if p_job_status not in ('awaiting_selection', 'succeeded', 'failed') then
    raise exception 'Unsupported terminal research ingestion job status';
  end if;
  if p_job_status = 'failed' and length(btrim(coalesce(p_reason_code, ''))) = 0 then
    raise exception 'A deterministic reason code is required for failed research mission jobs';
  end if;
  if p_job_status = 'failed' and length(btrim(coalesce(p_error_message, ''))) = 0 then
    raise exception 'An error message is required for failed research mission jobs';
  end if;
  if p_result_summary is not null and jsonb_typeof(p_result_summary) <> 'object' then
    raise exception 'Research mission result summary must be a JSON object';
  end if;

  select * into linked_job
  from public.research_ingestion_jobs
  where id = p_job_id
  for update;
  if linked_job.id is null or linked_job.mission_id is null or linked_job.mission_stage_id is null then
    raise exception 'Linked research mission job not found';
  end if;
  if linked_job.status = p_job_status then
    return to_jsonb(linked_job);
  end if;
  if linked_job.status not in ('queued', 'running') then
    raise exception 'Research mission job is already terminal';
  end if;

  select
    count(*),
    coalesce(bool_and(call.actual_usage_source = 'provider_reported'), true),
    coalesce(bool_and(call.actual_cost_usd is not null), true),
    sum(call.actual_input_tokens),
    sum(call.actual_output_tokens),
    sum(call.actual_cost_usd),
    string_agg(
      distinct call.configured_model_identifier,
      ' + ' order by call.configured_model_identifier
    )
  into
    provider_call_count,
    fully_reported_usage,
    fully_reported_cost,
    actual_input_tokens,
    actual_output_tokens,
    actual_cost_usd,
    actual_models
  from public.research_provider_calls call
  where call.research_ingestion_job_id = linked_job.id;

  stage_status := case when p_job_status = 'failed' then 'failed' else 'succeeded' end;
  mission_status := case when p_job_status = 'failed' then 'failed' else 'completed' end;
  stage_event_type := case when p_job_status = 'failed' then 'stage.failed' else 'stage.succeeded' end;
  mission_event_type := case when p_job_status = 'failed' then 'mission.failed' else 'mission.completed' end;

  update public.research_ingestion_jobs
  set
    status = p_job_status,
    result_summary = coalesce(p_result_summary, result_summary),
    error_message = case when p_job_status = 'failed' then p_error_message else null end,
    gateway_model = case when provider_call_count > 0 then actual_models else null end,
    gateway_input_tokens = case when provider_call_count > 0 and fully_reported_usage then actual_input_tokens else null end,
    gateway_output_tokens = case when provider_call_count > 0 and fully_reported_usage then actual_output_tokens else null end,
    gateway_cost_usd = case when provider_call_count > 0 and fully_reported_cost then actual_cost_usd else null end,
    started_at = coalesce(started_at, finished_time),
    completed_at = finished_time,
    updated_at = finished_time
  where id = p_job_id
  returning * into linked_job;

  update public.research_mission_stages
  set
    status = stage_status,
    result_summary = coalesce(p_result_summary, result_summary),
    reason_code = case when p_job_status = 'failed' then p_reason_code else null end,
    error_message = case when p_job_status = 'failed' then p_error_message else null end,
    started_at = coalesce(started_at, finished_time),
    completed_at = finished_time
  where id = linked_job.mission_stage_id;

  update public.research_missions
  set
    status = mission_status,
    result_summary = coalesce(p_result_summary, result_summary),
    terminal_reason_code = case when p_job_status = 'failed' then p_reason_code else null end,
    terminal_message = case when p_job_status = 'failed' then p_error_message else null end,
    started_at = coalesce(started_at, finished_time),
    completed_at = finished_time
  where id = linked_job.mission_id;

  perform public.append_research_mission_event(
    linked_job.mission_id,
    linked_job.mission_stage_id,
    stage_event_type,
    'worker',
    null,
    jsonb_build_object(
      'job_id', linked_job.id,
      'job_status', p_job_status,
      'reason_code', p_reason_code,
      'provider_call_count', provider_call_count,
      'actual_usage_complete', provider_call_count > 0 and fully_reported_usage,
      'actual_cost_complete', provider_call_count > 0 and fully_reported_cost
    ) || coalesce(p_event_payload, '{}'::jsonb)
  );
  perform public.append_research_mission_event(
    linked_job.mission_id,
    null,
    mission_event_type,
    'worker',
    null,
    jsonb_build_object(
      'job_id', linked_job.id,
      'status', mission_status,
      'reason_code', p_reason_code
    )
  );

  return to_jsonb(linked_job);
end;
$$;

alter table public.research_usage_estimate_rate_versions enable row level security;
alter table public.research_budget_policy_versions enable row level security;
alter table public.research_budget_stage_cap_versions enable row level security;
alter table public.research_provider_calls enable row level security;

revoke all on table public.research_usage_estimate_rate_versions from anon, authenticated, service_role;
revoke all on table public.research_budget_policy_versions from anon, authenticated, service_role;
revoke all on table public.research_budget_stage_cap_versions from anon, authenticated, service_role;
revoke all on table public.research_provider_calls from anon, authenticated, service_role;
grant select on table public.research_usage_estimate_rate_versions to service_role;
grant select on table public.research_budget_policy_versions to service_role;
grant select on table public.research_budget_stage_cap_versions to service_role;
grant select, insert, update on table public.research_provider_calls to service_role;

revoke execute on function public.prevent_research_provider_call_identity_mutation() from public, anon, authenticated;
revoke execute on function public.prevent_research_provider_call_delete() from public, anon, authenticated;
revoke execute on function public.validate_research_provider_call_links() from public, anon, authenticated;
revoke execute on function public.begin_research_provider_call(uuid, uuid, text, bigint, bigint, bigint, numeric, text, text, uuid) from public, anon, authenticated;
revoke execute on function public.complete_research_provider_call(uuid, text, text, bigint, bigint, bigint, bigint, bigint, bigint, numeric, text, text, text, text, bigint, bigint, text, text) from public, anon, authenticated;
grant execute on function public.prevent_research_provider_call_identity_mutation() to service_role;
grant execute on function public.prevent_research_provider_call_delete() to service_role;
grant execute on function public.validate_research_provider_call_links() to service_role;
grant execute on function public.begin_research_provider_call(uuid, uuid, text, bigint, bigint, bigint, numeric, text, text, uuid) to service_role;
grant execute on function public.complete_research_provider_call(uuid, text, text, bigint, bigint, bigint, bigint, bigint, bigint, numeric, text, text, text, text, bigint, bigint, text, text) to service_role;

comment on table public.research_provider_calls is
  'Global research provider calls only. Provider-reported actual usage/timing is stored separately from labelled estimates; private dog reports are outside this table and its functions.';
comment on column public.research_provider_calls.actual_cost_usd is
  'Actual provider/gateway-reported cost only. Null when the provider did not report a cost.';
comment on column public.research_provider_calls.estimated_cost_usd is
  'Explicit estimate from the pinned estimate method/rate snapshot. Never actual cost.';
