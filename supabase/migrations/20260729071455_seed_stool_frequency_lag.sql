-- Separate migration: PostgreSQL requires a newly-added enum value to be
-- committed before another transaction uses it.
insert into public.metric_minimum_lag_days (outcome_metric, minimum_lag_days)
values ('stool_frequency', 10)
on conflict (outcome_metric) do update
set minimum_lag_days = excluded.minimum_lag_days;
