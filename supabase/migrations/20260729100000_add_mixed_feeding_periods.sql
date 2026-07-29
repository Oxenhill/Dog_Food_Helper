-- Mixed feeding: one immutable diet period contains a flat set of components.
-- No component is primary. A period is the atomic temporal unit needed to
-- distinguish a real set change from a sequence of component-row edits.

create type public.diet_component_role as enum (
  'topper',
  'mixer',
  'supplement',
  'treat'
);

create type public.diet_component_share as enum (
  'most',
  'about_half',
  'small_amount',
  'spoonful'
);

create type public.diet_component_schedule as enum (
  'every_meal',
  'daily',
  'specific_days',
  'rotating',
  'occasional'
);

create type public.diet_meal_slot as enum (
  'morning',
  'evening',
  'any'
);

create type public.diet_period_source as enum (
  'owner_recorded',
  'legacy_food_event',
  'legacy_pointer'
);

create type public.diet_period_analysis_status as enum (
  'initial_period',
  'analysable',
  'unanalysable'
);

create table public.dog_diet_periods (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  started_at timestamptz,
  start_time_captured boolean not null,
  ended_at timestamptz,
  in_transition_until timestamptz,
  source public.diet_period_source not null,
  legacy_food_event_id uuid,
  created_at timestamptz not null default now(),

  constraint dog_diet_periods_time_provenance_check
    check (
      (start_time_captured and started_at is not null)
      or
      (not start_time_captured and started_at is null)
    ),
  constraint dog_diet_periods_dates_check
    check (ended_at is null or started_at is null or ended_at >= started_at),
  constraint dog_diet_periods_transition_check
    check (
      in_transition_until is null
      or
      (started_at is not null and in_transition_until >= started_at)
    ),
  constraint dog_diet_periods_legacy_event_dog_fkey
    foreign key (legacy_food_event_id, dog_id)
    references public.dog_food_events(id, dog_id)
    on delete restrict,
  constraint dog_diet_periods_legacy_event_unique
    unique (legacy_food_event_id),
  constraint dog_diet_periods_id_dog_unique
    unique (id, dog_id)
);

create unique index dog_diet_periods_one_open
  on public.dog_diet_periods (dog_id)
  where ended_at is null;

create index dog_diet_periods_dog_started
  on public.dog_diet_periods (dog_id, started_at desc nulls last);

comment on table public.dog_diet_periods is
  'Versioned identity of a dog''s whole diet component set. The set changes atomically; no component is primary.';
comment on column public.dog_diet_periods.started_at is
  'Actual start time when captured. Null for a legacy current-diet pointer whose start was never recorded.';
comment on column public.dog_diet_periods.start_time_captured is
  'True only when started_at is evidence-backed. Never replace an unknown legacy start with dogs.created_at or midnight.';

create table public.dog_diet_components (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  diet_period_id uuid not null,
  food_id uuid references public.foods(id) on delete restrict,
  food_freetext text,
  role public.diet_component_role,
  share public.diet_component_share,
  schedule public.diet_component_schedule,
  days_of_week smallint[],
  meal_slot public.diet_meal_slot,
  created_at timestamptz not null default now(),

  constraint dog_diet_components_period_dog_fkey
    foreign key (diet_period_id, dog_id)
    references public.dog_diet_periods(id, dog_id)
    on delete cascade,
  constraint dog_diet_components_identity_check
    check (
      (food_id is not null and food_freetext is null)
      or
      (
        food_id is null
        and food_freetext is not null
        and btrim(food_freetext) <> ''
      )
    ),
  constraint dog_diet_components_days_range_check
    check (
      days_of_week is null
      or
      (
        cardinality(days_of_week) > 0
        and days_of_week <@ array[1,2,3,4,5,6,7]::smallint[]
      )
    ),
  constraint dog_diet_components_specific_days_check
    check (
      (schedule = 'specific_days' and days_of_week is not null)
      or
      (schedule is distinct from 'specific_days' and days_of_week is null)
    )
);

create unique index dog_diet_components_catalogue_unique
  on public.dog_diet_components (diet_period_id, food_id)
  where food_id is not null;

create unique index dog_diet_components_freetext_unique
  on public.dog_diet_components (diet_period_id, lower(btrim(food_freetext)))
  where food_freetext is not null;

