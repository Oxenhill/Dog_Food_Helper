-- Stool baselines, food-change monitoring windows, and one row per observed
-- stool. Daily summaries are derived at read time.
--
-- Frequency is a distinct outcome from consistency. Keeping it in the enum
-- lets switch analyses and ingredient signals identify which fact moved.
alter type public.outcome_metric add value if not exists 'stool_frequency';

-- Composite keys let child rows prove every linked object belongs to the same
-- dog. A plain UUID FK would permit cross-dog links if an id were supplied.
create unique index dog_baselines_id_dog_unique
  on public.dog_baselines (id, dog_id);
create unique index dog_food_events_id_dog_unique
  on public.dog_food_events (id, dog_id);
create unique index dog_log_entries_id_dog_unique
  on public.dog_log_entries (id, dog_id);

-- Baseline is a representative profile, not a bowel movement. Multiple chart
-- scores are normal; count is an owner-recorded range rather than a guessed
-- average.
create table public.dog_stool_baselines (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  dog_baseline_id uuid not null,
  established_at timestamptz not null,
  typical_scores smallint[] not null,
  typical_count_min smallint,
  typical_count_max smallint,
  created_at timestamptz not null default now(),

  constraint dog_stool_baselines_scores_check
    check (
      cardinality(typical_scores) > 0
      and typical_scores <@ array[1,2,3,4,5,6,7]::smallint[]
    ),
  constraint dog_stool_baselines_count_check
    check (
      (typical_count_min is null and typical_count_max is null)
      or
      (
        typical_count_min between 0 and 30
        and typical_count_max between typical_count_min and 30
      )
    ),
  constraint dog_stool_baselines_baseline_dog_fkey
    foreign key (dog_baseline_id, dog_id)
    references public.dog_baselines(id, dog_id)
    on delete cascade,
  constraint dog_stool_baselines_one_per_baseline
    unique (dog_baseline_id),
  constraint dog_stool_baselines_id_dog_unique
    unique (id, dog_id)
);

create index dog_stool_baselines_dog_established
  on public.dog_stool_baselines (dog_id, established_at desc);

comment on table public.dog_stool_baselines is
  'Representative stool pattern at a dog baseline. Not a stool event and never included in daily event count.';
comment on column public.dog_stool_baselines.typical_scores is
  'Owner-selected set of representative Bowl stool chart scores; multiple values are normal.';
comment on column public.dog_stool_baselines.typical_count_min is
  'Owner-recorded lower end of the dog''s usual stools-per-day range. Null means not captured.';
comment on column public.dog_stool_baselines.typical_count_max is
  'Owner-recorded upper end of the dog''s usual stools-per-day range. Null means not captured.';

-- Window opens when an established food is changed. Missing baseline remains
-- explicit rather than being filled with an inferred reference.
create table public.dog_stool_monitoring_windows (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  baseline_id uuid,
  food_event_id uuid not null,
  opened_at timestamptz not null,
  closed_at timestamptz,
  created_at timestamptz not null default now(),

  constraint dog_stool_monitoring_windows_dates_check
    check (closed_at is null or closed_at >= opened_at),
  constraint dog_stool_monitoring_windows_baseline_dog_fkey
    foreign key (baseline_id, dog_id)
    references public.dog_stool_baselines(id, dog_id)
    on delete set null (baseline_id),
  constraint dog_stool_monitoring_windows_food_event_dog_fkey
    foreign key (food_event_id, dog_id)
    references public.dog_food_events(id, dog_id)
    on delete cascade,
  constraint dog_stool_monitoring_windows_one_per_food_event
    unique (food_event_id),
  constraint dog_stool_monitoring_windows_id_dog_unique
    unique (id, dog_id)
);

create unique index dog_stool_monitoring_windows_one_open
  on public.dog_stool_monitoring_windows (dog_id)
  where closed_at is null;

create index dog_stool_monitoring_windows_dog_opened
  on public.dog_stool_monitoring_windows (dog_id, opened_at desc);

comment on table public.dog_stool_monitoring_windows is
  'Monitoring period opened by a recorded food change. Links stool observations to the baseline and food event being assessed.';

-- One row per observed stool.
--
-- occurred_at is deliberately nullable for legacy/imported records where only
-- a calendar date is known. Casting a date to timestamptz would fabricate
-- midnight. occurred_on preserves the known day without claiming a time.
create table public.dog_stool_events (
  id uuid primary key default gen_random_uuid(),
  dog_id uuid not null references public.dogs(id) on delete cascade,
  occurred_on date not null,
  occurred_at timestamptz,
  time_of_day_captured boolean not null default true,
  score smallint,
  mucus boolean,
  blood boolean,
  urgency boolean,
  straining boolean,
  undigested_food boolean,
  note text,
  legacy_log_entry_id uuid,
  legacy_trend public.trend_direction,
  monitoring_window_id uuid,
  created_at timestamptz not null default now(),

  constraint dog_stool_events_score_check
    check (score is null or score between 1 and 7),
  constraint dog_stool_events_time_provenance_check
    check (
      (time_of_day_captured and occurred_at is not null)
      or
      (not time_of_day_captured and occurred_at is null)
    ),
  constraint dog_stool_events_unknown_score_is_legacy_check
    check (score is not null or legacy_log_entry_id is not null),
  constraint dog_stool_events_window_or_legacy_check
    check (monitoring_window_id is not null or legacy_log_entry_id is not null),
  constraint dog_stool_events_legacy_trend_provenance_check
    check (legacy_trend is null or legacy_log_entry_id is not null),
  constraint dog_stool_events_legacy_log_dog_fkey
    foreign key (legacy_log_entry_id, dog_id)
    references public.dog_log_entries(id, dog_id)
    on delete restrict,
  constraint dog_stool_events_legacy_log_unique
    unique (legacy_log_entry_id),
  constraint dog_stool_events_monitoring_window_dog_fkey
    foreign key (monitoring_window_id, dog_id)
    references public.dog_stool_monitoring_windows(id, dog_id)
    on delete set null (monitoring_window_id)
);

