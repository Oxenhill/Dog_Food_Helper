-- Two daily pg_cron assertions existed
-- (assert_complete_foods_have_ingredients, assert_catalogue_export_boundary)
-- and nothing read cron.job_run_details -- an alarm nobody looks at isn't an
-- alarm. Rather than build email/SMTP for this, surface failures where an
-- admin already looks: a system_alerts table, one wrapper function that runs
-- both assertions and records a row on failure instead of letting the
-- exception propagate, and a single cron job instead of two. The admin UI
-- banner (application code, not this migration) reads unresolved rows.

create table if not exists public.system_alerts (
  id uuid primary key default gen_random_uuid(),
  check_name text not null,
  message text not null,
  detected_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolved_by uuid references auth.users(id)
);

alter table public.system_alerts enable row level security;
-- No policies: matching contributed_foods / ingredient_review_queue, this
-- table is written only by the cron wrapper (running as the job owner, which
-- bypasses RLS as the table owner) and read/updated only through the admin
-- API's service-role client (src/app/api/admin/alerts), which also bypasses
-- RLS. Fail-closed for every other role, same as the rest of this schema.

create index if not exists system_alerts_unresolved_idx
  on public.system_alerts (check_name)
  where resolved_at is null;

-- Runs both assertions, catching each independently so one failing does not
-- stop the other from running. On failure, records one row per check -- but
-- only if that check doesn't already have an unresolved row, so a check that
-- stays broken for a week doesn't produce seven near-identical alerts.
create or replace function public.run_scheduled_assertions()
returns void
language plpgsql
set search_path to ''
as $function$
begin
  begin
    perform public.assert_complete_foods_have_ingredients();
  exception when others then
    if not exists (
      select 1 from public.system_alerts
      where check_name = 'assert_complete_foods_have_ingredients'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values ('assert_complete_foods_have_ingredients', sqlerrm);
    end if;
  end;

  begin
    perform public.assert_catalogue_export_boundary();
  exception when others then
    if not exists (
      select 1 from public.system_alerts
      where check_name = 'assert_catalogue_export_boundary'
        and resolved_at is null
    ) then
      insert into public.system_alerts (check_name, message)
      values ('assert_catalogue_export_boundary', sqlerrm);
    end if;
  end;
end;
$function$;

select cron.unschedule('assert-complete-foods-have-ingredients');
select cron.unschedule('assert-catalogue-export-boundary');

select cron.schedule(
  'run-scheduled-assertions',
  '0 6 * * *',
  'select public.run_scheduled_assertions();'
);
