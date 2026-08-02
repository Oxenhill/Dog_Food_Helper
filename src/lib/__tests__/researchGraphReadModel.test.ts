import assert from 'node:assert/strict';
import test from 'node:test';
import { assembleResearchGraph, ResearchGraphViewRows } from '../researchGraphReadModel';

const baseRows: ResearchGraphViewRows = {
  documents: [
    { document_id: 'doc-1', title: 'Study One', doi: '10.1/one' },
    { document_id: 'doc-2', title: 'Study One (preprint)', doi: '10.1/one-preprint' },
  ],
  claims: [
    {
      claim_id: 'claim-1',
      document_id: 'doc-1',
      subject_type: 'ingredient',
      subject_value: 'chicken',
      applies_to_condition: 'itchy_skin',
      applies_to_life_stage: null,
      direction: 'supports',
      effect_summary: 'reduced itching',
      evidence_grade: 'B',
      supporting_quote: 'Dogs fed chicken had less itching.',
      reviewed_by: 'reviewer-1',
      reviewed_at: '2026-08-01T00:00:00Z',
    },
  ],
  clusters: [
    {
      cluster_id: 'cluster-1',
      label: 'Chicken and itchy skin',
      subject_type: 'ingredient',
      subject_value: 'chicken',
      outcome_type: 'condition',
      outcome_value: 'itchy_skin',
      direction: 'supports',
      cautious_summary: 'Some evidence chicken helps.',
      reviewed_by: 'reviewer-2',
      reviewed_at: '2026-08-02T00:00:00Z',
    },
    {
      cluster_id: 'cluster-2',
      label: 'Beef and vomiting',
      subject_type: 'ingredient',
      subject_value: 'beef',
      outcome_type: 'condition',
      outcome_value: 'vomiting',
      direction: 'cautions_against',
      cautious_summary: 'Some evidence beef causes vomiting.',
      reviewed_by: 'reviewer-3',
      reviewed_at: '2026-08-03T00:00:00Z',
    },
  ],
  conceptNodes: [
    { concept_type: 'ingredient', concept_key: 'chicken' },
    { concept_type: 'ingredient', concept_key: 'beef' },
    { concept_type: 'condition', concept_key: 'itchy_skin' },
    { concept_type: 'condition', concept_key: 'vomiting' },
  ],
  edgesDerivedFrom: [
    { edge_type: 'DERIVED_FROM', claim_id: 'claim-1', document_id: 'doc-1' },
  ],
  edgesMemberOf: [
    {
      edge_type: 'MEMBER_OF',
      claim_id: 'claim-1',
      cluster_id: 'cluster-1',
      relationship: 'same_proposition',
      independently_reviewed: true,
    },
    // cluster-2 deliberately has NO member_of row -- its only supporting claim
    // was excluded (e.g. document later retracted) while the cluster row
    // itself remains active. This is the case quote_unresolved must catch.
  ],
  edgesDirection: [
    {
      edge_type: 'SUPPORTS',
      cluster_id: 'cluster-1',
      subject_type: 'ingredient',
      subject_value: 'chicken',
      outcome_type: 'condition',
      outcome_value: 'itchy_skin',
    },
    {
      edge_type: 'CAUTIONS_AGAINST',
      cluster_id: 'cluster-2',
      subject_type: 'ingredient',
      subject_value: 'beef',
      outcome_type: 'condition',
      outcome_value: 'vomiting',
    },
  ],
  edgesConcerns: [
    { edge_type: 'CONCERNS', claim_id: 'claim-1', condition_key: 'itchy_skin' },
  ],
  edgesAppliesTo: [
    {
      edge_type: 'APPLIES_TO',
      cluster_id: 'cluster-1',
      context_type: 'health_condition',
      context_key: 'itchy_skin',
      context_value: null,
      required: true,
    },
    {
      edge_type: 'APPLIES_TO',
      cluster_id: 'cluster-2',
      context_type: 'health_condition',
      context_key: 'sensitive_stomach',
      context_value: null,
      required: true,
    },
  ],
  edgesSameStudyFamily: [
    {
      edge_type: 'SAME_STUDY_FAMILY',
      duplicate_document_id: 'doc-2',
      primary_document_id: 'doc-1',
      match_basis: {
        method: 'author_and_title',
        title_similarity: 0.9143,
        matched_authors: ['smith j'],
        publication_year_delta: 1,
      },
      detected_at: '2026-08-02T00:00:00Z',
    },
  ],
  clusterMembersRaw: [
    { cluster_id: 'cluster-1', claim_id: 'claim-1', semantic_similarity: 0.92 },
  ],
};

