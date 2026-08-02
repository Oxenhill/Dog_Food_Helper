type Row = Record<string, unknown>;

export type ResearchGraphNodeKind = 'document' | 'claim' | 'cluster' | 'concept' | 'context' | 'event';

export type ResearchGraphEdgeType =
  | 'DERIVED_FROM'
  | 'MEMBER_OF'
  | 'SUPPORTS'
  | 'CAUTIONS_AGAINST'
  | 'CONCERNS'
  | 'APPLIES_TO'
  | 'SAME_STUDY_FAMILY'
  | 'SUPERSEDES'
  | 'RETRACTED_BY';

export interface ResearchGraphAutomaticMatch {
  method: string;
  title_similarity: number | null;
  matched_authors: string[];
  publication_year_delta: number | null;
}

export interface ResearchGraphQuote {
  claim_id: string;
  document_id: string;
  quote: string;
}

export interface ResearchGraphReview {
  source: 'claim' | 'cluster';
  reviewed_by: string | null;
  reviewed_at: string | null;
}

export interface ResearchGraphNode {
  id: string;
  kind: ResearchGraphNodeKind;
  label: string;
  data: Row;
  navigation_degree: number;
}

export interface ResearchGraphEdge {
  id: string;
  edge_type: ResearchGraphEdgeType;
  from: string;
  to: string;
  reviews: ResearchGraphReview[];
  quotes: ResearchGraphQuote[];
  quote_unresolved: boolean;
  navigation_signals: {
    semantic_similarity: number | null;
  };
  automatic_match: ResearchGraphAutomaticMatch | null;
}

export interface ResearchGraphViewRows {
  documents: Row[];
  claims: Row[];
  clusters: Row[];
  conceptNodes: Row[];
  edgesDerivedFrom: Row[];
  edgesMemberOf: Row[];
  edgesDirection: Row[];
  edgesConcerns: Row[];
  edgesAppliesTo: Row[];
  edgesSameStudyFamily: Row[];
  edgesSupersedes: Row[];
  edgesRetractedBy: Row[];
  clusterMembersRaw?: Row[];
}

export interface ResearchGraph {
  nodes: ResearchGraphNode[];
  edges: ResearchGraphEdge[];
}

function str(row: Row, key: string): string {
  const value = row[key];
  return typeof value === 'string' ? value : '';
}

function strOrNull(row: Row, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' ? value : null;
}

