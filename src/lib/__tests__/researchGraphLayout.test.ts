import assert from 'node:assert/strict';
import test from 'node:test';
import {
  buildLayoutEdges,
  buildLayoutNodes,
  deriveClusterGroups,
  deriveNodeConcepts,
  deriveStudyFamilies,
  formatConcept,
  groupKeyFor,
  isoToFractionalYear,
  truncateLabel,
} from '../researchGraphLayout';
import { ResearchGraph } from '../researchGraphReadModel';

function graph(overrides: Partial<ResearchGraph> = {}): ResearchGraph {
  return {
    nodes: [
      {
        id: 'document:doc-1',
        kind: 'document',
        label: 'Study One',
        data: { document_id: 'doc-1', title: 'Study One', publication_year: 2024 },
        navigation_degree: 2,
      },
      {
        id: 'claim:claim-1',
        kind: 'claim',
        label: 'reduced itching',
        data: {
          claim_id: 'claim-1',
          document_id: 'doc-1',
          subject_type: 'ingredient',
          subject_value: 'chicken',
          reviewed_at: '2026-08-01T00:00:00Z',
          supporting_quote: 'Dogs fed chicken had less itching.',
        },
        navigation_degree: 3,
      },
      {
        id: 'cluster:cluster-1',
        kind: 'cluster',
        label: 'Chicken and itchy skin',
        data: {
          cluster_id: 'cluster-1',
          subject_type: 'ingredient',
          subject_value: 'chicken',
          reviewed_at: '2026-08-02T00:00:00Z',
        },
        navigation_degree: 2,
      },
      {
        id: 'document:doc-2',
        kind: 'document',
        label: 'Study Two (tombstoned)',
        data: { document_id: 'doc-2', title: 'Study Two', tombstoned: true },
        navigation_degree: 1,
      },
      {
        id: 'event:ev-1',
        kind: 'event',
        label: 'Retraction: bad data',
        data: { reason: 'bad data', occurred_at: '2026-07-15T00:00:00Z' },
        navigation_degree: 1,
      },
    ],
    edges: [
      { id: 'e1', edge_type: 'DERIVED_FROM', from: 'claim:claim-1', to: 'document:doc-1', reviews: [], quotes: [], quote_unresolved: false, navigation_signals: { semantic_similarity: null }, automatic_match: null },
      { id: 'e2', edge_type: 'MEMBER_OF', from: 'claim:claim-1', to: 'cluster:cluster-1', reviews: [], quotes: [], quote_unresolved: false, navigation_signals: { semantic_similarity: null }, automatic_match: null },
      { id: 'e3', edge_type: 'RETRACTED_BY', from: 'document:doc-2', to: 'event:ev-1', reviews: [], quotes: [], quote_unresolved: false, navigation_signals: { semantic_similarity: null }, automatic_match: null },
    ],
    ...overrides,
  };
}

test('deriveNodeConcepts reads subject_type:subject_value directly off claims/clusters', () => {
  const g = graph();
  const concepts = deriveNodeConcepts(g.nodes, g.edges);
  assert.equal(concepts.get('claim:claim-1'), 'ingredient:chicken');
  assert.equal(concepts.get('cluster:cluster-1'), 'ingredient:chicken');
});

test('deriveNodeConcepts propagates claim concept to its document, and document to its retraction event', () => {
  const g = graph();
  const concepts = deriveNodeConcepts(g.nodes, g.edges);
  assert.equal(concepts.get('document:doc-1'), 'ingredient:chicken');
  // doc-2 has no claims in this fixture, so it stays ungrouped -- only the
  // RETRACTED_BY inheritance path should ever assign a concept to an event.
  assert.equal(concepts.get('event:ev-1'), null);
});