create index dog_diet_components_period
  on public.dog_diet_components (diet_period_id);

create index dog_diet_components_dog
  on public.dog_diet_components (dog_id);

comment on table public.dog_diet_components is
  'Flat component set for one diet period. role is descriptive only and must never be used to privilege a component in logic.';
comment on column public.dog_diet_components.share is
  'Owner-selected ordinal only; nullable. Never a guessed percentage.';
comment on column public.dog_diet_components.schedule is
  'Owner-recorded schedule. Null means not captured; never infer from role or share.';

-- Move every attribution surface to the diet-period identity. Singular food
-- columns remain for historical provenance only and are never derived.
alter table public.dog_baselines
  add column diet_period_id uuid;

alter table public.dog_baselines
  add constraint dog_baselines_diet_period_dog_fkey
  foreign key (diet_period_id, dog_id)
  references public.dog_diet_periods(id, dog_id)
  on delete set null (diet_period_id);

alter table public.dog_log_entries
  add column diet_period_id uuid;

alter table public.dog_log_entries
  add constraint dog_log_entries_diet_period_dog_fkey
  foreign key (diet_period_id, dog_id)
  references public.dog_diet_periods(id, dog_id)
  on delete set null (diet_period_id);

create index dog_log_entries_diet_period
  on public.dog_log_entries (diet_period_id)
  where diet_period_id is not null;

alter table public.dog_food_switch_analyses
  add column from_diet_period_id uuid,
  add column to_diet_period_id uuid,
  add column analysis_status public.diet_period_analysis_status,
  add column unanalysable_reason text;

alter table public.dog_food_switch_analyses
  alter column to_event_id drop not null,
  alter column switched_at drop not null;

alter table public.dog_food_switch_analyses
  add constraint dog_food_switch_analyses_from_diet_dog_fkey
  foreign key (from_diet_period_id, dog_id)
  references public.dog_diet_periods(id, dog_id)
  on delete cascade;

alter table public.dog_food_switch_analyses
  add constraint dog_food_switch_analyses_to_diet_dog_fkey
  foreign key (to_diet_period_id, dog_id)
  references public.dog_diet_periods(id, dog_id)
  on delete cascade;

alter table public.dog_food_switch_analyses
  add constraint dog_food_switch_analyses_target_check
  check (to_diet_period_id is not null or to_event_id is not null);

alter table public.dog_food_switch_analyses
  add constraint dog_food_switch_analyses_unanalysable_reason_check
  check (
    (analysis_status = 'unanalysable' and unanalysable_reason is not null)
    or
    (analysis_status is distinct from 'unanalysable' and unanalysable_reason is null)
  );

create unique index dog_food_switch_analyses_to_diet_unique
  on public.dog_food_switch_analyses (to_diet_period_id)
  where to_diet_period_id is not null;

alter table public.dog_stool_monitoring_windows
  add column diet_period_id uuid;

alter table public.dog_stool_monitoring_windows
  alter column food_event_id drop not null;

alter table public.dog_stool_monitoring_windows
  add constraint dog_stool_monitoring_windows_diet_period_dog_fkey
  foreign key (diet_period_id, dog_id)
  references public.dog_diet_periods(id, dog_id)
  on delete cascade;

alter table public.dog_stool_monitoring_windows
  add constraint dog_stool_monitoring_windows_source_check
  check (diet_period_id is not null or food_event_id is not null);

create unique index dog_stool_monitoring_windows_one_per_diet_period
  on public.dog_stool_monitoring_windows (diet_period_id)
  where diet_period_id is not null;

comment on column public.dogs.current_food_id is
  'DEPRECATED legacy pointer. Not derived from dog_diet_components and never read by application logic.';
comment on column public.dogs.current_food_freetext is
  'DEPRECATED legacy pointer. Not derived from dog_diet_components and never read by application logic.';
comment on column public.dog_baselines.food_at_baseline_id is
  'DEPRECATED singular provenance. New baselines use diet_period_id.';
comment on column public.dog_log_entries.food_id_active is
  'DEPRECATED singular provenance. New logs use diet_period_id.';