create index dog_stool_events_dog_day
  on public.dog_stool_events (dog_id, occurred_on desc);

create index dog_stool_events_dog_occurred_at
  on public.dog_stool_events (dog_id, occurred_at desc)
  where occurred_at is not null;

comment on table public.dog_stool_events is
  'One row per observed stool. Daily count, highest/worst loose-stool score, median and spread are derived at read time.';
comment on column public.dog_stool_events.occurred_on is
  'Owner-local calendar day. Required because legacy records may have a date but no known time.';
comment on column public.dog_stool_events.occurred_at is
  'Actual occurrence time when captured. Null means time was not recorded; never populated with invented midnight.';
comment on column public.dog_stool_events.time_of_day_captured is
  'True only when occurred_at contains a captured time of day.';
comment on column public.dog_stool_events.score is
  'Bowl 1-7 stool chart score. Nullable only for a provenance-linked legacy entry that did not capture an absolute score.';
comment on column public.dog_stool_events.legacy_log_entry_id is
  'Source dog_log_entries row for an explicitly reviewed legacy migration. Unique for idempotency.';
comment on column public.dog_stool_events.legacy_trend is
  'Original baseline-relative trend when a legacy row had no absolute score. Historical provenance only; never inferred.';
comment on column public.dog_stool_events.monitoring_window_id is
  'Food-change monitoring window active when this event was recorded. Null when no monitoring window was open.';

alter table public.dog_stool_baselines enable row level security;
alter table public.dog_stool_monitoring_windows enable row level security;
alter table public.dog_stool_events enable row level security;

revoke all on table public.dog_stool_baselines from anon;
revoke all on table public.dog_stool_monitoring_windows from anon;
revoke all on table public.dog_stool_events from anon;
grant select, insert, update, delete on table public.dog_stool_baselines to authenticated;
grant select on table public.dog_stool_monitoring_windows to authenticated;
grant select, insert, update, delete on table public.dog_stool_events to authenticated;
grant all on table public.dog_stool_baselines to service_role;
grant all on table public.dog_stool_monitoring_windows to service_role;
grant all on table public.dog_stool_events to service_role;

create policy "owners read their own stool baselines"
on public.dog_stool_baselines
for select
to authenticated
using (
  exists (
    select 1 from public.dogs
    where dogs.id = dog_stool_baselines.dog_id
      and dogs.owner_id = (select auth.uid())
  )
);

create policy "owners insert their own stool baselines"
on public.dog_stool_baselines
for insert
to authenticated
with check (
  exists (
    select 1 from public.dogs
    where dogs.id = dog_stool_baselines.dog_id
      and dogs.owner_id = (select auth.uid())
  )
);

create policy "owners read their own stool monitoring windows"
on public.dog_stool_monitoring_windows
for select
to authenticated
using (
  exists (
    select 1 from public.dogs
    where dogs.id = dog_stool_monitoring_windows.dog_id
      and dogs.owner_id = (select auth.uid())
  )
);

create policy "owners read their own stool events"
on public.dog_stool_events
for select
to authenticated
using (
  exists (
    select 1
    from public.dogs
    where dogs.id = dog_stool_events.dog_id
      and dogs.owner_id = (select auth.uid())
  )
);

create policy "owners insert their own stool events"
on public.dog_stool_events
for insert
to authenticated
with check (
  exists (
    select 1
    from public.dogs
    where dogs.id = dog_stool_events.dog_id
      and dogs.owner_id = (select auth.uid())
  )
  and legacy_log_entry_id is null
  and legacy_trend is null
  and monitoring_window_id is not null
);

create policy "owners update their own stool events"
on public.dog_stool_events
for update
to authenticated
using (
  exists (
    select 1
    from public.dogs
    where dogs.id = dog_stool_events.dog_id
      and dogs.owner_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1
    from public.dogs
    where dogs.id = dog_stool_events.dog_id
      and dogs.owner_id = (select auth.uid())
  )
  and legacy_log_entry_id is null
  and legacy_trend is null
  and monitoring_window_id is not null
);

create policy "owners delete their own stool events"
on public.dog_stool_events
for delete
to authenticated
using (
  exists (
    select 1
    from public.dogs
    where dogs.id = dog_stool_events.dog_id
      and dogs.owner_id = (select auth.uid())
  )
  and legacy_log_entry_id is null
);

-- Keep the central privacy assertion aware of the new auth-linked table.
create or replace function public.assert_private_tables_stay_private()
returns void
language plpgsql
set search_path to ''
as $function$
declare
  private_tables constant text[] := array[
    'dogs',
    'dog_baselines',
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