function numOrNull(row: Row, key: string): number | null {
  const value = row[key];
  if (value === null || value === undefined) return null;
  const parsed = typeof value === 'number' ? value : Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function documentNodeId(documentId: string): string {
  return `document:${documentId}`;
}
function claimNodeId(claimId: string): string {
  return `claim:${claimId}`;
}
function clusterNodeId(clusterId: string): string {
  return `cluster:${clusterId}`;
}
function conceptNodeId(conceptType: string, conceptKey: string): string {
  return `concept:${conceptType}:${conceptKey}`;
}
function contextNodeId(contextType: string, contextKey: string, contextValue: string | null): string {
  return `context:${contextType}:${contextKey}:${contextValue ?? ''}`;
}

function claimReview(claim: Row): ResearchGraphReview {
  return {
    source: 'claim',
    reviewed_by: strOrNull(claim, 'reviewed_by'),
    reviewed_at: strOrNull(claim, 'reviewed_at'),
  };
}

function clusterReview(cluster: Row): ResearchGraphReview {
  return {
    source: 'cluster',
    reviewed_by: strOrNull(cluster, 'reviewed_by'),
    reviewed_at: strOrNull(cluster, 'reviewed_at'),
  };
}

/**
 * Assembles the P4 admin graph explorer's read model from the P3
 * research_graph_* view rows. This is a pure projection of what the views
 * already returned -- it adds no eligibility logic of its own. Two things it
 * does add on top of the raw rows, both explicitly labelled and never treated
 * as evidence:
 *   - navigation_degree per node (how many displayed edges touch it);
 *   - semantic_similarity per MEMBER_OF edge, read from the base
 *     research_evidence_cluster_members table for the same already-eligible
 *     (cluster_id, claim_id) pairs the view already selected.
 *
 * Every edge must resolve to reviewer metadata and a literal quote per the
 * P4 acceptance criterion. DERIVED_FROM/CONCERNS/MEMBER_OF carry their quote
 * directly from the claim endpoint. SUPPORTS/CAUTIONS_AGAINST/APPLIES_TO have
 * no claim endpoint of their own, so their quotes are the literal quotes of
 * their cluster's eligible member claims. If a cluster has no eligible member
 * quote left (e.g. its only supporting claim's document was later excluded),
 * `quote_unresolved` is set true rather than silently rendering an edge that
 * looks fully evidenced when it is not.
 */
export function assembleResearchGraph(rows: ResearchGraphViewRows): ResearchGraph {
  const claimsById = new Map(
    rows.claims.filter((row) => str(row, 'claim_id')).map((row) => [str(row, 'claim_id'), row])
  );
  const clustersById = new Map(
    rows.clusters.filter((row) => str(row, 'cluster_id')).map((row) => [str(row, 'cluster_id'), row])
  );
  const similarityByPair = new Map(
    (rows.clusterMembersRaw ?? [])
      .filter((row) => str(row, 'cluster_id') && str(row, 'claim_id'))
      .map((row) => [`${str(row, 'cluster_id')}:${str(row, 'claim_id')}`, numOrNull(row, 'semantic_similarity')])
  );

  const nodesById = new Map<string, ResearchGraphNode>();
  const degree = new Map<string, number>();

  function upsertNode(id: string, kind: ResearchGraphNodeKind, label: string, data: Row) {
    if (!nodesById.has(id)) {
      nodesById.set(id, { id, kind, label, data, navigation_degree: 0 });
    }
  }

  function touch(id: string) {
    degree.set(id, (degree.get(id) ?? 0) + 1);
  }

  for (const document of rows.documents) {
    const id = documentNodeId(str(document, 'document_id'));
    upsertNode(id, 'document', str(document, 'title') || str(document, 'doi') || id, document);
  }
  for (const claim of rows.claims) {
    const id = claimNodeId(str(claim, 'claim_id'));
    upsertNode(id, 'claim', str(claim, 'effect_summary') || str(claim, 'subject_value') || id, claim);
  }
  for (const cluster of rows.clusters) {
    const id = clusterNodeId(str(cluster, 'cluster_id'));
    upsertNode(id, 'cluster', str(cluster, 'label') || id, cluster);
  }
  for (const concept of rows.conceptNodes) {
    const conceptType = str(concept, 'concept_type');
    const conceptKey = str(concept, 'concept_key');
    if (!conceptType || !conceptKey) continue;
    upsertNode(conceptNodeId(conceptType, conceptKey), 'concept', `${conceptType}: ${conceptKey}`, concept);
  }

  const edges: ResearchGraphEdge[] = [];

  for (const row of rows.edgesDerivedFrom) {
    const claimId = str(row, 'claim_id');
    const documentId = str(row, 'document_id');
    const claim = claimsById.get(claimId);
    const quote = claim ? strOrNull(claim, 'supporting_quote') : null;
    const from = claimNodeId(claimId);
    const to = documentNodeId(documentId);
    touch(from);
    touch(to);
    edges.push({
      id: `DERIVED_FROM:${claimId}`,
      edge_type: 'DERIVED_FROM',
      from,
      to,
      reviews: claim ? [claimReview(claim)] : [],
      quotes: quote ? [{ claim_id: claimId, document_id: documentId, quote }] : [],
      quote_unresolved: !quote,
      navigation_signals: { semantic_similarity: null },
      automatic_match: null,
    });
  }

  const memberOfEdgesByCluster = new Map<string, ResearchGraphEdge[]>();
  for (const row of rows.edgesMemberOf) {
    const claimId = str(row, 'claim_id');
    const clusterId = str(row, 'cluster_id');
    const claim = claimsById.get(claimId);
    const cluster = clustersById.get(clusterId);
    const quote = claim ? strOrNull(claim, 'supporting_quote') : null;
    const from = claimNodeId(claimId);
    const to = clusterNodeId(clusterId);
    touch(from);
    touch(to);
    const edge: ResearchGraphEdge = {
      id: `MEMBER_OF:${claimId}:${clusterId}`,
      edge_type: 'MEMBER_OF',
      from,
      to,
      reviews: [...(claim ? [claimReview(claim)] : []), ...(cluster ? [clusterReview(cluster)] : [])],
      quotes: quote ? [{ claim_id: claimId, document_id: str(claim!, 'document_id'), quote }] : [],
      quote_unresolved: !quote,
      navigation_signals: { semantic_similarity: similarityByPair.get(`${clusterId}:${claimId}`) ?? null },
      automatic_match: null,
    };
    edges.push(edge);
    const forCluster = memberOfEdgesByCluster.get(clusterId) ?? [];
    forCluster.push(edge);
    memberOfEdgesByCluster.set(clusterId, forCluster);
  }

  function clusterQuotesAndReviews(clusterId: string): {
    quotes: ResearchGraphQuote[];
    reviews: ResearchGraphReview[];
  } {
    const cluster = clustersById.get(clusterId);
    const reviews = cluster ? [clusterReview(cluster)] : [];
    const seen = new Set<string>();
    const quotes: ResearchGraphQuote[] = [];
    for (const memberEdge of memberOfEdgesByCluster.get(clusterId) ?? []) {
      for (const quote of memberEdge.quotes) {
        if (seen.has(quote.claim_id)) continue;
        seen.add(quote.claim_id);
        quotes.push(quote);
      }
    }
    return { quotes, reviews };
  }

  for (const row of rows.edgesDirection) {
    const clusterId = str(row, 'cluster_id');
    const edgeType = str(row, 'edge_type') as ResearchGraphEdgeType;
    if (edgeType !== 'SUPPORTS' && edgeType !== 'CAUTIONS_AGAINST') continue;
    const subjectId = conceptNodeId(str(row, 'subject_type'), str(row, 'subject_value'));
    const outcomeId = conceptNodeId(str(row, 'outcome_type'), str(row, 'outcome_value'));
    touch(subjectId);
    touch(outcomeId);
    const { quotes, reviews } = clusterQuotesAndReviews(clusterId);
    edges.push({
      id: `${edgeType}:${clusterId}`,
      edge_type: edgeType,
      from: subjectId,
      to: outcomeId,
      reviews,
      quotes,
      quote_unresolved: quotes.length === 0,
      navigation_signals: { semantic_similarity: null },
      automatic_match: null,
    });
  }

  for (const row of rows.edgesConcerns) {
    const claimId = str(row, 'claim_id');
    const conditionKey = str(row, 'condition_key');
    const claim = claimsById.get(claimId);
    const quote = claim ? strOrNull(claim, 'supporting_quote') : null;
    const from = claimNodeId(claimId);
    const to = conceptNodeId('condition', conditionKey);
    touch(from);
    touch(to);
    edges.push({
      id: `CONCERNS:${claimId}:${conditionKey}`,
      edge_type: 'CONCERNS',
      from,
      to,
      reviews: claim ? [claimReview(claim)] : [],
      quotes: quote ? [{ claim_id: claimId, document_id: str(claim!, 'document_id'), quote }] : [],
      quote_unresolved: !quote,
      navigation_signals: { semantic_similarity: null },
      automatic_match: null,
    });
  }

  for (const row of rows.edgesAppliesTo) {
    const clusterId = str(row, 'cluster_id');
    const contextType = str(row, 'context_type');
    const contextKey = str(row, 'context_key');
    const contextValue = strOrNull(row, 'context_value');
    const contextId = contextNodeId(contextType, contextKey, contextValue);
    upsertNode(
      contextId,
      'context',
      `${contextType}: ${contextKey}${contextValue ? ` = ${contextValue}` : ''}`,
      row
    );
    const from = clusterNodeId(clusterId);
    touch(from);
    touch(contextId);
    const { quotes, reviews } = clusterQuotesAndReviews(clusterId);
    edges.push({
      id: `APPLIES_TO:${clusterId}:${contextId}`,
      edge_type: 'APPLIES_TO',
      from,
      to: contextId,
      reviews,
      quotes,
      quote_unresolved: quotes.length === 0,
      navigation_signals: { semantic_similarity: null },
      automatic_match: null,
    });
  }

  for (const row of rows.edgesSameStudyFamily) {
    const duplicateId = str(row, 'duplicate_document_id');
    const primaryId = str(row, 'primary_document_id');
    const from = documentNodeId(duplicateId);
    const to = documentNodeId(primaryId);
    touch(from);
    touch(to);
    const basis = row.match_basis as Row | null;
    edges.push({
      id: `SAME_STUDY_FAMILY:${duplicateId}:${primaryId}`,
      edge_type: 'SAME_STUDY_FAMILY',
      from,
      to,
      reviews: [],
      quotes: [],
      quote_unresolved: false,
      navigation_signals: { semantic_similarity: null },
      automatic_match: basis
        ? {
            method: str(basis, 'method'),
            title_similarity: numOrNull(basis, 'title_similarity'),
            matched_authors: Array.isArray(basis.matched_authors)
              ? (basis.matched_authors as unknown[]).filter(
                  (value): value is string => typeof value === 'string'
                )
              : [],
            publication_year_delta: numOrNull(basis, 'publication_year_delta'),
          }
        : null,
    });
  }

  for (const row of rows.edgesSupersedes) {
    const newDocumentId = str(row, 'new_document_id');
    const oldDocumentId = str(row, 'old_document_id');
    const from = documentNodeId(newDocumentId);
    const to = documentNodeId(oldDocumentId);
    // The old/superseded document is never itself an eligible node (that is
    // what supersession means) -- upsert a minimal tombstone so the edge
    // resolves to something displayable instead of a dangling id.
    upsertNode(to, 'document', str(row, 'old_document_title') || oldDocumentId, {
      document_id: oldDocumentId,
      title: str(row, 'old_document_title'),
      tombstoned: true,
    });
    touch(from);
    touch(to);
    edges.push({
      id: `SUPERSEDES:${newDocumentId}:${oldDocumentId}`,
      edge_type: 'SUPERSEDES',
      from,
      to,
      reviews: [],
      quotes: [],
      quote_unresolved: false,
      navigation_signals: { semantic_similarity: null },
      automatic_match: null,
    });
  }

  for (const row of rows.edgesRetractedBy) {
    const documentId = str(row, 'document_id');
    const eventId = str(row, 'lifecycle_event_id');
    const from = documentNodeId(documentId);
    const to = `lifecycle_event:${eventId}`;
    upsertNode(from, 'document', str(row, 'document_title') || documentId, {
      document_id: documentId,
      title: str(row, 'document_title'),
      tombstoned: true,
    });
    upsertNode(to, 'event', `Retraction: ${str(row, 'reason') || eventId}`, row);
    touch(from);
    touch(to);
    edges.push({
      id: `RETRACTED_BY:${documentId}:${eventId}`,
      edge_type: 'RETRACTED_BY',
      from,
      to,
      reviews: [],
      quotes: [],
      quote_unresolved: false,
      navigation_signals: { semantic_similarity: null },
      automatic_match: null,
    });
  }

  const nodes = Array.from(nodesById.values()).map((node) => ({
    ...node,
    navigation_degree: degree.get(node.id) ?? 0,
  }));

  return { nodes, edges };
}
