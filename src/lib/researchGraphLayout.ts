import { ResearchGraph, ResearchGraphEdge, ResearchGraphNode, ResearchGraphNodeKind } from './researchGraphReadModel';

/**
 * Pure data-transform layer for the P7 spatial graph canvas. Turns the
 * existing P3/P4/P5 read model (researchGraphReadModel.ts) into a
 * layout-ready shape, without adding any eligibility logic of its own --
 * every node/edge this module sees already passed the active-only projection
 * rule, so there is no "queued"/"draft" node status to represent here, only
 * "active" and "tombstoned" (retracted/superseded).
 *
 * The one thing this module deliberately does NOT hardcode is topic
 * grouping: "concept" is read directly off each claim/cluster's existing
 * subject_type/subject_value (the same field research_graph_concept_nodes
 * already exposes), never a maintained list. A claim about a subject nobody
 * has drafted before is automatically its own new group.
 */

export type LayoutNodeStatus = 'active' | 'tombstoned';

export interface LayoutNode {
  id: string;
  kind: ResearchGraphNodeKind;
  label: string;
  /** subject_type:subject_value, or null when it cannot be derived. */
  concept: string | null;
  /** The SAME_STUDY_FAMILY primary document id this node belongs to, if any. */
  studyFamily: string | null;
  /** The cluster id this node belongs to (its own id, for a cluster node). */
  clusterGroup: string | null;
  status: LayoutNodeStatus;
  /** Fractional year for the timeline layout; null when no date field applies. */
  year: number | null;
  raw: Record<string, unknown>;
  navigationDegree: number;
}

export interface LayoutEdge {
  id: string;
  type: ResearchGraphEdge['edge_type'];
  from: string;
  to: string;
}

export type GroupByMode = 'none' | 'concept' | 'studyFamily' | 'cluster';

function str(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  return typeof value === 'string' && value.length > 0 ? value : null;
}

export function isoToFractionalYear(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  const year = date.getUTCFullYear();
  const startOfYear = Date.UTC(year, 0, 1);
  const startOfNextYear = Date.UTC(year + 1, 0, 1);
  const fraction = (date.getTime() - startOfYear) / (startOfNextYear - startOfYear);
  return year + fraction;
}

/**
 * subject_type:subject_value is read directly from claim/cluster rows.
 * Documents and lifecycle-event nodes have no subject of their own, so they
 * inherit the concept of whatever they're DERIVED_FROM / RETRACTED_BY —
 * an approximation (a document with claims spanning two concepts keeps the
 * first one seen), disclosed rather than hidden.
 */
export function deriveNodeConcepts(
  nodes: ResearchGraphNode[],
  edges: ResearchGraphEdge[],
): Map<string, string | null> {
  const concepts = new Map<string, string | null>();
  for (const node of nodes) {
    const subjectType = str(node.data, 'subject_type');
    const subjectValue = str(node.data, 'subject_value');
    if ((node.kind === 'claim' || node.kind === 'cluster') && subjectType && subjectValue) {
      concepts.set(node.id, `${subjectType}:${subjectValue}`);
    } else if (node.kind === 'concept') {
      const conceptType = str(node.data, 'concept_type');
      const conceptKey = str(node.data, 'concept_key');
      concepts.set(node.id, conceptType && conceptKey ? `${conceptType}:${conceptKey}` : null);
    } else {
      concepts.set(node.id, null);
    }
  }
  // Propagate claim -> document, then document -> its RETRACTED_BY/SUPERSEDES
  // tombstone target, in two passes so inheritance chains resolve regardless
  // of edge order in the response.
  for (let pass = 0; pass < 2; pass++) {
    for (const edge of edges) {
      if (edge.edge_type !== 'DERIVED_FROM' && edge.edge_type !== 'RETRACTED_BY' && edge.edge_type !== 'SUPERSEDES') continue;
      const source = concepts.get(edge.from);
      if (source && !concepts.get(edge.to)) concepts.set(edge.to, source);
    }
  }
  return concepts;
}

/** SAME_STUDY_FAMILY edges point duplicate -> primary; the primary id is the family key. */
export function deriveStudyFamilies(edges: ResearchGraphEdge[]): Map<string, string> {
  const families = new Map<string, string>();
  for (const edge of edges) {
    if (edge.edge_type !== 'SAME_STUDY_FAMILY') continue;
    families.set(edge.from, edge.to);
    families.set(edge.to, edge.to);
  }
  return families;
}

