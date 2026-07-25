'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { authHeaders, getUserId } from '@/lib/clientAuth';
import { DogHealthCondition, DogRestriction, EvidenceSource, RestrictionType } from '@/lib/types';

const RESTRICTION_TYPES: { value: RestrictionType; label: string }[] = [
  { value: 'allergy', label: 'Allergy' },
  { value: 'intolerance', label: 'Intolerance' },
  { value: 'preference', label: 'Preference' },
];

const EVIDENCE_SOURCES: { value: EvidenceSource; label: string }[] = [
  { value: 'owner_reported', label: 'Owner reported' },
  { value: 'lab_test', label: 'Lab test' },
  { value: 'vet_diagnosed', label: 'Vet diagnosed' },
];

function formatSource(source: string): string {
  return source.replace(/_/g, ' ');
}

/**
 * The interactive allergies/intolerances + health-conditions manager for a
 * single dog. Feeds dog_restrictions and dog_health_conditions directly —
 * both read by the deterministic hard-filter safety layer (architecture doc
 * §2) before any scoring or RAG ranking runs, so this is the primary data
 * entry point for that layer.
 */
export default function RestrictionsManager({ dogId }: { dogId: string }) {
  const router = useRouter();
  const [restrictions, setRestrictions] = useState<DogRestriction[]>([]);
  const [conditions, setConditions] = useState<DogHealthCondition[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // Add-restriction form state
  const [substance, setSubstance] = useState('');
  const [restrictionType, setRestrictionType] = useState<RestrictionType>('allergy');
  const [restrictionSource, setRestrictionSource] = useState<EvidenceSource>('owner_reported');
  const [restrictionSubmitting, setRestrictionSubmitting] = useState(false);
  const [restrictionError, setRestrictionError] = useState('');

  // Add-condition form state
  const [condition, setCondition] = useState('');
  const [conditionSource, setConditionSource] = useState<EvidenceSource>('owner_reported');
  const [notes, setNotes] = useState('');
  const [conditionSubmitting, setConditionSubmitting] = useState(false);
  const [conditionError, setConditionError] = useState('');

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [rRes, cRes] = await Promise.all([
        fetch(`/api/restrictions?dog_id=${dogId}`, { headers: authHeaders() }),
        fetch(`/api/health-conditions?dog_id=${dogId}`, { headers: authHeaders() }),
      ]);
      const rJson = await rRes.json();
      const cJson = await cRes.json();
      if (!rRes.ok) {
        throw new Error(rJson.error ?? `Failed to load allergies (${rRes.status})`);
      }
      if (!cRes.ok) {
        throw new Error(cJson.error ?? `Failed to load health conditions (${cRes.status})`);
      }
      setRestrictions(rJson.restrictions ?? []);
      setConditions(cJson.conditions ?? []);
    } catch (err) {
      setLoadError(
        err instanceof Error ? err.message : 'Something went wrong loading this dog’s record.'
      );
    } finally {
      setLoading(false);
    }
  }, [dogId]);

  useEffect(() => {
    if (!getUserId()) {
      router.replace('/signin');
      return;
    }
    void loadAll();
  }, [router, loadAll]);

  async function handleAddRestriction(e: React.FormEvent) {
    e.preventDefault();
    setRestrictionError('');
    setRestrictionSubmitting(true);
    try {
      const res = await fetch('/api/restrictions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          dog_id: dogId,
          restriction_type: restrictionType,
          substance,
          source: restrictionSource,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRestrictionError(json.error ?? `Failed to add (${res.status})`);
        return;
      }
      setSubstance('');
      setRestrictionType('allergy');
      setRestrictionSource('owner_reported');
      await loadAll();
    } catch {
      setRestrictionError('Something went wrong. Please try again.');
    } finally {
      setRestrictionSubmitting(false);
    }
  }

  async function handleRemoveRestriction(id: string, label: string) {
    if (!window.confirm(`Remove "${label}" from allergies & intolerances?`)) return;
    try {
      const res = await fetch(`/api/restrictions?id=${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setLoadError(json.error ?? `Failed to remove (${res.status})`);
        return;
      }
      await loadAll();
    } catch {
      setLoadError('Something went wrong removing that entry. Please try again.');
    }
  }

  async function handleAddCondition(e: React.FormEvent) {
    e.preventDefault();
    setConditionError('');
    setConditionSubmitting(true);
    try {
      const res = await fetch('/api/health-conditions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({
          dog_id: dogId,
          condition,
          source: conditionSource,
          notes: notes || undefined,
        }),
      });
      const json = await res.json();
      if (!res.ok) {
        setConditionError(json.error ?? `Failed to add (${res.status})`);
        return;
      }
      setCondition('');
      setConditionSource('owner_reported');
      setNotes('');
      await loadAll();
    } catch {
      setConditionError('Something went wrong. Please try again.');
    } finally {
      setConditionSubmitting(false);
    }
  }

  async function handleRemoveCondition(id: string, label: string) {
    if (!window.confirm(`Remove "${label}" from health conditions?`)) return;
    try {
      const res = await fetch(`/api/health-conditions?id=${id}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setLoadError(json.error ?? `Failed to remove (${res.status})`);
        return;
      }
      await loadAll();
    } catch {
      setLoadError('Something went wrong removing that entry. Please try again.');
    }
  }

  if (loading) {
    return <p className="muted mt-6">Loading…</p>;
  }

  return (
    <div className="mt-6 flex flex-col gap-6">
      {loadError && (
        <div className="callout-alarm" role="alert">
          {loadError}
        </div>
      )}

      {/* Allergies & intolerances */}
      <section className="card card-pad">
        <h2 className="section-title">Allergies &amp; intolerances</h2>

        {restrictions.length === 0 ? (
          <p className="muted mt-3 text-[14px]">No allergies or intolerances recorded yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {restrictions.map((r) => (
              <li key={r.id} className="flex items-center justify-between gap-3 py-3">
                <div>
                  <p className="text-[14px] font-medium text-ink">{r.substance}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="badge-neutral">{r.restriction_type}</span>
                    <span className="badge-neutral">{formatSource(r.source)}</span>
                    <span className="metric text-[11px] text-ink-soft">
                      {new Date(r.created_at).toLocaleDateString()}
                    </span>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemoveRestriction(r.id, r.substance)}
                  className="btn-ghost btn-sm shrink-0"
                  aria-label={`Remove ${r.substance}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={handleAddRestriction}
          className="mt-5 flex flex-col gap-3 border-t border-line pt-5"
        >
          {restrictionError && <p className="error-text">{restrictionError}</p>}
          <div className="field">
            <label className="label" htmlFor="substance">
              Substance
            </label>
            <input
              id="substance"
              type="text"
              required
              value={substance}
              onChange={(e) => setSubstance(e.target.value)}
              className="input"
              placeholder="e.g. Chicken"
            />
          </div>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="field">
              <label className="label" htmlFor="restriction_type">
                Type
              </label>
              <select
                id="restriction_type"
                value={restrictionType}
                onChange={(e) => setRestrictionType(e.target.value as RestrictionType)}
                className="select"
              >
                {RESTRICTION_TYPES.map((t) => (
                  <option key={t.value} value={t.value}>
                    {t.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="field">
              <label className="label" htmlFor="restriction_source">
                Source
              </label>
              <select
                id="restriction_source"
                value={restrictionSource}
                onChange={(e) => setRestrictionSource(e.target.value as EvidenceSource)}
                className="select"
              >
                {EVIDENCE_SOURCES.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <button type="submit" disabled={restrictionSubmitting} className="btn-secondary mt-1">
            {restrictionSubmitting ? 'Adding…' : 'Add allergy / intolerance'}
          </button>
        </form>
      </section>

      {/* Health conditions */}
      <section className="card card-pad">
        <h2 className="section-title">Health conditions</h2>

        {conditions.length === 0 ? (
          <p className="muted mt-3 text-[14px]">No health conditions recorded yet.</p>
        ) : (
          <ul className="mt-4 flex flex-col divide-y divide-line">
            {conditions.map((c) => (
              <li key={c.id} className="flex items-start justify-between gap-3 py-3">
                <div>
                  <p className="text-[14px] font-medium text-ink">{c.condition}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-2">
                    <span className="badge-neutral">{formatSource(c.source)}</span>
                  </div>
                  {c.notes && <p className="help-text mt-1.5 max-w-prose">{c.notes}</p>}
                </div>
                <button
                  type="button"
                  onClick={() => void handleRemoveCondition(c.id, c.condition)}
                  className="btn-ghost btn-sm shrink-0"
                  aria-label={`Remove ${c.condition}`}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
        )}

        <form
          onSubmit={handleAddCondition}
          className="mt-5 flex flex-col gap-3 border-t border-line pt-5"
        >
          {conditionError && <p className="error-text">{conditionError}</p>}
          <div className="field">
            <label className="label" htmlFor="condition">
              Condition
            </label>
            <input
              id="condition"
              type="text"
              required
              value={condition}
              onChange={(e) => setCondition(e.target.value)}
              className="input"
              placeholder="e.g. Pancreatitis"
            />
          </div>
          <div className="field">
            <label className="label" htmlFor="condition_source">
              Source
            </label>
            <select
              id="condition_source"
              value={conditionSource}
              onChange={(e) => setConditionSource(e.target.value as EvidenceSource)}
              className="select"
            >
              {EVIDENCE_SOURCES.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
          <div className="field">
            <label className="label" htmlFor="notes">
              Notes (optional)
            </label>
            <textarea
              id="notes"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="textarea"
              placeholder="Anything else worth recording"
            />
          </div>
          <button type="submit" disabled={conditionSubmitting} className="btn-secondary mt-1">
            {conditionSubmitting ? 'Adding…' : 'Add health condition'}
          </button>
        </form>
      </section>
    </div>
  );
}