comment on table public.dog_food_events is
  'Treat occasions plus legacy main_food history. New diet state is stored in dog_diet_periods and dog_diet_components.';

alter table public.dog_diet_periods enable row level security;
alter table public.dog_diet_components enable row level security;

revoke all on table public.dog_diet_periods from anon;
revoke all on table public.dog_diet_components from anon;
grant select on table public.dog_diet_periods to authenticated;
grant select on table public.dog_diet_components to authenticated;
grant all on table public.dog_diet_periods to service_role;
grant all on table public.dog_diet_components to service_role;

create policy "owners read their own diet periods"
on public.dog_diet_periods
for select
to authenticated
using (
  exists (
    select 1 from public.dogs
    where dogs.id = dog_diet_periods.dog_id
      and dogs.owner_id = (select auth.uid())
  )
);

create policy "owners read their own diet components"
on public.dog_diet_components
for select
to authenticated
using (
  exists (
    select 1 from public.dogs
    where dogs.id = dog_diet_components.dog_id
      and dogs.owner_id = (select auth.uid())
  )
);

-- Atomic replacement of the complete flat set. Service-role only: API routes
-- verify ownership before calling it. All component rows, period closure, and
-- stool monitoring are one transaction.
create or replace function public.replace_dog_diet_period(
  p_dog_id uuid,
  p_started_at timestamptz,
  p_transition_days integer,
  p_components jsonb
)
returns table (
  diet_period_id uuid,
  previous_diet_period_id uuid,
  monitoring_window_id uuid
)
language plpgsql
set search_path to ''
as $function$
declare
  v_locked_dog_id uuid;
  v_previous_period_id uuid;
  v_new_period_id uuid;
  v_monitoring_window_id uuid;
  v_baseline_id uuid;
begin
  if p_started_at is null then
    raise exception 'started_at is required for an owner-recorded diet';
  end if;

  if p_transition_days is null or p_transition_days < 0 or p_transition_days > 60 then
    raise exception 'transition_days must be between 0 and 60';
  end if;

  if jsonb_typeof(p_components) <> 'array' or jsonb_array_length(p_components) = 0 then
    raise exception 'at least one diet component is required';
  end if;

  -- Serialize every replacement for one dog, including the first period when
  -- there is no open diet-period row available to lock yet.
  select id
  into v_locked_dog_id
  from public.dogs
  where id = p_dog_id
  for update;

  if v_locked_dog_id is null then
    raise exception 'dog not found';
  end if;

  select id
  into v_previous_period_id
  from public.dog_diet_periods
  where dog_id = p_dog_id
    and ended_at is null
  for update;

  if v_previous_period_id is not null then
    update public.dog_diet_periods
    set ended_at = p_started_at
    where id = v_previous_period_id;

    update public.dog_stool_monitoring_windows
    set closed_at = p_started_at
    where dog_id = p_dog_id
      and closed_at is null;
  end if;

  insert into public.dog_diet_periods (
    dog_id,
    started_at,
    start_time_captured,
    ended_at,
    in_transition_until,
    source
  )
  values (
    p_dog_id,
    p_started_at,
    true,
    null,
    case
      when p_transition_days > 0
        then p_started_at + make_interval(days => p_transition_days)
      else null
    end,
    'owner_recorded'
  )
  returning id into v_new_period_id;

  insert into public.dog_diet_components (
    dog_id,
    diet_period_id,
    food_id,
    food_freetext,
    role,
    share,
    schedule,
    days_of_week,
    meal_slot
  )
  select
    p_dog_id,
    v_new_period_id,
    nullif(component.food_id, '')::uuid,
    nullif(btrim(component.food_freetext), ''),
    nullif(component.role, '')::public.diet_component_role,
    nullif(component.share, '')::public.diet_component_share,
    nullif(component.schedule, '')::public.diet_component_schedule,
    case
      when component.days_of_week is null then null
      else array(
        select jsonb_array_elements_text(component.days_of_week)::smallint
      )
    end,
    nullif(component.meal_slot, '')::public.diet_meal_slot
  from jsonb_to_recordset(p_components) as component(
    food_id text,
    food_freetext text,
    role text,
    share text,
    schedule text,
    days_of_week jsonb,
    meal_slot text
  );

  if v_previous_period_id is not null then
    select id
    into v_baseline_id
    from public.dog_stool_baselines
    where dog_id = p_dog_id
      and established_at <= p_started_at
    order by established_at desc, created_at desc
    limit 1;

    insert into public.dog_stool_monitoring_windows (
      dog_id,
      baseline_id,
      food_event_id,
      diet_period_id,
      opened_at
    )
    values (
      p_dog_id,
      v_baseline_id,
      null,
      v_new_period_id,
      p_started_at
    )
    returning id into v_monitoring_window_id;
  end if;

  return query
  select v_new_period_id, v_previous_period_id, v_monitoring_window_id;
