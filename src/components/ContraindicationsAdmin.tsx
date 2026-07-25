'use client';

import { useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';
import {
  CONTRA_NUTRIENTS,
  CONTRA_COMPARATORS,
  nutrientLabel,
  type ConditionContraindication,
} from '@/lib/contraindications';

/**
 * Admin editor for condition_contraindications — the clinical mappings the
 * deterministic hard filter uses to exclude foods for a dog's health
 * conditions.
 *
 * Deliberately data-entry only: this UI NEVER suggests, autocompletes or
 * generates a clinical mapping. Every rule is typed in by the owner/vet and
 * must be explicitly approved before it affects a single recommendation.
 */
type RuleKind = 'ingredient' | 'nutrient';

const EMPTY_FORM = {
  condition: '',
  kind: 'ingredient' as RuleKind,
  contraindicated_ingredient: '',
  nutrient: CONTRA_NUTRIENTS[0].column as string,
  comparator: '>' as string,
  threshold: '',
  rationale: '',
  source: '',
};

export default function ContraindicationsAdmin() {
  const [rows, setRows] = useState<ConditionContraindication[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);

  async function load() {
    try {
      const res = await fetch('/api/admin/contraindications', { headers: sessionAuthHeaders() });
      if (!res.ok) {
        setError('Could not load contraindication rules.');
        return;
      }
      const json = await res.json();
      setRows(json.rows ?? []);
      setError('');
    } catch {
      setError('Could not load contraindication rules.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    load();
  }, []);

  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError('');
    try {
      const body =
        form.kind === 'ingredient'
          ? {
              condition: form.condition,
              contraindicated_ingredient: form.contraindicated_ingredient,
              rationale: form.rationale,
              source: form.source,
            }
          : {
              condition: form.condition,
              nutrient: form.nutrient,
              comparator: form.comparator,
              threshold: form.threshold,
              rationale: form.rationale,
              source: form.source,
            };
      const res = await fetch('/api/admin/contraindications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...sessionAuthHeaders() },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? 'Could not save the rule.');
        return;
      }
      setForm(EMPTY_FORM);
      await load();
    } catch {
      setError('Could not save the rule.');
    } finally {
      setSaving(false);
    }
  }

  async function setApproved(row: ConditionContraindication, approved: boolean) {
    if (approved) {
      const ok = window.confirm(
        `Approve this rule?\n\nOnce approved it will immediately start excluding foods for every dog with the condition "${row.condition}". Only approve clinically verified mappings.`,
      );
      if (!ok) return;
    }
    try {
      const res = await fetch(`/api/admin/contraindications/${row.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...sessionAuthHeaders() },
        body: JSON.stringify({ approved }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? 'Could not update approval.');
        return;
      }
      await load();
    } catch {
      setError('Could not update approval.');
    }
  }

  async function remove(row: ConditionContraindication) {
    if (!window.confirm(`Delete this rule for "${row.condition}"? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/admin/contraindications/${row.id}`, {
        method: 'DELETE',
        headers: sessionAuthHeaders(),
      });
      if (!res.ok) {
        setError('Could not delete the rule.');
        return;
      }
      await load();
    } catch {
      setError('Could not delete the rule.');
    }
  }

  function describe(row: ConditionContraindication) {
    if (row.contraindicated_ingredient) {
      return `Exclude foods containing “${row.contraindicated_ingredient}”`;
    }
    if (row.nutrient && row.comparator && row.threshold != null) {
      return `Exclude foods where ${nutrientLabel(row.nutrient)} ${row.comparator} ${row.threshold}%`;
    }
    return 'Incomplete rule';
  }

  const approvedCount = rows.filter((r) => r.approved).length;

  return (
    <div>
      <div className="callout-disclaimer mb-6">
        <strong>Clinical data entry only.</strong> This tool never suggests or generates
        contraindications. Every rule must be entered and approved by a qualified person.
        Only <em>approved</em> rules affect recommendations — draft rules do nothing.
      </div>

      {error && (
        <div className="callout-alarm mb-6" role="alert">
          {error}
        </div>
      )}

      <div className="card card-pad">
        <h2 className="section-title">Add a rule</h2>
        <p className="help-text mt-1">
          A rule is either an <strong>ingredient</strong> exclusion or a{' '}
          <strong>nutrient threshold</strong> — not both. New rules start unapproved.
        </p>

        <form onSubmit={handleCreate} className="mt-4 flex flex-col gap-4">
          <div className="field">
            <label className="label" htmlFor="condition">
              Health condition
            </label>
            <input
              id="condition"
              className="input"
              required
              value={form.condition}
              onChange={(e) => setForm({ ...form, condition: e.target.value })}
              placeholder="e.g. chronic kidney disease"
            />
            <p className="help-text">
              Must match how the condition is recorded on a dog&rsquo;s profile (matching is
              case-insensitive).
            </p>
          </div>

          <div className="field">
            <label className="label" htmlFor="kind">
              Rule type
            </label>
            <select
              id="kind"
              className="select"
              value={form.kind}
              onChange={(e) => setForm({ ...form, kind: e.target.value as RuleKind })}
            >
              <option value="ingredient">Ingredient exclusion</option>
              <option value="nutrient">Nutrient threshold</option>
            </select>
          </div>

          {form.kind === 'ingredient' ? (
            <div className="field">
              <label className="label" htmlFor="ingredient">
                Contraindicated ingredient
              </label>
              <input
                id="ingredient"
                className="input"
                required
                value={form.contraindicated_ingredient}
                onChange={(e) =>
                  setForm({ ...form, contraindicated_ingredient: e.target.value })
                }
                placeholder="e.g. chicken"
              />
              <p className="help-text">Matches any ingredient name containing this text.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div className="field">
                <label className="label" htmlFor="nutrient">
                  Nutrient
                </label>
                <select
                  id="nutrient"
                  className="select"
                  value={form.nutrient}
                  onChange={(e) => setForm({ ...form, nutrient: e.target.value })}
                >
                  {CONTRA_NUTRIENTS.map((n) => (
                    <option key={n.column} value={n.column}>
                      {n.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="comparator">
                  Comparator
                </label>
                <select
                  id="comparator"
                  className="select"
                  value={form.comparator}
                  onChange={(e) => setForm({ ...form, comparator: e.target.value })}
                >
                  {CONTRA_COMPARATORS.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label className="label" htmlFor="threshold">
                  Threshold (%)
                </label>
                <input
                  id="threshold"
                  className="input"
                  type="number"
                  step="0.1"
                  required
                  value={form.threshold}
                  onChange={(e) => setForm({ ...form, threshold: e.target.value })}
                />
              </div>
              <p className="help-text sm:col-span-3">
                Foods with no recorded value for this nutrient are never excluded — an unknown
                value is not treated as a breach.
              </p>
            </div>
          )}

          <div className="field">
            <label className="label" htmlFor="rationale">
              Clinical rationale <span className="muted font-normal">(optional)</span>
            </label>
            <textarea
              id="rationale"
              className="textarea"
              value={form.rationale}
              onChange={(e) => setForm({ ...form, rationale: e.target.value })}
            />
          </div>

          <div className="field">
            <label className="label" htmlFor="source">
              Source <span className="muted font-normal">(optional)</span>
            </label>
            <input
              id="source"
              className="input"
              value={form.source}
              onChange={(e) => setForm({ ...form, source: e.target.value })}
              placeholder="Reference, guideline or vet name"
            />
          </div>

          <button type="submit" disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Add rule (unapproved)'}
          </button>
        </form>
      </div>

      <div className="mt-8 flex items-baseline justify-between">
        <h2 className="section-title">Rules</h2>
        <span className="help-text">
          <span className="metric">{approvedCount}</span> approved /{' '}
          <span className="metric">{rows.length}</span> total
        </span>
      </div>

      {loading && <p className="muted mt-4">Loading…</p>}

      {!loading && rows.length === 0 && (
        <div className="card card-pad mt-4">
          <p className="lead">No contraindication rules yet.</p>
          <p className="help-text mt-2">
            Until a rule is added and approved, health conditions do not exclude any food. The
            mechanism is active and waiting on clinical input.
          </p>
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="mt-4 flex flex-col gap-3">
          {rows.map((row) => (
            <div key={row.id} className="card card-pad">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="section-title">{row.condition}</span>
                    {row.approved ? (
                      <span className="signal-better">approved</span>
                    ) : (
                      <span className="badge-neutral">draft</span>
                    )}
                  </div>
                  <p className="mt-1 text-[14px] text-ink">{describe(row)}</p>
                  {row.rationale && <p className="help-text mt-2">{row.rationale}</p>}
                  {row.source && (
                    <p className="help-text mt-1">
                      Source: <span className="metric">{row.source}</span>
                    </p>
                  )}
                </div>
                <div className="flex shrink-0 gap-2">
                  {row.approved ? (
                    <button
                      type="button"
                      className="btn-secondary btn-sm"
                      onClick={() => setApproved(row, false)}
                    >
                      Unapprove
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="btn-primary btn-sm"
                      onClick={() => setApproved(row, true)}
                    >
                      Approve
                    </button>
                  )}
                  <button
                    type="button"
                    className="btn-ghost btn-sm"
                    onClick={() => remove(row)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