test('DERIVED_FROM and CONCERNS edges resolve their quote and reviewer directly from the claim', () => {
  const graph = assembleResearchGraph(baseRows);
  const derived = graph.edges.find((edge) => edge.edge_type === 'DERIVED_FROM');
  assert.ok(derived);
  assert.equal(derived!.quote_unresolved, false);
  assert.deepEqual(derived!.quotes, [
    { claim_id: 'claim-1', document_id: 'doc-1', quote: 'Dogs fed chicken had less itching.' },
  ]);
  assert.deepEqual(derived!.reviews, [
    { source: 'claim', reviewed_by: 'reviewer-1', reviewed_at: '2026-08-01T00:00:00Z' },
  ]);

  const concerns = graph.edges.find((edge) => edge.edge_type === 'CONCERNS');
  assert.ok(concerns);
  assert.equal(concerns!.quote_unresolved, false);
  assert.equal(concerns!.quotes[0]?.quote, 'Dogs fed chicken had less itching.');
});

test('MEMBER_OF edge carries semantic_similarity as a labelled navigation signal, not as its evidence', () => {
  const graph = assembleResearchGraph(baseRows);
  const memberOf = graph.edges.find((edge) => edge.edge_type === 'MEMBER_OF');
  assert.ok(memberOf);
  assert.equal(memberOf!.navigation_signals.semantic_similarity, 0.92);
  assert.equal(memberOf!.quote_unresolved, false);
  assert.deepEqual(
    memberOf!.reviews.map((review) => review.source).sort(),
    ['claim', 'cluster']
  );
});

test('SUPPORTS/CAUTIONS_AGAINST edges resolve their quote through the cluster\'s eligible member claims', () => {
  const graph = assembleResearchGraph(baseRows);
  const supports = graph.edges.find((edge) => edge.edge_type === 'SUPPORTS');
  assert.ok(supports);
  assert.equal(supports!.quote_unresolved, false);
  assert.equal(supports!.quotes[0]?.quote, 'Dogs fed chicken had less itching.');
  assert.deepEqual(supports!.reviews, [
    { source: 'cluster', reviewed_by: 'reviewer-2', reviewed_at: '2026-08-02T00:00:00Z' },
  ]);
});

test('a directional or applicability edge whose cluster has no eligible member quote is flagged, not silently blank', () => {
  const graph = assembleResearchGraph(baseRows);
  const cautions = graph.edges.find((edge) => edge.edge_type === 'CAUTIONS_AGAINST');
  assert.ok(cautions);
  assert.equal(cautions!.quotes.length, 0);
  assert.equal(cautions!.quote_unresolved, true);

  const appliesToCluster2 = graph.edges.find(
    (edge) => edge.edge_type === 'APPLIES_TO' && edge.from === 'cluster:cluster-2'
  );
  assert.ok(appliesToCluster2);
  assert.equal(appliesToCluster2!.quote_unresolved, true);

  const appliesToCluster1 = graph.edges.find(
    (edge) => edge.edge_type === 'APPLIES_TO' && edge.from === 'cluster:cluster-1'
  );
  assert.ok(appliesToCluster1);
  assert.equal(appliesToCluster1!.quote_unresolved, false);
});

test('concept nodes are deduplicated across claims, clusters, and direction edges', () => {
  const graph = assembleResearchGraph(baseRows);
  const chickenNodes = graph.nodes.filter((node) => node.id === 'concept:ingredient:chicken');
  assert.equal(chickenNodes.length, 1);
  const itchySkinNodes = graph.nodes.filter((node) => node.id === 'concept:condition:itchy_skin');
  assert.equal(itchySkinNodes.length, 1);
  assert.ok(itchySkinNodes[0].navigation_degree >= 2);
});

test('SAME_STUDY_FAMILY edges carry their automatic match basis and no human review', () => {
  const graph = assembleResearchGraph(baseRows);
  const sameStudyFamily = graph.edges.find((edge) => edge.edge_type === 'SAME_STUDY_FAMILY');
  assert.ok(sameStudyFamily);
  assert.equal(sameStudyFamily!.from, 'document:doc-2');
  assert.equal(sameStudyFamily!.to, 'document:doc-1');
  assert.deepEqual(
    sameStudyFamily!.reviews,
    [],
    'an automatic match has no human reviewer and must never claim one'
  );
  assert.deepEqual(sameStudyFamily!.quotes, []);
  assert.equal(
    sameStudyFamily!.quote_unresolved,
    false,
    'a bibliographic-identity edge has no literal quote by nature -- that is not the same failure as a missing quote'
  );
  assert.deepEqual(sameStudyFamily!.automatic_match, {
    method: 'author_and_title',
    title_similarity: 0.9143,
    matched_authors: ['smith j'],
    publication_year_delta: 1,
  });
});

test('no supersession edge type is ever produced, and its absence is documented, not silent', () => {
  const graph = assembleResearchGraph(baseRows);
  const forbiddenTypes = new Set(['SUPERSEDES', 'RETRACTED_BY']);
  assert.equal(graph.edges.some((edge) => forbiddenTypes.has(edge.edge_type)), false);
  assert.match(graph.deferred.supersedes_retracted_by, /P5/);
});
