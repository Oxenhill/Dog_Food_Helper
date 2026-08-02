import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { deriveScheduledMissionIdempotencyKey } from '../researchRecurringMissions';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260803090000_research_recurring_mission_actor.sql'
);

test('scheduled mission idempotency key is stable within a UTC calendar month', () => {
  const early = deriveScheduledMissionIdempotencyKey(
    'discovery',
    'monthly',
    new Date('2026-08-01T00:05:00Z')
  );
  const late = deriveScheduledMissionIdempotencyKey(
    'discovery',
    'monthly',
    new Date('2026-08-31T23:55:00Z')
  );
  assert.equal(early, late);
  assert.equal(early, 'scheduled:discovery:monthly:2026-08');
});

test('scheduled mission idempotency key changes across calendar months', () => {
  const august = deriveScheduledMissionIdempotencyKey(
    'discovery',
    'monthly',
    new Date('2026-08-15T00:00:00Z')
  );
  const september = deriveScheduledMissionIdempotencyKey(
    'discovery',
    'monthly',
    new Date('2026-09-01T00:00:00Z')
  );
  assert.notEqual(august, september);
});

test('scheduled mission idempotency key is scoped to mission type', () => {
  const discovery = deriveScheduledMissionIdempotencyKey(
    'discovery',
    'monthly',
    new Date('2026-08-15T00:00:00Z')
  );
  const retraction = deriveScheduledMissionIdempotencyKey(
    'retraction_watch',
    'monthly',
    new Date('2026-08-15T00:00:00Z')
  );
  assert.notEqual(discovery, retraction);
});

test('P6 migration relaxes requested_by to nullable with an explicit actor-type distinction', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(
    migration,
    /alter table public\.research_missions\s+alter column requested_by drop not null/
  );
  assert.match(
    migration,
    /alter table public\.research_ingestion_jobs\s+alter column requested_by drop not null/
  );
  assert.match(
    migration,
    /add column requested_by_actor_type text not null default 'owner'/
  );
  assert.match(migration, /check \(requested_by_actor_type in \('owner', 'system'\)\)/);
  assert.match(
    migration,
    /check \(requested_by_actor_type <> 'owner' or requested_by is not null\)/
  );
});

test('P6 migration drops the old start_research_mission_job overload before recreating it', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(
    migration,
    /drop function if exists public\.start_research_mission_job\(\s*text, text, text, text, uuid, jsonb, text, text, text\s*\);/
  );
  assert.match(
    migration,
    /create function public\.start_research_mission_job\([\s\S]*?p_requested_by_actor_type text default 'owner'/
  );
});

test('P6 migration makes identity comparisons null-safe now that requested_by can be null', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.doesNotMatch(migration, /existing_job\.requested_by <> p_requested_by/);
  assert.doesNotMatch(migration, /linked_mission\.requested_by <> p_requested_by/);
  assert.match(migration, /existing_job\.requested_by is distinct from p_requested_by/);
  assert.match(migration, /linked_mission\.requested_by is distinct from p_requested_by/);
});

test('P6 migration lets any admin retry a system-requested mission but keeps owner-requested retry ownership', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(migration, /linked_mission\.requested_by_actor_type = 'owner'/);
  assert.match(
    migration,
    /and linked_mission\.requested_by is distinct from p_requested_by\s*\)\s*then/
  );
});

test('P6 migration grants the new start_research_mission_job overload to service_role only', () => {
  const migration = readFileSync(migrationPath, 'utf8');

  assert.match(
    migration,
    /revoke execute on function public\.start_research_mission_job\(\s*text, text, text, text, uuid, jsonb, text, text, text, text\s*\)\s*from public, anon, authenticated/
  );
  assert.match(
    migration,
    /grant execute on function public\.start_research_mission_job\(\s*text, text, text, text, uuid, jsonb, text, text, text, text\s*\)\s*to service_role/
  );
});

test('scheduled discovery cron route is cron-authorized and alerts on unattended failure', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/cron/research-discovery/route.ts'),
    'utf8'
  );
  assert.match(route, /await isCronAuthorized\(request\)/);
  assert.match(route, /maxDuration = 300/);
  assert.match(route, /deriveScheduledMissionIdempotencyKey\('discovery', 'monthly'\)/);
  assert.match(route, /requestedByActorType: 'system'/);
  assert.match(route, /requestedBy: null/);
  assert.match(route, /all_topics_blocked/);
  assert.match(route, /system_alerts/);
  assert.match(route, /export const POST = handle/);
  assert.match(route, /export const GET = handle/);
});

test('scheduled discovery and manual admin discovery share one acquisition code path', () => {
  const cronRoute = readFileSync(
    join(process.cwd(), 'src/app/api/cron/research-discovery/route.ts'),
    'utf8'
  );
  const adminRoute = readFileSync(
    join(process.cwd(), 'src/app/api/admin/research/discovery/route.ts'),
    'utf8'
  );
  assert.match(cronRoute, /from '@\/lib\/researchDiscoveryMission'/);
  assert.match(adminRoute, /from '@\/lib\/researchDiscoveryMission'/);
  assert.match(adminRoute, /requestedByActorType: 'owner'/);
  // Neither route reimplements discovery candidate acquisition directly.
  assert.doesNotMatch(cronRoute, /discoverResearchCandidates/);
  assert.doesNotMatch(adminRoute, /discoverResearchCandidates/);
});

test('vercel.json schedules research-discovery monthly', () => {
  const config = JSON.parse(
    readFileSync(join(process.cwd(), 'vercel.json'), 'utf8')
  ) as { crons: { path: string; schedule: string }[] };
  const entry = config.crons.find((cron) => cron.path === '/api/cron/research-discovery');
  assert.ok(entry, 'expected a research-discovery cron entry');
  assert.equal(entry?.schedule, '0 7 1 * *');
});