/** MEMBER_OF edges point claim -> cluster; a cluster is its own group. */
export function deriveClusterGroups(
  nodes: ResearchGraphNode[],
  edges: ResearchGraphEdge[],
): Map<string, string> {
  const groups = new Map<string, string>();
  for (const node of nodes) {
    if (node.kind === 'cluster') groups.set(node.id, node.id);
  }
  for (const edge of edges) {
    if (edge.edge_type === 'MEMBER_OF') groups.set(edge.from, edge.to);
  }
  return groups;
}

export function formatConcept(key: string | null): string {
  if (!key) return 'Ungrouped';
  const sep = key.indexOf(':');
  if (sep === -1) return key.replace(/_/g, ' ');
  const type = key.slice(0, sep).replace(/_/g, ' ');
  const value = key.slice(sep + 1).replace(/_/g, ' ');
  return `${type}: ${value}`;
}

export function truncateLabel(label: string, max: number): string {
  return label.length > max ? `${label.slice(0, max - 1)}…` : label;
}

function nodeYear(node: ResearchGraphNode): number | null {
  const publicationYear = node.data.publication_year;
  if (typeof publicationYear === 'number') return publicationYear;
  const reviewedAt = str(node.data, 'reviewed_at');
  if (reviewedAt) return isoToFractionalYear(reviewedAt);
  const occurredAt = str(node.data, 'occurred_at');
  if (occurredAt) return isoToFractionalYear(occurredAt);
  return null;
}

/** Deterministic starting angle for a group so re-renders don't reshuffle layout on load. */
export function hashAngle(seed: string): number {
  let hash = 0;
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  return ((hash % 360) * Math.PI) / 180;
}

export function buildLayoutNodes(graph: ResearchGraph): LayoutNode[] {
  const concepts = deriveNodeConcepts(graph.nodes, graph.edges);
  const studyFamilies = deriveStudyFamilies(graph.edges);
  const clusterGroups = deriveClusterGroups(graph.nodes, graph.edges);
  return graph.nodes.map((node) => ({
    id: node.id,
    kind: node.kind,
    label: node.label,
    concept: concepts.get(node.id) ?? null,
    studyFamily: studyFamilies.get(node.id) ?? null,
    clusterGroup: clusterGroups.get(node.id) ?? null,
    status: node.data.tombstoned === true ? 'tombstoned' : 'active',
    year: nodeYear(node),
    raw: node.data,
    navigationDegree: node.navigation_degree,
  }));
}

export function buildLayoutEdges(graph: ResearchGraph): LayoutEdge[] {
  return graph.edges.map((edge) => ({ id: edge.id, type: edge.edge_type, from: edge.from, to: edge.to }));
}

export function groupKeyFor(node: LayoutNode, mode: GroupByMode): string | null {
  if (mode === 'concept') return node.concept ? `concept:${node.concept}` : null;
  if (mode === 'studyFamily') return node.studyFamily ? `sf:${node.studyFamily}` : null;
  if (mode === 'cluster') return node.clusterGroup ? `cl:${node.clusterGroup}` : null;
  return null;
}

export const NODE_KIND_ORDER: ResearchGraphNodeKind[] = ['cluster', 'document', 'claim', 'concept', 'context', 'event'];
export const LABEL_PRIORITY: Record<ResearchGraphNodeKind, number> = {
  cluster: 0,
  document: 1,
  concept: 2,
  context: 2,
  event: 3,
  claim: 4,
};
export const RADIUS_BY_KIND: Record<ResearchGraphNodeKind, number> = {
  document: 9,
  cluster: 10,
  claim: 6.5,
  concept: 6,
  context: 6,
  event: 7,
};

export function edgeStroke(type: LayoutEdge['type']): { color: string; dash: number[] } {
  if (type === 'SAME_STUDY_FAMILY') return { color: '#B8863B', dash: [5, 4] };
  if (type === 'RETRACTED_BY' || type === 'SUPERSEDES') return { color: '#B42318', dash: [1, 4] };
  return { color: '#1E4D45', dash: [] };
}
