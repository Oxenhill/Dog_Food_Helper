-- Backfill only the legacy rows proven to have been written by baseline setup.
--
-- Run 1 established that exactly three scored stool log rows were created
-- within five seconds of their corresponding dog_baselines.established_at.
-- They represent typical baseline scores, not observed stool events.
--
-- Counts were never captured, so typical_count_min/max remain NULL.
-- No dog_stool_events or monitoring windows are inferred by this migration.

do $$
declare
  candidate_count integer;
begin
  select count(*)
  into candidate_count
  from public.dog_baselines b
  join lateral (
    select l.id
    from public.dog_log_entries l
    where l.dog_id = b.dog_id
      and l.metric = 'stool_score'
      and l.raw_value ~ '^[1-7]$'
      and abs(extract(epoch from (l.created_at - b.established_at))) <= 5
    order by abs(extract(epoch from (l.created_at - b.established_at)))
    limit 1
  ) legacy_stool on true;

  if candidate_count <> 3 then
    raise exception
      'Expected exactly 3 proven legacy stool baseline rows, found %',
      candidate_count;
  end if;
end
$$;

insert into public.dog_stool_baselines (
  dog_id,
  dog_baseline_id,
  established_at,
  typical_scores,
  typical_count_min,
  typical_count_max
)
select
  b.dog_id,
  b.id,
  b.established_at,
  array[legacy_stool.raw_value::smallint],
  null::smallint,
  null::smallint
from public.dog_baselines b
join lateral (
  select
    l.id,
    l.raw_value
  from public.dog_log_entries l
  where l.dog_id = b.dog_id
    and l.metric = 'stool_score'
    and l.raw_value ~ '^[1-7]$'
    and abs(extract(epoch from (l.created_at - b.established_at))) <= 5
  order by abs(extract(epoch from (l.created_at - b.established_at)))
  limit 1
) legacy_stool on true
on conflict (dog_baseline_id) do nothing;
