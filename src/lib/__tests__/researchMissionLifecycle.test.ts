import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { assembleResearchMissionReadModels } from '../researchMissionReadModel';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260801204309_research_mission_lifecycle.sql'
);

test('mission lifecycle migration is additive, private, and append-only', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  for (const table of [
    'research_missions',
    'research_mission_stages',
    'research_mission_events',
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated`)
    );
  }

  assert.match(migration, /add column mission_id uuid references public\.research_missions/);
  assert.match(
    migration,
    /add column mission_stage_id uuid references public\.research_mission_stages/
  );
  assert.match(migration, /Research mission events are append-only/);
  assert.match(migration, /security invoker/g);
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /grant select, insert on table public\.research_mission_events/);
  assert.match(
    migration,
    /grant select, insert, update on table public\.research_missions to service_role/
  );
  assert.match(migration, /Research mission identity and input are immutable/);
  assert.match(migration, /Research mission stage identity and input are immutable/);
  assert.doesNotMatch(
    migration,
    /grant (?:all|update|delete).*research_mission_events to service_role/i
  );
});

test('current research operations use the shared mission lifecycle', () => {
  for (const path of [
    'src/app/api/admin/research/discovery/route.ts',
    'src/app/api/admin/research/ingestion/route.ts',
    'src/app/api/admin/research/processing/route.ts',
    'scripts/researchBrainPopulate.ts',
  ]) {
    const source = readFileSync(join(process.cwd(), path), 'utf8');
    assert.match(source, /startResearchMissionJob/);
    assert.match(source, /finishResearchMissionJob/);
    assert.doesNotMatch(
      source,
      /\.from\(['"]research_ingestion_jobs['"]\)\s*\n?\s*\.insert\(/
    );
  }
});

test('mission lifecycle migration retains attempt history and prevents cross-mission links', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /unique \(mission_id, stage_key, attempt_number\)/);
  assert.match(migration, /retry_of_stage_id uuid references public\.research_mission_stages/);
  assert.match(migration, /Retry stage must reference an earlier attempt/);
  assert.match(migration, /Research ingestion job stage does not belong to its mission/);
  assert.match(migration, /research_mission_stages_idempotency_idx/);
  assert.match(migration, /pg_advisory_xact_lock/);
  assert.match(migration, /create or replace function public\.retry_research_mission_job_stage/);
  assert.match(migration, /'stage\.retry_queued'/);
  assert.match(migration, /'mission\.retry_queued'/);
  assert.doesNotMatch(migration, /alter table public\.research_ingestion_jobs\s+alter column/i);
});

test('mission lifecycle RPCs are service-role-only and use deterministic failure reasons', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  for (const fn of [
    'start_research_mission_job',
    'mark_research_mission_job_running',
    'retry_research_mission_job_stage',
    'finish_research_mission_job',
    'append_research_mission_job_event',
  ]) {
    assert.match(migration, new RegExp(`revoke execute on function public\\.${fn}`));
    assert.match(migration, new RegExp(`grant execute on function public\\.${fn}`));
  }
  assert.match(migration, /A deterministic reason code is required/);
  assert.match(migration, /mission\.failed/);
  assert.match(migration, /stage\.failed/);
});

test('admin mission read model groups and orders persisted stages and events', () => {
  const missions = [{ id: 'mission-a', created_at: '2026-08-01T10:00:00Z' }];
  const stages = [
    {
      id: 'stage-2',
      mission_id: 'mission-a',
      attempt_number: 2,
      created_at: '2026-08-01T10:02:00Z',
    },
    {
      id: 'stage-1',
      mission_id: 'mission-a',
      attempt_number: 1,
      created_at: '2026-08-01T10:01:00Z',
    },
  ];
  const events = [
    { id: 12, mission_id: 'mission-a', sequence_number: 2 },
    { id: 11, mission_id: 'mission-a', sequence_number: 1 },
  ];

  const result = assembleResearchMissionReadModels(missions, stages, events);
  assert.equal(result.length, 1);
  assert.deepEqual(result[0].stages.map((attempt) => attempt.stage.id), ['stage-1', 'stage-2']);
  assert.deepEqual(result[0].events.map((event) => event.id), [11, 12]);
});

test('mission polling endpoint is admin-only and non-cacheable', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/admin/research/missions/route.ts'),
    'utf8'
  );
  assert.match(route, /await requireAdmin\(request\)/);
  assert.match(route, /status: 404/);
  assert.match(route, /Cache-Control': 'private, no-store'/);
  assert.match(route, /after_sequence requires mission_id/);
  assert.match(route, /\.gt\('sequence_number', afterSequence\)/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
});

test('recommendation retrieval does not depend on mission control-plane tables', () => {
  const retrieval = readFileSync(
    join(process.cwd(), 'src/lib/activeClaimRetrieval.ts'),
    'utf8'
  );
  assert.doesNotMatch(retrieval, /research_missions|research_mission_stages|research_mission_events/);
});
