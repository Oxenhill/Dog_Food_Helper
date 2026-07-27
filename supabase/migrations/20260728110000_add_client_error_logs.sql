-- Diagnostic sink for client-side failures the browser console can't be
-- relied on to surface to us (Android, no attached debugger). Written only
-- by the server route (service-role key, bypasses RLS) via
-- src/app/api/client-log/route.ts. Deliberately no anon/authenticated
-- policies: nobody reads or writes this table except that one route and a
-- staff member querying it directly.
create table if not exists public.client_error_logs (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  event text not null,
  status int,
  bytes int,
  message text,
  context jsonb,
  user_agent text
);

alter table public.client_error_logs enable row level security;

create index if not exists client_error_logs_created_at_idx
  on public.client_error_logs (created_at desc);