test('deriveNodeConcepts propagates through a document that does have a claim, into its lifecycle event', () => {
  const g = graph();
  g.edges.push({
    id: 'e4',
    edge_type: 'RETRACTED_BY',
    from: 'document:doc-1',
    to: 'event:ev-1',
    reviews: [],
    quotes: [],
    quote_unresolved: false,
    navigation_signals: { semantic_similarity: null },
    automatic_match: null,
  });
  const concepts = deriveNodeConcepts(g.nodes, g.edges);
  assert.equal(concepts.get('event:ev-1'), 'ingredient:chicken');
});

test('deriveStudyFamilies keys both sides of a SAME_STUDY_FAMILY edge by the primary document id', () => {
  const edges = buildLayoutEdges(graph()).concat([
    { id: 'sf', type: 'SAME_STUDY_FAMILY', from: 'document:doc-2', to: 'document:doc-1' },
  ]);
  const families = deriveStudyFamilies(
    edges.map((e) => ({ ...e, edge_type: e.type, reviews: [], quotes: [], quote_unresolved: false, navigation_signals: { semantic_similarity: null }, automatic_match: null })),
  );
  assert.equal(families.get('document:doc-2'), 'document:doc-1');
  assert.equal(families.get('document:doc-1'), 'document:doc-1');
});

test('deriveClusterGroups maps a claim to the cluster it is MEMBER_OF, and a cluster to itself', () => {
  const g = graph();
  const groups = deriveClusterGroups(g.nodes, g.edges);
  assert.equal(groups.get('claim:claim-1'), 'cluster:cluster-1');
  assert.equal(groups.get('cluster:cluster-1'), 'cluster:cluster-1');
  assert.equal(groups.get('document:doc-1'), undefined);
});

test('formatConcept renders subject_type:subject_value as readable "type: value"', () => {
  assert.equal(formatConcept('ingredient_class:legume_rich'), 'ingredient class: legume rich');
  assert.equal(formatConcept(null), 'Ungrouped');
});

test('truncateLabel only truncates when over the limit, and always appends an ellipsis when it does', () => {
  assert.equal(truncateLabel('short', 20), 'short');
  const long = 'a'.repeat(40);
  const truncated = truncateLabel(long, 10);
  assert.equal(truncated.length, 10);
  assert.ok(truncated.endsWith('…'));
});

test('isoToFractionalYear places a mid-year timestamp between its year and year+1', () => {
  const julyFirst = isoToFractionalYear('2026-07-02T00:00:00Z');
  assert.ok(julyFirst !== null && julyFirst > 2026.4 && julyFirst < 2026.6);
  assert.equal(isoToFractionalYear(null), null);
  assert.equal(isoToFractionalYear('not-a-date'), null);
});

test('buildLayoutNodes marks a tombstoned document as tombstoned status and everything else active', () => {
  const nodes = buildLayoutNodes(graph());
  const doc2 = nodes.find((n) => n.id === 'document:doc-2');
  const doc1 = nodes.find((n) => n.id === 'document:doc-1');
  assert.equal(doc2?.status, 'tombstoned');
  assert.equal(doc1?.status, 'active');
});

test('buildLayoutNodes reads document year from publication_year and claim/cluster year from reviewed_at', () => {
  const nodes = buildLayoutNodes(graph());
  const doc1 = nodes.find((n) => n.id === 'document:doc-1');
  const claim1 = nodes.find((n) => n.id === 'claim:claim-1');
  assert.equal(doc1?.year, 2024);
  assert.ok(claim1?.year !== null && claim1!.year > 2026 && claim1!.year < 2027);
});

test('groupKeyFor returns null (ungrouped) rather than a fabricated group when the node has no concept/family/cluster', () => {
  const nodes = buildLayoutNodes(graph());
  const doc2 = nodes.find((n) => n.id === 'document:doc-2')!;
  assert.equal(groupKeyFor(doc2, 'concept'), null);
  assert.equal(groupKeyFor(doc2, 'studyFamily'), null);
  const claim1 = nodes.find((n) => n.id === 'claim:claim-1')!;
  assert.equal(groupKeyFor(claim1, 'concept'), 'concept:ingredient:chicken');
});
