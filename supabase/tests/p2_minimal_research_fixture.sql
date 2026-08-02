-- Minimal production-shape prerequisite for isolated P0 -> P1 -> P2 testing.
-- This is a disposable validation fixture, not a production migration.

create extension if not exists pgcrypto;

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end;
$$;

create schema if not exists auth;

create table if not exists auth.users (
  id uuid primary key
);
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
