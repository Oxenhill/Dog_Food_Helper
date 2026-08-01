import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import test from 'node:test';
import { assembleResearchConfigurationReadModel } from '../researchConfigurationReadModel';
import { evaluateResearchEvidenceAdmissibility } from '../researchEvidenceAdmissibility';
import { RESEARCH_BRAIN_DRAFT_PROMPT_SHA256 } from '../researchBrainDrafting';
import {
  LOCAL_LITERATURE_REGISTRY_V1,
  ResearchLiteratureSourceError,
  evaluateLiteratureSourcePolicy,
  literatureEndpoint,
  resolveLiteratureSourceRoute,
} from '../researchLiteratureSources';

const migrationPath = join(
  process.cwd(),
  'supabase/migrations/20260801213827_research_model_routing_and_literature_registry.sql'
);

test('P1 migration creates private immutable control-plane versions', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  for (const table of [
    'research_model_configuration_sets',
    'research_model_stage_configuration_versions',
    'research_model_stage_routes',
    'research_discovery_question_policy_versions',
    'research_evidence_admissibility_policy_versions',
    'research_literature_registry_versions',
    'research_literature_sources',
    'research_literature_source_versions',
    'research_literature_source_policy_versions',
    'research_literature_source_routes',
  ]) {
    assert.match(migration, new RegExp(`create table public\\.${table}`));
    assert.match(migration, new RegExp(`alter table public\\.${table} enable row level security`));
    assert.match(
      migration,
      new RegExp(`revoke all on table public\\.${table} from anon, authenticated`)
    );
  }
  assert.match(migration, /Research control-plane configuration and policy versions are immutable/);
  assert.match(migration, new RegExp(RESEARCH_BRAIN_DRAFT_PROMPT_SHA256));
  assert.doesNotMatch(migration, /security definer/i);
  assert.match(migration, /grant select on table public\.research_literature_sources to service_role/);
  assert.doesNotMatch(
    migration,
    /grant (?:insert|update|delete|all).*research_literature_sources to service_role/i
  );
});

test('missions and attempts pin exact configuration and policy snapshots', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  assert.match(migration, /model_configuration_set_version_id uuid/);
  assert.match(migration, /model_stage_configuration_version_id uuid/);
  assert.match(migration, /discovery_question_policy_version_id uuid/);
  assert.match(migration, /literature_registry_version_id uuid/);
  assert.match(migration, /evidence_admissibility_policy_version_id uuid/);
  assert.match(migration, /Research stage control-plane versions must match the parent mission snapshot/);
  assert.match(migration, /Research mission identity, input, and control-plane versions are immutable/);
  assert.match(migration, /Research mission stage identity, input, and control-plane versions are immutable/);
});

test('literature registry is independent of catalogue crawl permission tables', () => {
  const migration = readFileSync(migrationPath, 'utf8');
  const foreignKeyLines = migration
    .split(/\r?\n/)
    .filter((line) => /references public\./.test(line))
    .join('\n');
  assert.doesNotMatch(
    foreignKeyLines,
    /source_domain_allowlist|crawl_targets|manufacturer_target_domains|manufacturer_entities|terms_clause_patterns/
  );
  assert.match(migration, /PubMed \/ NCBI Entrez E-utilities/);
  assert.match(migration, /Europe PMC RESTful Web Service/);
});

test('PubMed and Europe PMC operations resolve deterministically', () => {
  const pubmed = resolveLiteratureSourceRoute(
    LOCAL_LITERATURE_REGISTRY_V1,
    'discovery_search'
  );
  assert.equal(pubmed.source.source_key, 'pubmed');
  assert.equal(
    literatureEndpoint(pubmed),
    'https://eutils.ncbi.nlm.nih.gov/entrez/eutils/esearch.fcgi'
  );

  const europePmc = resolveLiteratureSourceRoute(
    LOCAL_LITERATURE_REGISTRY_V1,
    'open_access_full_text',
    { openAccess: true, inPmc: true }
  );
  assert.equal(europePmc.source.source_key, 'europe_pmc');
  assert.equal(
    literatureEndpoint(europePmc, { pmcid: 'PMC123' }),
    'https://www.ebi.ac.uk/europepmc/webservices/rest/PMC123/fullTextXML'
  );
});

