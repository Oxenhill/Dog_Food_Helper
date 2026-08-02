import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import {
  aggregateResearchProviderCalls,
  assembleResearchMissionReadModels,
} from '../researchMissionReadModel';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260801223514_research_provider_usage_and_budget_caps.sql'
);

function source(path: string): string {
  return readFileSync(join(process.cwd(), path), 'utf8');
}

test('P2 migration persists private call telemetry with exact version links', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  for (const table of [
    'research_usage_estimate_rate_versions',
    'research_budget_policy_versions',
    'research_budget_stage_cap_versions',
    'research_provider_calls',
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated, service_role`)
    );
  }

  assert.match(migration, /mission_id uuid not null references public\.research_missions/);
  assert.match(migration, /mission_stage_id uuid not null\s+references public\.research_mission_stages/);
  assert.match(migration, /research_ingestion_job_id uuid\s+references public\.research_ingestion_jobs/);
  assert.match(migration, /model_stage_configuration_version_id uuid not null/);
  assert.match(migration, /model_route_id uuid not null/);
  assert.match(migration, /estimate_rate_version_id uuid not null/);
  assert.match(migration, /unique \(mission_stage_id, call_key\)/);
  assert.match(migration, /research_provider_calls_configuration_idx/);
  assert.match(migration, /create trigger research_provider_calls_links_valid/);
  assert.match(migration, /Provider call job does not belong to its mission stage/);
  assert.match(migration, /Provider call estimate rate does not match its configured route/);
  assert.match(migration, /Research provider-call identity, route, and estimate snapshot are immutable/);
  assert.match(migration, /Completed research provider-call records are immutable/);
  assert.match(migration, /Research provider-call history is append-preserving and cannot be deleted/);
  assert.doesNotMatch(migration, /references public\.(?:dogs|dog_reports|dog_documents|foods)/i);
});

test('P2 migration separates reported actuals from estimates and enforces caps first', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /actual_usage_source text not null default 'not_reported'/);
  assert.match(migration, /actual_cost_source text/);
  assert.match(migration, /estimated_input_tokens bigint not null/);
  assert.match(migration, /estimated_cost_usd numeric\(12, 6\) not null/);
  assert.match(migration, /provider_call_estimate_required/);
  assert.match(migration, /mission_provider_call_cap_reached/);
  assert.match(migration, /stage_provider_call_cap_reached/);
  assert.match(migration, /provider_call_estimated_input_cap_exceeded/);
  assert.match(migration, /provider_call_estimated_output_cap_exceeded/);
  assert.match(migration, /from public\.research_missions\s+where id = linked_job\.mission_id\s+for update/);
  assert.match(migration, /from public\.research_mission_stages\s+where id = linked_job\.mission_stage_id\s+for update/);
  assert.ok(
    migration.indexOf("halt_reason := 'provider_call_estimated_input_cap_exceeded'")
      < migration.indexOf('insert into public.research_provider_calls')
  );
  assert.match(migration, /'budget\.halted'/);
  assert.match(migration, /fully_reported_usage/);
  assert.match(migration, /fully_reported_cost/);
  assert.doesNotMatch(migration, /gateway_input_tokens\s*=\s*coalesce/i);
});

test('usage read model never substitutes estimates for provider-reported actuals', () => {
  const usage = aggregateResearchProviderCalls([
    {
      id: 'call-1',
      status: 'succeeded',
      actual_usage_source: 'provider_reported',
      actual_input_tokens: 80,
      actual_output_tokens: 20,
      actual_total_tokens: 100,
      actual_cost_usd: null,
      estimated_input_tokens: 120,
      estimated_output_tokens: 30,
      estimated_total_tokens: 150,
      estimated_cost_usd: 0.002,
      client_duration_ms: 250,
    },
    {
      id: 'call-2',
      status: 'failed',
      actual_usage_source: 'not_reported',
      actual_input_tokens: null,
      actual_output_tokens: null,
      actual_total_tokens: null,
      actual_cost_usd: null,
      estimated_input_tokens: 40,
      estimated_output_tokens: 10,
      estimated_total_tokens: 50,
      estimated_cost_usd: 0.001,
      client_duration_ms: 75,
    },
  ]);

  assert.deepEqual(usage.actual_provider_reported, {
    calls_with_usage: 1,
    completed_calls_without_usage: 1,
    input_tokens: 80,
    output_tokens: 20,
    total_tokens: 100,
    reasoning_tokens: 0,
    cache_read_tokens: 0,
    cache_write_tokens: 0,
    cost_usd: 0,
    calls_with_cost: 0,
  });
  assert.deepEqual(usage.estimates_not_actual, {
    input_tokens: 160,
    output_tokens: 40,
    total_tokens: 200,
    cost_usd: 0.003,
  });
  assert.equal(usage.measured_timing.client_duration_ms, 325);
});

test('retry attempts retain separate provider-call history without double counting rows', () => {
  const result = assembleResearchMissionReadModels(
    [{ id: 'mission-1', budget_policy_version_id: 'budget-1' }],
    [
      { id: 'stage-1', mission_id: 'mission-1', stage_key: 'drafting', attempt_number: 1 },
      { id: 'stage-2', mission_id: 'mission-1', stage_key: 'drafting', attempt_number: 2 },
    ],
    [],
    {
      providerCalls: [
        {
          id: 'call-1', mission_id: 'mission-1', mission_stage_id: 'stage-1',
          status: 'failed', actual_usage_source: 'not_reported',
          estimated_input_tokens: 10, estimated_output_tokens: 10,
          estimated_total_tokens: 20, estimated_cost_usd: 0.001,
        },
        {
          id: 'call-2', mission_id: 'mission-1', mission_stage_id: 'stage-2',
          status: 'succeeded', actual_usage_source: 'provider_reported',
          actual_total_tokens: 12, estimated_input_tokens: 10,
          estimated_output_tokens: 10, estimated_total_tokens: 20,
          estimated_cost_usd: 0.001,
        },
      ],
    }
  )[0];

  assert.equal(result.stages.length, 2);
  assert.deepEqual(result.stages.map((attempt) => attempt.provider_calls.length), [1, 1]);
  assert.equal(result.usage.calls.total, 2);
  assert.equal(result.usage.calls.succeeded, 1);
  assert.equal(result.usage.calls.failed, 1);
  assert.equal(result.usage.actual_provider_reported.total_tokens, 12);
});

test('provider wrappers reserve before external calls and do not invent actual usage', () => {
  const telemetry = source('src/lib/researchProviderTelemetry.ts');
  const pipeline = source('src/lib/researchBrainPipeline.ts');
  const drafting = source('src/lib/researchBrainDrafting.ts');

  assert.ok(
    telemetry.indexOf("supabaseAdmin.rpc('begin_research_provider_call'")
      < telemetry.indexOf('result = await input.execute()')
  );
  assert.match(telemetry, /p_actual_usage_source: usage \? 'provider_reported' : 'not_reported'/);
  assert.match(telemetry, /ResearchProviderCallHaltError/);
  assert.doesNotMatch(telemetry, /actual.*estimate|estimate.*as actual/i);
  assert.match(pipeline, /callKey: `\$\{telemetry\.callKeyPrefix\}\.batch_\$\{batchNumber\}`/);
  assert.match(pipeline, /embedMany\(\{ model: modelIdentifier, values, maxRetries: 0 \}\)/);
  assert.match(drafting, /callKey: 'draft_generation'/);
  assert.match(drafting, /callKeyPrefix: 'claim_embedding'/);
});

test('persisted polling resumes by sequence and the admin labels all usage classes', () => {
  const route = source('src/app/api/admin/research/missions/route.ts');
  const ui = source('src/components/ResearchMissionAdmin.tsx');

  assert.match(route, /DETAIL_EVENT_PAGE_SIZE \+ 1/);
  assert.match(route, /\.gt\('sequence_number', afterSequence\)/);
  assert.match(route, /last_sequence: lastSequence/);
  assert.match(route, /has_more: hasMore/);
  assert.match(route, /research_provider_calls/);
  assert.doesNotMatch(route, /EventSource|text\/event-stream|ReadableStream/);

  assert.match(ui, /Actual .* provider reported/);
  assert.match(ui, /Estimate .* not actual/);
  assert.match(ui, /Measured call timing/);
  assert.match(ui, /Pinned stage cap/);
  assert.match(ui, /Deterministic halt/);
  assert.match(ui, /Persisted ordered events/);
  assert.match(ui, /Private dog reports never enter/);
});
