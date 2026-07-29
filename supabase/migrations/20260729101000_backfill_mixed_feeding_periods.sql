-- Run-2 backfill, to be applied only after the owner reviews Run 1 output.
--
-- Evidence observed in Run 1:
--   6 dogs have exactly one legacy current-food identity
--   3 have an exact matching open main_food event (start time captured)
--   3 have only a current freetext pointer (start time unknown)
--   1 baseline has a provable catalogue-food match
--   13 log rows have a provable food_id_active match and fall within that event
--   3 initial-period analyses map to an exact legacy event: 1 has a confirmed
--     composition and 2 are explicitly unanalysable because composition is opaque
--
-- No role, share, schedule, days or meal slot is inferred.

do $$
declare
  candidate_count integer;
  exact_event_count integer;
  pointer_only_count integer;
begin
  select
    count(*),
    count(*) filter (where e.id is not null),
    count(*) filter (where e.id is null)
  into candidate_count, exact_event_count, pointer_only_count
  from public.dogs d
  left join public.dog_food_events e
    on e.dog_id = d.id
   and e.event_type = 'main_food'
   and e.ended_at is null
   and e.food_or_treat_id is not distinct from d.current_food_id
   and e.food_or_treat_freetext is not distinct from d.current_food_freetext
  where
    (d.current_food_id is not null and d.current_food_freetext is null)
    or
    (
      d.current_food_id is null
      and d.current_food_freetext is not null
      and btrim(d.current_food_freetext) <> ''
    );

  if candidate_count <> 6 or exact_event_count <> 3 or pointer_only_count <> 3 then
    raise exception
      'Expected 6 diet candidates (3 exact events, 3 pointer-only), found % (%, %)',
      candidate_count,
      exact_event_count,
      pointer_only_count;
  end if;
end
$$;

insert into public.dog_diet_periods (
  dog_id,
  started_at,
  start_time_captured,
  ended_at,
  in_transition_until,
  source,
  legacy_food_event_id
)
select
  d.id,
  e.started_at,
  e.id is not null,
  null,
  e.in_transition_until,
  case
    when e.id is not null then 'legacy_food_event'::public.diet_period_source
    else 'legacy_pointer'::public.diet_period_source
  end,
  e.id
from public.dogs d
left join public.dog_food_events e
  on e.dog_id = d.id
 and e.event_type = 'main_food'
 and e.ended_at is null
 and e.food_or_treat_id is not distinct from d.current_food_id
 and e.food_or_treat_freetext is not distinct from d.current_food_freetext
where
  (d.current_food_id is not null and d.current_food_freetext is null)
  or
  (
    d.current_food_id is null
    and d.current_food_freetext is not null
    and btrim(d.current_food_freetext) <> ''
  );

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
  d.id,
  p.id,
  d.current_food_id,
  case
    when d.current_food_id is null then btrim(d.current_food_freetext)
    else null
  end,
  null,
  null,
  null,
  null,
  null
from public.dogs d
join public.dog_diet_periods p
  on p.dog_id = d.id
 and p.ended_at is null
where
  (d.current_food_id is not null and d.current_food_freetext is null)
  or
  (
    d.current_food_id is null
    and d.current_food_freetext is not null
    and btrim(d.current_food_freetext) <> ''
  );

do $$
declare
  baseline_count integer;
  log_count integer;
  analysis_count integer;
begin
  select count(*)
  into baseline_count
  from public.dog_baselines b
  join public.dog_diet_periods p on p.dog_id = b.dog_id and p.ended_at is null
  join public.dog_diet_components c
    on c.diet_period_id = p.id
   and c.food_id = b.food_at_baseline_id
  where b.food_at_baseline_id is not null
    and p.started_at is not null
    and b.established_at >= p.started_at
    and b.created_at >= p.started_at;

  select count(*)
  into log_count
  from public.dog_log_entries l
  join public.dog_diet_periods p on p.dog_id = l.dog_id and p.ended_at is null
  join public.dog_diet_components c
    on c.diet_period_id = p.id
   and c.food_id = l.food_id_active
  where l.food_id_active is not null
    and p.started_at is not null
    and l.created_at >= p.started_at
    and l.log_date >= (p.started_at at time zone 'Europe/London')::date;

  select count(*)
  into analysis_count
  from public.dog_food_switch_analyses a
  join public.dog_diet_periods p
    on p.dog_id = a.dog_id
   and p.legacy_food_event_id = a.to_event_id
  where a.from_event_id is null;

  if baseline_count <> 1 or log_count <> 13 or analysis_count <> 3 then
    raise exception
      'Expected attribution counts baseline=1, logs=13, analyses=3; found %, %, %',
      baseline_count,
      log_count,
      analysis_count;
  end if;
end
$$;

update public.dog_baselines b
set diet_period_id = p.id
from public.dog_diet_periods p
join public.dog_diet_components c on c.diet_period_id = p.id
where p.dog_id = b.dog_id
  and p.ended_at is null
  and b.food_at_baseline_id is not null
  and c.food_id = b.food_at_baseline_id
  and p.started_at is not null
  and b.established_at >= p.started_at
  and b.created_at >= p.started_at;

update public.dog_log_entries l
set diet_period_id = p.id
from public.dog_diet_periods p
join public.dog_diet_components c on c.diet_period_id = p.id
where p.dog_id = l.dog_id
  and p.ended_at is null
  and l.food_id_active is not null
  and c.food_id = l.food_id_active
  and p.started_at is not null
  and l.created_at >= p.started_at
  and l.log_date >= (p.started_at at time zone 'Europe/London')::date;

update public.dog_food_switch_analyses a
set
  to_diet_period_id = p.id,
  analysis_status = case
    when composition.confirmable
      then 'initial_period'::public.diet_period_analysis_status
    else 'unanalysable'::public.diet_period_analysis_status
  end,
  unanalysable_reason = case
    when composition.confirmable
      then null
    else 'At least one diet component has no confirmable composition data.'
  end
from public.dog_diet_periods p
cross join lateral (
  select coalesce(
    bool_and(
      c.food_id is not null
      and f.ingredient_data_status = 'complete'
      and exists (
        select 1
        from public.food_ingredients fi
        where fi.food_id = c.food_id
      )
    ),
    false
  ) as confirmable
  from public.dog_diet_components c
  left join public.foods f on f.id = c.food_id
  where c.diet_period_id = p.id
) composition
where p.dog_id = a.dog_id
  and p.legacy_food_event_id = a.to_event_id
  and a.from_event_id is null;
