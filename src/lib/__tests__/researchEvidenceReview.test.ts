import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { NUTRIENT_MATCH_RULES } from '../activeClaimRetrieval';
import {
  RESEARCH_NUTRIENT_SUBJECTS,
  researchClusterIdentity,
  researchClusterLabel,
  validateCautiousResearchSummary,
  validateResearchClusterEdit,
  validateResearchContext,
  validateResearchSubject,
  type ResearchClusterEdit,
} from '../researchEvidenceReview';

function edit(overrides: Partial<ResearchClusterEdit> = {}): ResearchClusterEdit {
  return {
    subject_type: 'ingredient',
    subject_value: 'green lentil',
    outcome_type: 'biome_marker',
    outcome_value: 'Dysbiosis Pattern Score',
    direction: 'supports',
    cautious_summary:
      'The study found green lentil was associated with the measured marker.',
    applicability: [
      {
        context_type: 'document_finding',
        context_key: 'Dysbiosis Pattern Score',
        context_value: 'high',
        match_operator: 'exact',
      },
    ],
    ...overrides,
  };
}

test('owner edit identity uses the drafting proposition fields and normalized values', () => {
  const first = edit();
  const same = edit({
    subject_value: 'GREEN_lentil',
    outcome_value: 'dysbiosis-pattern score',
  });
  assert.equal(researchClusterIdentity(first), researchClusterIdentity(same));
  assert.notEqual(
    researchClusterIdentity(first),
    researchClusterIdentity(edit({ direction: 'neutral' }))
  );
  assert.equal(
    researchClusterLabel(first),
    'green lentil — Dysbiosis Pattern Score'
  );
});

test('owner subject validation uses the runtime nutrient allowlist', () => {
  assert.deepEqual(
    [...RESEARCH_NUTRIENT_SUBJECTS].sort(),
    Object.keys(NUTRIENT_MATCH_RULES).sort()
  );
  assert.deepEqual(validateResearchSubject('nutrient', 'taurine'), []);
  assert.ok(validateResearchSubject('nutrient', 'vitamin b12').length > 0);
  assert.ok(validateResearchSubject('biome_marker', 'Firmicutes').length > 0);
  assert.ok(validateResearchSubject('ingredient', 'beef and chicken').length > 0);
  assert.deepEqual(validateResearchSubject('ingredient_class', 'protein_animal'), []);
});

test('owner context validation uses exact report-field and life-stage allowlists', () => {
  assert.deepEqual(
    validateResearchContext({
      context_type: 'document_finding',
      context_key: 'Dysbiosis Pattern Score',
      context_value: 'high',
      match_operator: 'exact',
    }),
    []
  );
  assert.ok(
    validateResearchContext({
      context_type: 'document_finding',
      context_key: 'Bacteriodetes',
      context_value: null,
      match_operator: 'exact',
    }).length > 0
  );
  assert.deepEqual(
    validateResearchContext({
      context_type: 'life_stage',
      context_key: 'adult',
      context_value: null,
      match_operator: 'enum',
    }),
    []
  );
  assert.ok(
    validateResearchContext({
      context_type: 'life_stage',
      context_key: 'all ages',
      context_value: null,
      match_operator: 'enum',
    }).length > 0
  );
});

test('owner summary validation rejects advice, certainty, and multi-sentence text', () => {
  assert.deepEqual(
    validateCautiousResearchSummary(
      'The study found this diet was associated with the measured outcome.'
    ),
    []
  );
  assert.ok(
    validateCautiousResearchSummary('You should always feed this diet.').length > 0
  );
  assert.ok(
    validateCautiousResearchSummary(
      'The study found an association. The result proves the food is safe.'
    ).length > 0
  );
});

test('cluster edit validation rejects duplicate applicability and allows no-context drafts', () => {
  assert.deepEqual(validateResearchClusterEdit(edit()), []);
  assert.deepEqual(validateResearchClusterEdit(edit({ applicability: [] })), []);
  assert.ok(
    validateResearchClusterEdit(
      edit({
        applicability: [
          ...edit().applicability,
          ...edit().applicability,
        ],
      })
    ).some((reason) => reason.includes('unique'))
  );
});

test('cluster edit transaction is queued-only, concurrency-safe and service-role-only', () => {
  const migration = readFileSync(
    new URL(
      '../../../supabase/migrations/20260730120629_edit_research_evidence_cluster.sql',
      import.meta.url
    ),
    'utf8'
  );
  for (const required of [
    "v_cluster.status not in ('draft', 'queued_for_review')",
    'v_cluster.reviewed_by is not null',
    'v_cluster.updated_at is distinct from p_expected_updated_at',
    'other.cluster_identity = p_cluster_identity',
    'delete from public.research_cluster_applicability',
    'insert into public.research_cluster_applicability',
    'last_edited_by = p_editor_id',
    'from public, anon, authenticated',
    'to service_role',
  ]) {
    assert.equal(migration.includes(required), true, required);
  }
});

test('last-editor foreign key has a covering index migration', () => {
  const migration = readFileSync(
    new URL(
      '../../../supabase/migrations/20260801182025_index_research_cluster_last_editor.sql',
      import.meta.url
    ),
    'utf8'
  );
  assert.equal(
    migration.includes('research_evidence_clusters_last_edited_by_idx'),
    true
  );
  assert.equal(migration.includes('(last_edited_by)'), true);
});
