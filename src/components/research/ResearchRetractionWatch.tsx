'use client';

import { useCallback, useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';

interface AffectedRow {
  id: string;
  label: string;
  status: string;
}

interface LifecycleEventRow {
  id: number;
  document_id: string;
  document_title: string | null;
  event_type: 'retracted' | 'superseded';
  reason: string;
  actor_type: 'system' | 'owner' | 'worker';
  actor_id: string | null;
  replacement_document_id: string | null;
  replacement_document_title: string | null;
  promoted_primary_document_id: string | null;
  promoted_primary_document_title: string | null;
  orphaned_duplicate_document_ids: string[];
  affected_claims: AffectedRow[];
  affected_clusters: AffectedRow[];
  occurred_at: string;
}

export default function ResearchRetractionWatch() {
  const [events, setEvents] = useState<LifecycleEventRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await fetch('/api/admin/research/lifecycle-events', { headers: sessionAuthHeaders() });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error ?? 'Could not load retraction/supersession history');
      setEvents(Array.isArray(body.events) ? body.events : []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : 'Could not load retraction/supersession history');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="eyebrow">The fast check: has anything changed underneath you</p>
        <h2 className="section-title mt-1">Retraction watch</h2>
        <p className="help-text mt-2 max-w-3xl">
          Every retraction or supersession, with exactly what it changed downstream — which claims
          transitioned, which clusters survived on remaining independent support, and whether a
          study-family primary was reassigned. Sourced directly from the append-only audit log; the
          sole way to retract or supersede a document is the lifecycle action on its record.
        </p>
      </div>

      {error && <div className="callout-alarm" role="alert">{error}</div>}
      {loading && !events.length && <p className="help-text">Loading history…</p>}
      {!loading && !error && events.length === 0 && (
        <div className="rounded border border-line bg-paper p-4">
          <p className="font-semibold">No retractions or supersessions yet</p>
          <p className="help-text mt-1">This is the expected baseline until a source needs correcting.</p>
        </div>
      )}

      <div className="flex flex-col gap-4">
        {events.map((event) => (
          <article key={event.id} className="card card-pad">
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <p className="eyebrow">
                  {event.event_type === 'retracted' ? 'Retracted' : 'Superseded'} ·{' '}
                  {new Date(event.occurred_at).toLocaleDateString()} · {event.actor_type} action
                </p>
                <h3 className="mt-1 font-semibold text-ink">{event.document_title ?? event.document_id}</h3>
              </div>
              <span className={event.event_type === 'retracted' ? 'signal-worse' : 'badge-neutral'}>
                {event.event_type}
              </span>
            </div>

            <p className="mt-3 text-[14px]">{event.reason}</p>

            {event.replacement_document_title && (
              <p className="help-text mt-2">
                Replaced by: <span className="font-semibold text-ink">{event.replacement_document_title}</span>
              </p>
            )}

            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              <div className="rounded border border-line bg-paper p-3">
                <p className="eyebrow">Affected claims ({event.affected_claims.length})</p>
                {event.affected_claims.length === 0 ? (
                  <p className="help-text mt-1">None.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                    {event.affected_claims.map((claim) => (
                      <li key={claim.id}>
                        {claim.label} <span className="text-ink-soft">— {claim.status}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              <div className="rounded border border-line bg-paper p-3">
                <p className="eyebrow">Affected clusters ({event.affected_clusters.length})</p>
                {event.affected_clusters.length === 0 ? (
                  <p className="help-text mt-1">None.</p>
                ) : (
                  <ul className="mt-2 flex flex-col gap-1 text-[13px]">
                    {event.affected_clusters.map((cluster) => (
                      <li key={cluster.id}>
                        {cluster.label}{' '}
                        <span className={cluster.status === 'active' ? 'text-pine' : 'text-ink-soft'}>
                          — {cluster.status === 'active' ? 'still active, independently supported' : cluster.status}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>

            {event.promoted_primary_document_title && (
              <p className="help-text mt-3">
                Study-family primary auto-promoted to:{' '}
                <span className="font-semibold text-ink">{event.promoted_primary_document_title}</span>
              </p>
            )}
            {event.orphaned_duplicate_document_ids.length > 0 && (
              <p className="error-text mt-3">
                {event.orphaned_duplicate_document_ids.length} duplicate(s) left orphaned — every remaining
                copy of this study family is also retracted.
              </p>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
