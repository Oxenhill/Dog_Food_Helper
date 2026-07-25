'use client';

import { useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';
import { ResearchDocument, ResearchChunk, ReviewStatus } from '@/lib/types';

type DocumentWithCount = ResearchDocument & { chunk_count: number };

const STATUS_CLASS: Record<ReviewStatus, string> = {
  approved: 'signal-better',
  pending: 'badge-neutral',
  rejected: 'signal-worse',
};

const TOPIC_LABEL: Record<string, string> = {
  gut_biome: 'gut biome',
  allergy: 'allergy',
  health_condition: 'health condition',
  general: 'general',
};

/**
 * Admin research-corpus status view (Phase 4 management surface). Lists
 * research_documents with a topic/status badge and chunk_count, and lets an
 * admin expand a document to read its chunks or change its review_status.
 *
 * VIEW/STATUS ONLY: this component never calls embedding or LLM code, never
 * triggers ingest, and never bulk-seeds the corpus — it only reads
 * GET /api/admin/research(/[docId]) and writes PATCH /api/admin/research/[docId]
 * (a plain review_status column update, no model call). Ingest, when needed,
 * happens separately via POST /api/research/ingest.
 */
export default function ResearchAdmin() {
  const [documents, setDocuments] = useState<DocumentWithCount[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [chunks, setChunks] = useState<ResearchChunk[]>([]);
  const [chunksLoading, setChunksLoading] = useState(false);
  const [chunksError, setChunksError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<Record<string, string>>({});

  async function loadDocuments() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/research', { headers: sessionAuthHeaders() });
      if (!res.ok) {
        setError(`Could not load research documents (${res.status}).`);
        return;
      }
      const json = await res.json();
      setDocuments(json.documents ?? []);
    } catch {
      setError('Could not load research documents.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void loadDocuments();
  }, []);

  async function toggleExpand(doc: DocumentWithCount) {
    if (expandedId === doc.id) {
      setExpandedId(null);
      setChunks([]);
      return;
    }
    setExpandedId(doc.id);
    setChunks([]);
    setChunksError('');
    setChunksLoading(true);
    try {
      const res = await fetch(`/api/admin/research/${doc.id}`, {
        headers: sessionAuthHeaders(),
      });
      if (!res.ok) {
        setChunksError(`Could not load chunks (${res.status}).`);
        return;
      }
      const json = await res.json();
      setChunks(json.chunks ?? []);
    } catch {
      setChunksError('Could not load chunks.');
    } finally {
      setChunksLoading(false);
    }
  }

  async function setStatus(doc: DocumentWithCount, review_status: ReviewStatus) {
    setBusyId(doc.id);
    setActionError((prev) => ({ ...prev, [doc.id]: '' }));
    try {
      const res = await fetch(`/api/admin/research/${doc.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...sessionAuthHeaders() },
        body: JSON.stringify({ review_status }),
      });
      const json = await res.json();
      if (!res.ok) {
        setActionError((prev) => ({ ...prev, [doc.id]: json.error ?? `Error (${res.status})` }));
        return;
      }
      setDocuments((prev) =>
        prev.map((d) => (d.id === doc.id ? { ...d, review_status } : d)),
      );
    } catch {
      setActionError((prev) => ({ ...prev, [doc.id]: 'Request failed.' }));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div className="flex items-center justify-between gap-3">
        <p className="help-text">
          Read/approve view over the research corpus. Ingest happens separately at{' '}
          <span className="metric">POST /api/research/ingest</span> (admin-gated) — this page
          does not create or embed content.
        </p>
        <button
          type="button"
          onClick={() => void loadDocuments()}
          className="btn-secondary btn-sm shrink-0"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}

      {!loading && !error && documents.length === 0 && (
        <div className="callout-info">
          No research documents yet — the corpus is built deliberately over time.
        </div>
      )}

      {documents.map((doc) => {
        const expanded = expandedId === doc.id;
        return (
          <div key={doc.id} className="card card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex flex-col gap-1.5">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="badge-pine">{TOPIC_LABEL[doc.topic] ?? doc.topic}</span>
                  <span className={STATUS_CLASS[doc.review_status]}>{doc.review_status}</span>
                  <span className="metric text-[12px] text-ink-soft">
                    {doc.chunk_count} chunk{doc.chunk_count === 1 ? '' : 's'}
                  </span>
                </div>
                <button
                  type="button"
                  onClick={() => void toggleExpand(doc)}
                  className="text-left text-[15px] font-semibold text-ink hover:text-pine"
                >
                  {doc.title ?? '(untitled document)'}
                </button>
                {doc.source_url && (
                  <a
                    href={doc.source_url}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[13px] text-pine hover:underline"
                  >
                    {doc.source_url}
                  </a>
                )}
                <span className="help-text">
                  retrieved <span className="metric">{new Date(doc.retrieved_at).toLocaleDateString()}</span>
                  {doc.superseded_by && (
                    <>
                      {' '}
                      · superseded by <span className="metric">{doc.superseded_by}</span>
                    </>
                  )}
                </span>
              </div>

              <div className="flex shrink-0 gap-2">
                <button
                  type="button"
                  onClick={() => void setStatus(doc, 'approved')}
                  disabled={busyId === doc.id || doc.review_status === 'approved'}
                  className="btn-primary btn-sm"
                >
                  Approve
                </button>
                <button
                  type="button"
                  onClick={() => void setStatus(doc, 'rejected')}
                  disabled={busyId === doc.id || doc.review_status === 'rejected'}
                  className="btn-danger btn-sm"
                >
                  Reject
                </button>
              </div>
            </div>

            {actionError[doc.id] && <p className="error-text mt-2">{actionError[doc.id]}</p>}

            <button
              type="button"
              onClick={() => void toggleExpand(doc)}
              className="eyebrow mt-3 block text-pine"
            >
              {expanded ? 'Hide chunks ↑' : 'Show chunks →'}
            </button>

            {expanded && (
              <div className="hairline mt-3 flex flex-col gap-3 pt-3">
                {chunksLoading && <p className="muted text-[14px]">Loading chunks…</p>}
                {chunksError && (
                  <div className="callout-alarm" role="alert">
                    {chunksError}
                  </div>
                )}
                {!chunksLoading && !chunksError && chunks.length === 0 && (
                  <p className="muted text-[14px]">No chunks for this document.</p>
                )}
                {chunks.map((chunk) => (
                  <div key={chunk.id} className="rounded border border-line bg-paper p-3">
                    <span className="metric text-[11px] text-ink-soft">
                      chunk {chunk.chunk_index}
                    </span>
                    <p className="mt-1 whitespace-pre-wrap text-[14px] text-ink">{chunk.content}</p>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
