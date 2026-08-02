'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';
import {
  ResearchGraph,
  ResearchGraphEdge,
  ResearchGraphNode,
  ResearchGraphNodeKind,
} from '@/lib/researchGraphReadModel';

const EMPTY_GRAPH: ResearchGraph = {
  nodes: [],
  edges: [],
};

const KIND_LABEL: Record<ResearchGraphNodeKind, string> = {
  document: 'Document',
  claim: 'Claim',
  cluster: 'Cluster',
  concept: 'Concept',
  context: 'Dog-profile context',
  event: 'Lifecycle event',
};

const KIND_ORDER: ResearchGraphNodeKind[] = ['cluster', 'claim', 'document', 'concept', 'context', 'event'];

function nodeLookup(nodes: ResearchGraphNode[]): Map<string, ResearchGraphNode> {
  return new Map(nodes.map((node) => [node.id, node]));
}

export default function ResearchGraphExplorer() {
  const [graph, setGraph] = useState<ResearchGraph>(EMPTY_GRAPH);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [filter, setFilter] = useState('');
  const [kindFilter, setKindFilter] = useState<ResearchGraphNodeKind | 'all'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/research/graph', {
        headers: sessionAuthHeaders(),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load the evidence graph');
      setGraph(body as ResearchGraph);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load the evidence graph');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const byId = useMemo(() => nodeLookup(graph.nodes), [graph.nodes]);

  const visibleNodes = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return graph.nodes
      .filter((node) => kindFilter === 'all' || node.kind === kindFilter)
      .filter((node) => !needle || node.label.toLowerCase().includes(needle))
      .sort(
        (left, right) =>
          KIND_ORDER.indexOf(left.kind) - KIND_ORDER.indexOf(right.kind)
          || right.navigation_degree - left.navigation_degree
          || left.label.localeCompare(right.label)
      );
  }, [graph.nodes, filter, kindFilter]);

  const selectedNode = selectedId ? byId.get(selectedId) ?? null : null;
  const connectedEdges = useMemo(() => {
    if (!selectedId) return [] as ResearchGraphEdge[];
    return graph.edges.filter((edge) => edge.from === selectedId || edge.to === selectedId);
  }, [graph.edges, selectedId]);

  return (
    <section className="card card-pad flex flex-col gap-5">
      <div>
        <p className="eyebrow">Evidence graph</p>
        <h2 className="section-title mt-1">Admin graph explorer</h2>
        <p className="help-text mt-2">
          Read-only navigation over the active, human-reviewed evidence projection. Every edge
          below resolves to reviewer metadata and a literal quote, except SAME_STUDY_FAMILY edges
          (labelled below), which are automatic bibliographic matches, not human review. SUPERSEDES
          and RETRACTED_BY edges point at tombstoned documents (shown greyed out) that are not
          themselves eligible nodes — that is what retraction/supersession means. This view
          approves, edits, and publishes nothing — that stays in the cluster review workflow.
        </p>
      </div>

      {error && <div className="callout-alarm" role="alert">{error}</div>}
      {loading && !graph.nodes.length && <p className="help-text">Loading evidence graph…</p>}

      <div className="grid gap-4 lg:grid-cols-[minmax(0,320px)_1fr]">
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap gap-2">
            <input
              className="input flex-1"
              placeholder="Search nodes…"
              value={filter}
              onChange={(event) => setFilter(event.target.value)}
              aria-label="Search graph nodes"
            />
            <select
              className="select"
              value={kindFilter}
              onChange={(event) => setKindFilter(event.target.value as ResearchGraphNodeKind | 'all')}
              aria-label="Filter by node kind"
            >
              <option value="all">All kinds</option>
              {KIND_ORDER.map((kind) => (
                <option key={kind} value={kind}>{KIND_LABEL[kind]}</option>
              ))}
            </select>
          </div>
          <div className="max-h-[480px] overflow-y-auto rounded border border-line">
            {visibleNodes.map((node) => {
              const tombstoned = node.data.tombstoned === true;
              return (
                <button
                  key={node.id}
                  type="button"
                  onClick={() => setSelectedId(node.id)}
                  className={`flex w-full flex-col gap-1 border-b border-line px-3 py-2 text-left text-[13px] hover:bg-surface ${
                    selectedId === node.id ? 'bg-pine-tint/30' : ''
                  } ${tombstoned ? 'opacity-60' : ''}`}
                >
                  <span className="eyebrow">
                    {KIND_LABEL[node.kind]}
                    {tombstoned ? ' — retracted/superseded' : ''}
                  </span>
                  <span className="font-semibold text-ink">{node.label}</span>
                  <span className="help-text" title="Navigation hint only — not evidence strength">
                    {node.navigation_degree} connection{node.navigation_degree === 1 ? '' : 's'} (nav
                    signal only)
                  </span>
                </button>
              );
            })}
            {visibleNodes.length === 0 && !loading && (
              <p className="help-text p-3">No nodes match this filter.</p>
            )}
          </div>
        </div>

        <div className="rounded border border-line bg-paper p-4">
          {!selectedNode ? (
            <p className="help-text">Select a claim, cluster, document, or concept to drill in.</p>
          ) : (
            <div className="flex flex-col gap-4">
              <div>
                <p className="eyebrow">{KIND_LABEL[selectedNode.kind]}</p>
                <h3 className="mt-1 font-semibold text-ink">{selectedNode.label}</h3>
                {selectedNode.kind === 'claim' && typeof selectedNode.data.supporting_quote === 'string' && (
                  <p className="mt-2 font-mono text-[13px] leading-relaxed">
                    “{selectedNode.data.supporting_quote}”
                  </p>
                )}
                {selectedNode.kind === 'cluster' && typeof selectedNode.data.cautious_summary === 'string' && (
                  <p className="mt-2 text-[14px] leading-6 text-ink">{selectedNode.data.cautious_summary}</p>
                )}
              </div>

              <div>
                <p className="eyebrow">
                  Connected edges ({connectedEdges.length})
                </p>
                <div className="mt-2 grid gap-3">
                  {connectedEdges.map((edge) => {
                    const otherId = edge.from === selectedId ? edge.to : edge.from;
                    const other = byId.get(otherId);
                    return (
                      <article key={edge.id} className="rounded border border-line bg-surface p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <span className="badge-pine">{edge.edge_type.replace(/_/g, ' ')}</span>
                          <span className="help-text">
                            {other ? `${KIND_LABEL[other.kind]}: ${other.label}` : otherId}
                          </span>
                        </div>

                        {edge.navigation_signals.semantic_similarity !== null && (
                          <p
                            className="help-text mt-2"
                            title="Navigation hint only — similarity is not corroboration or evidence strength"
                          >
                            Similarity {edge.navigation_signals.semantic_similarity.toFixed(2)} (nav
                            signal only, not evidence strength)
                          </p>
                        )}

                        {edge.edge_type === 'SAME_STUDY_FAMILY' ? (
                          <div className="mt-2 grid gap-1">
                            <p className="callout-info text-[13px]">
                              Automatically matched, not human-reviewed — Bowl detected this as the
                              same underlying study from bibliographic metadata, with no reviewer
                              in the loop.
                            </p>
                            {edge.automatic_match && (
                              <p className="help-text">
                                Matched on {edge.automatic_match.method.replace(/_/g, ' ')}
                                {edge.automatic_match.title_similarity !== null
                                  ? ` · title similarity ${edge.automatic_match.title_similarity.toFixed(2)}`
                                  : ''}
                                {edge.automatic_match.matched_authors.length > 0
                                  ? ` · shared authors: ${edge.automatic_match.matched_authors.join(', ')}`
                                  : ''}
                                {edge.automatic_match.publication_year_delta !== null
                                  ? ` · ${edge.automatic_match.publication_year_delta}yr apart`
                                  : ''}
                              </p>
                            )}
                          </div>
                        ) : (
                          <>
                            {edge.reviews.length > 0 && (
                              <ul className="mt-2 grid gap-1 text-[13px]">
                                {edge.reviews.map((review, index) => (
                                  <li key={`${edge.id}-review-${index}`} className="help-text">
                                    Reviewed ({review.source}): {review.reviewed_by ?? 'unknown reviewer'} at{' '}
                                    {review.reviewed_at ?? 'unknown time'}
                                  </li>
                                ))}
                              </ul>
                            )}

                            {edge.quote_unresolved ? (
                              <p className="callout-alarm mt-2 text-[13px]">
                                No literal quote currently resolves for this edge — its supporting
                                claim(s) are no longer eligible. This should be re-checked in review.
                              </p>
                            ) : (
                              <div className="mt-2 grid gap-2">
                                {edge.quotes.map((quote) => (
                                  <blockquote
                                    key={`${edge.id}-${quote.claim_id}`}
                                    className="border-l-4 border-pine bg-pine-tint/30 px-3 py-2 font-mono text-[13px] leading-relaxed"
                                  >
                                    “{quote.quote}”
                                  </blockquote>
                                ))}
                              </div>
                            )}
                          </>
                        )}
                      </article>
                    );
                  })}
                  {connectedEdges.length === 0 && (
                    <p className="help-text">This node has no displayed edges.</p>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </section>
  );
}
