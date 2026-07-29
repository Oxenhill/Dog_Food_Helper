'use client';

import { useCallback, useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';

interface ProcessingClaim {
  id: string;
  document_id: string;
  status: string;
  supporting_quote: string;
  subject_type: string;
  subject_value: string;
  direction: string;
  effect_summary: string;
  evidence_grade: string;
  grading_inputs_complete: boolean;
}

interface ProcessingDocument {
  id: string;
  title: string | null;
  source_url: string | null;
  pmid: string | null;
  topic: string;
  evidence_grade: string;
  grading_inputs_complete: boolean;
  access_type: string;
  review_status: string;
  retracted: boolean;
  superseded_by: string | null;
  retrieved_at: string;
  claims: ProcessingClaim[];
}

interface ClusterContext {
  id: string;
  context_type: string;
  context_key: string;
  context_value: string | null;
  required: boolean;
}

interface ClusterMember {
  claim_id: string;
  independently_reviewed: boolean;
  claim: ProcessingClaim | null;
}

interface EvidenceCluster {
  id: string;
  label: string;
  subject_type: string;
  subject_value: string;
  outcome_type: string;
  outcome_value: string;
  direction: string;
  cautious_summary: string;
  status: string;
  reviewed_at: string | null;
  review_note: string | null;
  members: ClusterMember[];
  applicability: ClusterContext[];
}

export default function ResearchKnowledgeAdmin() {
  const [documents, setDocuments] = useState<ProcessingDocument[]>([]);
  const [clusters, setClusters] = useState<EvidenceCluster[]>([]);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    const response = await fetch('/api/admin/research/processing', {
      headers: sessionAuthHeaders(),
    });
    const body = await response.json();
    if (!response.ok) {
      setError(body.error ?? 'Could not load structured knowledge');
      return;
    }
    setDocuments(body.documents ?? []);
    setClusters(body.clusters ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function processDocument(documentId: string) {
    setBusy(documentId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/research/processing', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'draft_document', document_id: documentId }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not draft structured evidence');
      setNotice(
        `Drafted ${body.result?.drafted ?? 0} source-backed claim(s) into ${body.result?.clusterIds?.length ?? 0} review cluster(s).`
      );
      await load();
    } catch (processError) {
      setError(
        processError instanceof Error
          ? processError.message
          : 'Could not draft structured evidence'
      );
    } finally {
      setBusy('');
    }
  }

  async function reviewCluster(clusterId: string, action: 'approve_cluster' | 'reject_cluster') {
    setBusy(clusterId);
    setError('');
    setNotice('');
    try {
      const response = await fetch('/api/admin/research/processing', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action,
          cluster_id: clusterId,
          review_note: notes[clusterId]?.trim() || null,
        }),
      });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Cluster review failed');
      setNotice(
        action === 'approve_cluster'
          ? 'The proposition and its literal source claims are now active.'
          : 'The proposition and its queued source claims were rejected.'
      );
      await load();
    } catch (reviewError) {
      setError(reviewError instanceof Error ? reviewError.message : 'Cluster review failed');
    } finally {
      setBusy('');
    }
  }

  const pendingDocuments = documents.filter(
    (document) =>
      !document.retracted &&
      !document.superseded_by &&
      document.claims.length === 0
  );
  const queuedClusters = clusters.filter(
    (cluster) => cluster.status === 'queued_for_review' || cluster.status === 'draft'
  );

  return (
    <section className="card card-pad flex flex-col gap-5">
      <div>
        <p className="eyebrow">Structured knowledge</p>
        <h2 className="section-title mt-1">Evidence organisation and review</h2>
        <p className="help-text mt-2">
          Processing turns source text into subject → outcome propositions with exact quotes and
          explicit dog-profile requirements. Similar propositions share a cluster. Review activates
          the cluster and its source claims together; it never marks them independently corroborated.
        </p>
      </div>

      {error && <div className="callout-alarm" role="alert">{error}</div>}
      {notice && <div className="callout-info" role="status">{notice}</div>}

      <details open={queuedClusters.length === 0 && pendingDocuments.length > 0}>
        <summary className="cursor-pointer font-semibold text-ink">
          Papers awaiting structured processing ({pendingDocuments.length})
        </summary>
        <div className="mt-3 grid gap-3">
          {pendingDocuments.slice(0, 30).map((document) => (
            <article key={document.id} className="rounded border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-ink">{document.title ?? 'Untitled source'}</p>
                  <p className="help-text mt-1">
                    Grade {document.evidence_grade} · {document.access_type.replace(/_/g, ' ')}
                    {document.grading_inputs_complete
                      ? ' · grading metadata complete'
                      : ' · grading metadata incomplete'}
                  </p>
                </div>
                <button
                  type="button"
                  className="btn-secondary btn-sm"
                  disabled={Boolean(busy)}
                  onClick={() => void processDocument(document.id)}
                >
                  {busy === document.id ? 'Organising evidence…' : 'Draft structured evidence'}
                </button>
              </div>
              {document.source_url && (
                <a
                  href={document.source_url}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-2 inline-block text-[13px] font-semibold text-pine hover:underline"
                >
                  Open source ↗
                </a>
              )}
            </article>
          ))}
          {pendingDocuments.length === 0 && (
            <p className="help-text">Every current paper has been processed or already has a claim.</p>
          )}
        </div>
      </details>

      <div className="hairline pt-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h3 className="font-semibold text-ink">
            Proposition clusters awaiting review
          </h3>
          <span className="badge-pine">{queuedClusters.length} queued</span>
        </div>
        <div className="mt-3 grid gap-4">
          {queuedClusters.map((cluster) => (
            <article key={cluster.id} className="rounded border border-line bg-paper p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="eyebrow">
                    {cluster.subject_type.replace(/_/g, ' ')} →{' '}
                    {cluster.outcome_type.replace(/_/g, ' ')}
                  </p>
                  <h4 className="mt-1 font-semibold text-ink">
                    {cluster.subject_value} → {cluster.outcome_value}
                  </h4>
                </div>
                <span className="badge-pine">{cluster.direction.replace(/_/g, ' ')}</span>
              </div>
              <p className="mt-3 text-[14px] leading-6 text-ink">{cluster.cautious_summary}</p>

              <div className="mt-3 rounded border border-line bg-surface p-3">
                <p className="eyebrow">Required dog context</p>
                {cluster.applicability.length === 0 ? (
                  <p className="help-text mt-1">
                    No dog-specific context was explicit in the source. Review whether this
                    proposition is genuinely useful before approval.
                  </p>
                ) : (
                  <ul className="mt-2 grid gap-1 text-[13px]">
                    {cluster.applicability.map((context) => (
                      <li key={context.id}>
                        {context.context_type.replace(/_/g, ' ')}: {context.context_key}
                        {context.context_value ? ` = ${context.context_value}` : ''}
                      </li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="mt-3 grid gap-3">
                {cluster.members.map((member) => (
                  <blockquote
                    key={member.claim_id}
                    className="rounded border-l-4 border-pine bg-pine-tint/30 px-4 py-3"
                  >
                    <p className="font-mono text-[13px] leading-relaxed">
                      “{member.claim?.supporting_quote ?? 'Source claim missing'}”
                    </p>
                    <p className="help-text mt-2">
                      Grade {member.claim?.evidence_grade ?? '—'} ·{' '}
                      {member.claim?.grading_inputs_complete
                        ? 'grading metadata complete'
                        : 'grading metadata incomplete'}
                    </p>
                  </blockquote>
                ))}
              </div>

              <label className="field mt-4">
                <span className="label">Review note</span>
                <textarea
                  className="textarea min-h-[72px]"
                  value={notes[cluster.id] ?? ''}
                  onChange={(event) =>
                    setNotes((current) => ({ ...current, [cluster.id]: event.target.value }))
                  }
                  placeholder="Required for rejection; optional for approval"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  className="btn-primary btn-sm"
                  disabled={Boolean(busy)}
                  onClick={() => void reviewCluster(cluster.id, 'approve_cluster')}
                >
                  Approve proposition and source claims
                </button>
                <button
                  type="button"
                  className="btn-danger btn-sm"
                  disabled={Boolean(busy) || !(notes[cluster.id]?.trim())}
                  onClick={() => void reviewCluster(cluster.id, 'reject_cluster')}
                >
                  Reject
                </button>
              </div>
            </article>
          ))}
          {queuedClusters.length === 0 && (
            <p className="help-text">No structured proposition clusters are awaiting review.</p>
          )}
        </div>
      </div>
    </section>
  );
}