end;
$function$;

revoke all on function public.replace_dog_diet_period(uuid, timestamptz, integer, jsonb)
  from public, anon, authenticated;
grant execute on function public.replace_dog_diet_period(uuid, timestamptz, integer, jsonb)
  to service_role;

-- Keep the central privacy assertion aware of both auth-linked tables.
create or replace function public.assert_private_tables_stay_private()
returns void
language plpgsql
set search_path to ''
as $function$
declare
  private_tables constant text[] := array[
    'dogs',
    'dog_baselines',
    'dog_diet_components',
    'dog_diet_periods',
    'dog_document_findings',
    'dog_documents',
    'dog_food_events',
    'dog_food_switch_analyses',
    'dog_health_conditions',
    'dog_ingredient_suspects',
    'dog_log_entries',
    'dog_recommendation_sets',
    'dog_red_flag_events',
    'dog_restrictions',
    'dog_stool_baselines',
    'dog_stool_events',
    'dog_stool_monitoring_windows',
    'dog_weight_logs',
    'user_profiles',
    'contributed_foods'
  ];
  missing_or_unprotected_count integer;
  published_relation_count integer;
  published_dependency_count integer;
  privileged_relation_count integer;
begin
  select count(*) into missing_or_unprotected_count
  from unnest(private_tables) as private_table(table_name)
  left join pg_catalog.pg_namespace n
    on n.nspname = 'public'
  left join pg_catalog.pg_class c
    on c.relnamespace = n.oid
   and c.relname = private_table.table_name
   and c.relkind in ('r', 'p')
  where c.oid is null or not c.relrowsecurity;

  if missing_or_unprotected_count > 0 then
    raise exception
      'private-table boundary: % listed relation(s) are missing from public or do not have RLS enabled',
      missing_or_unprotected_count;
  end if;

  select count(*) into published_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'catalogue'
    and c.relname = any(private_tables)
    and c.relkind in ('r', 'v', 'm', 'p', 'f');

  if published_relation_count > 0 then
    raise exception
      'private-table boundary: % private relation name(s) exist in catalogue',
      published_relation_count;
  end if;

  select count(distinct private_class.oid) into published_dependency_count
  from pg_catalog.pg_rewrite rw
  join pg_catalog.pg_class view_class on view_class.oid = rw.ev_class
  join pg_catalog.pg_namespace view_ns on view_ns.oid = view_class.relnamespace
  join pg_catalog.pg_depend d
    on d.objid = rw.oid
   and d.classid = 'pg_catalog.pg_rewrite'::pg_catalog.regclass
   and d.refclassid = 'pg_catalog.pg_class'::pg_catalog.regclass
  join pg_catalog.pg_class private_class on private_class.oid = d.refobjid
  join pg_catalog.pg_namespace private_ns on private_ns.oid = private_class.relnamespace
  where view_ns.nspname = 'catalogue'
    and private_ns.nspname = 'public'
    and private_class.relname = any(private_tables);

  if published_dependency_count > 0 then
    raise exception
      'private-table boundary: catalogue views depend on % private relation(s)',
      published_dependency_count;
  end if;

  select count(*) into privileged_relation_count
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relname = any(private_tables)
    and pg_catalog.has_table_privilege(
      'catalogue_export',
      c.oid,
      'SELECT,INSERT,UPDATE,DELETE,TRUNCATE,REFERENCES,TRIGGER'
    );

  if privileged_relation_count > 0 then
    raise exception
      'private-table boundary: catalogue_export holds privileges on % private relation(s)',
      privileged_relation_count;
  end if;
end;
$function$;

select public.assert_private_tables_stay_private();