test('disallowed acquisition fails closed with a deterministic reason', () => {
  const route = resolveLiteratureSourceRoute(
    LOCAL_LITERATURE_REGISTRY_V1,
    'discovery_search'
  );
  const decision = evaluateLiteratureSourcePolicy(
    'discovery_search',
    { ...route.policy, human_approval_status: 'pending' }
  );
  assert.deepEqual(decision, {
    allowed: false,
    code: 'source_not_approved',
    reason: 'human approval is absent',
  });

  assert.throws(
    () => resolveLiteratureSourceRoute(
      {
        ...LOCAL_LITERATURE_REGISTRY_V1,
        routes: [{
          ...route,
          policy: { ...route.policy, terms_status: 'reviewed_disallowed' },
        }],
      },
      'discovery_search'
    ),
    (error) => error instanceof ResearchLiteratureSourceError
      && error.code === 'terms_disallowed'
  );
});

test('discovery and evidence admissibility remain separate decisions', () => {
  assert.deepEqual(
    evaluateResearchEvidenceAdmissibility({
      evidenceScope: 'veterinary_methodology',
      species: null,
      meshHeadings: [],
      retracted: false,
    }),
    {
      admissible: true,
      recommendationEvidenceEligible: false,
      reason: 'methodology_context_only',
    }
  );
  assert.deepEqual(
    evaluateResearchEvidenceAdmissibility({
      evidenceScope: 'canine_direct',
      species: 'cat',
      meshHeadings: [],
      retracted: false,
    }),
    {
      admissible: false,
      recommendationEvidenceEligible: false,
      code: 'evidence_not_canine_direct',
    }
  );
});

test('admin configuration read model nests routes and policy decisions', () => {
  const result = assembleResearchConfigurationReadModel({
    modelSets: [{ id: 'set-1', version: 1 }],
    stageConfigurations: [{ id: 'stage-config-1', configuration_set_id: 'set-1' }],
    modelRoutes: [{ id: 'model-route-1', stage_configuration_version_id: 'stage-config-1' }],
    discoveryQuestionPolicies: [{ id: 'questions-1' }],
    evidenceAdmissibilityPolicies: [{ id: 'evidence-1' }],
    registries: [{ id: 'registry-1' }],
    sources: [{ id: 'source-1', source_key: 'pubmed' }],
    sourceVersions: [{ id: 'source-version-1', registry_version_id: 'registry-1', source_id: 'source-1' }],
    sourcePolicies: [{ id: 'policy-1', source_version_id: 'source-version-1' }],
    sourceRoutes: [{ id: 'source-route-1', registry_version_id: 'registry-1' }],
  });
  assert.equal(result.model_configuration_sets[0].stages[0].routes.length, 1);
  assert.equal(
    result.literature_registry_versions[0].sources[0].source_identity?.source_key,
    'pubmed'
  );
  assert.equal(result.literature_registry_versions[0].sources[0].policy_versions.length, 1);
  assert.equal(result.literature_registry_versions[0].routes.length, 1);
});

test('configuration endpoint is admin-only, read-only, and non-cacheable', () => {
  const route = readFileSync(
    join(process.cwd(), 'src/app/api/admin/research/configurations/route.ts'),
    'utf8'
  );
  assert.match(route, /await requireAdmin\(request\)/);
  assert.match(route, /status: 404/);
  assert.match(route, /Cache-Control': 'private, no-store'/);
  assert.doesNotMatch(route, /export async function (?:POST|PUT|PATCH|DELETE)/);
});
