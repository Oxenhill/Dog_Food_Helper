'use client';

import { useCallback, useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';

/**
 * Review queue for manufacturer_target_domains (FOOD_DISCOVERY_DESIGN.md sec5).
 * Shows only approval_candidate rows and novel/low-confidence clauses that
 * terms_clause_patterns could not classify -- every refusal already
 * auto-applied before this screen ever loads (sec5.4, the asymmetry rule).
 * Terms finding and robots.txt directives are shown together, since a
 * permissive robots.txt with restrictive terms is still a no.
 */

interface DomainItem {
  id: string;
  domain: string;
  website_url: string | null;
  brand_name: string | null;
  locale_status: string;
  robots_txt_raw: string | null;
  robots_reviewed_at: string | null;
  terms_url: string | null;
  terms_excerpt: string | null;
  recon_status: string;
  recon_notes: string | null;
  classified_shape: string | null;
  classification_confidence: string | null;
  matched_pattern: { id: string; shape: string; rationale: string; version: number } | null;
}

export default function ManufacturerDomainsReviewAdmin() {
  const [items, setItems] = useState<DomainItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [runningBatch, setRunningBatch] = useState(false);
  const [lastBatchResult, setLastBatchResult] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = sessionAuthHeaders();
      const res = await fetch('/api/admin/manufacturer-domains', { headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to load review queue.');
      setItems(data.items ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load review queue.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const decide = async (id: string, action: 'approve' | 'refuse') => {
    setBusyId(id);
    setError(null);
    try {
      const headers = sessionAuthHeaders();
      const res = await fetch('/api/admin/manufacturer-domains', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ domain_id: id, action, note: notes[id]?.trim() || undefined }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Failed to record decision.');
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to record decision.');
    } finally {
      setBusyId(null);
    }
  };

  const runBatch = async () => {
    setRunningBatch(true);
    setError(null);
    setLastBatchResult(null);
    try {
      const headers = sessionAuthHeaders();
      const res = await fetch('/api/admin/manufacturer-domains/run-batch', { method: 'POST', headers });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error ?? 'Recon batch failed.');
      const processed = data.processed ?? 0;
      setLastBatchResult(
        processed === 0
          ? 'Recon ran — nothing left in the queue. Every manufacturer_targets company has been discovered and processed.'
          : `Recon ran on ${processed} domain(s). Reloading the review queue…`
      );
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Recon batch failed.');
    } finally {
      setRunningBatch(false);
    }
  };

  if (loading) return <p className="help-text">Loading review queue…</p>;

  return (
    <div className="flex flex-col gap-6">
      <div className="card flex flex-col gap-2 p-4">
        <p className="text-sm">
          Recon is manual-trigger, not a cron — it's finite (108 companies) and every batch can produce a
          row that needs a human, so it never runs unattended. This button runs the next 5{' '}
          <code>not_started</code> domains through robots.txt + terms fetch + classification. It has nothing
          left to do once every company has been discovered and processed — there is no &quot;off switch&quot;
          because there is no loop to turn off.
        </p>
        <button type="button" className="btn btn-primary self-start" disabled={runningBatch} onClick={runBatch}>
          {runningBatch ? 'Running…' : 'Run next batch (5 domains)'}
        </button>
        {lastBatchResult && <p className="help-text">{lastBatchResult}</p>}
      </div>

      {error && <p className="error-text">{error}</p>}
      {items.length === 0 && <p className="help-text">Nothing queued — every domain is either auto-classified or still mid-recon.</p>}

      {items.map((item) => (
        <div key={item.id} className="card flex flex-col gap-3 p-4">
          <div className="flex items-center justify-between">
            <h3 className="font-semibold">
              {item.domain}
              {item.brand_name && <span className="text-sm font-normal text-muted"> — {item.brand_name}</span>}
            </h3>
            <span className="badge">{item.recon_status}</span>
          </div>

          <p className="text-sm">
            <strong>Classification:</strong>{' '}
            {item.classified_shape
              ? `${item.classified_shape} (${item.classification_confidence}) — ${item.matched_pattern?.rationale ?? ''}`
              : 'no pattern match — novel clause, needs a policy decision or a new pattern'}
          </p>

          {item.locale_status === 'multi_region' && (
            <p className="text-sm error-text">
              Multi-region domain — no composition may be taken from it until a UK pack or UK retailer listing
              confirms the formulation (the ACANA precedent).
            </p>
          )}

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <div>
              <p className="text-xs font-semibold uppercase text-muted">Terms finding</p>
              <p className="text-sm">
                {item.terms_url ? (
                  <a href={item.terms_url} target="_blank" rel="noreferrer" className="underline">
                    {item.terms_url}
                  </a>
                ) : (
                  'no terms page found'
                )}
              </p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 text-xs">
                {item.terms_excerpt ?? '(none captured)'}
              </pre>
            </div>
            <div>
              <p className="text-xs font-semibold uppercase text-muted">robots.txt</p>
              <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap rounded bg-black/5 p-2 text-xs">
                {item.robots_txt_raw ?? '(not fetched / not found)'}
              </pre>
            </div>
          </div>

          <textarea
            className="input"
            placeholder="Review note (required to refuse; optional to approve)"
            value={notes[item.id] ?? ''}
            onChange={(e) => setNotes((prev) => ({ ...prev, [item.id]: e.target.value }))}
          />

          <div className="flex gap-2">
            <button
              type="button"
              className="btn btn-primary"
              disabled={busyId === item.id}
              onClick={() => decide(item.id, 'approve')}
            >
              Approve — write source_domain_allowlist(approved=true)
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              disabled={busyId === item.id}
              onClick={() => decide(item.id, 'refuse')}
            >
              Refuse
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
