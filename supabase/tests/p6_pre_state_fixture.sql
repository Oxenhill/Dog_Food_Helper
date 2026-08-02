-- Minimal pre-P0 state needed to validate
-- 20260801204309_research_mission_lifecycle.sql (P0) and
-- 20260803090000_research_recurring_mission_actor.sql (P6) in a disposable
-- container, following the same pattern as p3_minimal_research_fixture.sql
-- and p5_pre_state_fixture.sql: this repo's base schema (foods/dogs/profiles,
-- predating 2026-07-24) was never captured as a migration file, so a full
-- from-scratch replay of supabase/migrations/*.sql is not possible. This
-- fixture reconstructs only what P0 actually depends on: research_ingestion_jobs
-- exactly as created by 20260729133601_research_brain_workflow.sql (verified:
-- no migration between that file and P0 alters research_ingestion_jobs), plus
-- auth.users rows to exercise owner-actor identity checks.

create table public.research_ingestion_jobs (
  id uuid primary key default gen_random_uuid(),
  job_type text not null
    check (job_type in ('discovery', 'url_import', 'pdf_import', 'embed', 'draft_claims', 'cluster_claims')),
  status text not null default 'queued'
    check (status in ('queued', 'running', 'awaiting_selection', 'succeeded', 'failed')),
  requested_by uuid not null references auth.users(id) on delete restrict,
  input jsonb not null default '{}'::jsonb,
  result_summary jsonb not null default '{}'::jsonb,
  error_message text,
  gateway_model text,
  gateway_input_tokens bigint,
  gateway_output_tokens bigint,
  gateway_cost_usd numeric(12, 6),
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint research_ingestion_jobs_error_check
    check (status <> 'failed' or length(btrim(coalesce(error_message, ''))) > 0),
  constraint research_ingestion_jobs_cost_check
    check (gateway_cost_usd is null or gateway_cost_usd >= 0)
);

create index research_ingestion_jobs_status_idx
  on public.research_ingestion_jobs (status, created_at desc);
create index research_ingestion_jobs_requester_idx
  on public.research_ingestion_jobs (requested_by, created_at desc);

alter table public.research_ingestion_jobs enable row level security;
revoke all on table public.research_ingestion_jobs from anon, authenticated;
create policy "service role manages research ingestion jobs"
  on public.research_ingestion_jobs for all to service_role
  using (true) with check (true);

insert into auth.users (id) values
  ('11111111-1111-1111-1111-111111111111'),
  ('22222222-2222-2222-2222-222222222222');
