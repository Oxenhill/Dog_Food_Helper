'use client';

import { useCallback, useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';
import { categoryLabel } from '@/lib/ingredientCategories';

/**
 * Review queue for third-party food contributions.
 *
 * The screen is built around one job: deciding whether a submitted ingredient
 * list was actually read off the product page. So the parsed list and the
 * verbatim `source_excerpt` sit side by side, and any ingredient name that does
 * not appear in the excerpt is marked. That makes the common case a glance
 * rather than a tab-switch to the manufacturer's site — the link is there for
 * when the excerpt itself looks wrong.
 *
 * Access is the standard AdminShell + server-side requireAdmin pair; this
 * component assumes the shell has already confirmed the session.
 */

interface Ingredient {
  name: string;
  category: string | null;
  inclusion_pct: number | null;
  note: string | null;
  sub: Ingredient[];
}

interface Contribution {
  id: string;
  brand: string;
  name: string;
  source_url: string;
  contributor_label: string | null;
  created_at: string;
  status: string;
  review_note: string | null;
  resulting_food_id: string | null;
  possible_duplicate: { id: string; brand: string; name: string } | null;
  payload: {
    brand: string;
    name: string;
    food_type: string;
    is_treat: boolean;
    source_excerpt: string;
    ingredients: Ingredient[];
    suitable_age_min_months: number | null;
    suitable_age_max_months: number | null;
    suitable_size_min: string | null;
    suitable_size_max: string | null;
    price_per_kg: number | null;
    calories_per_kg: number | null;
    nutrients: Record<string, number | null>;
    unsupported_ingredient_names: string[];
  };
}

const NUTRIENT_LABELS: Record<string, string> = {
  protein_pct: 'Protein',
  fat_pct: 'Fat',
  fibre_pct: 'Fibre',
  ash_pct: 'Ash',
  moisture_pct: 'Moisture',
  calcium_pct: 'Calcium',
  phosphorus_pct: 'Phosphorus',
  sodium_pct: 'Sodium',
};

export default function ContributedFoodsAdmin() {
  const [status, setStatus] = useState<'pending' | 'approved' | 'rejected'>('pending');
  const [items, setItems] = useState<Contribution[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [flash, setFlash] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/contributions?status=${status}`, {
        headers: sessionAuthHeaders(),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Could not load the queue (${res.status}).`);
        return;
      }
      setItems(json.items ?? []);
    } catch {
      setError('Could not load the queue.');
    } finally {
      setLoading(false);
    }
  }, [status]);

  useEffect(() => {
    void load();
  }, [load]);

  async function act(id: string, action: 'approve' | 'reject') {
    setBusyId(id);
    setError('');
    setFlash('');
    try {
      const res = await fetch('/api/admin/contributions', {
        method: 'POST',
        headers: { ...sessionAuthHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, note: notes[id] ?? undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `That didn't work (${res.status}).`);
        return;
      }
      setFlash(
        action === 'approve'
          ? `Added to the catalogue with ${json.ingredients_written} ingredients.${json.warning ? ` ${json.warning}` : ''}`
          : 'Rejected.'
      );
      await load();
    } catch {
      setError('Something went wrong.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="flex flex-wrap gap-1">
        {(['pending', 'approved', 'rejected'] as const).map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => setStatus(s)}
            className={`${status === s ? 'btn-secondary' : 'btn-ghost'} btn-sm capitalize`}
          >
            {s}
          </button>
        ))}
      </div>

      {flash && (
        <div className="callout-info" role="status">
          {flash}
        </div>
      )}
      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}

      {loading && <p className="muted">Loading…</p>}
      {!loading && items.length === 0 && (
        <p className="muted">Nothing {status}.</p>
      )}

      {items.map((item) => {
        const p = item.payload;
        const unsupported = new Set(p?.unsupported_ingredient_names ?? []);
        return (
          <article key={item.id} className="card card-pad flex flex-col gap-4">
            <header className="flex flex-col gap-1">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="section-title">
                  {item.brand} — {item.name}
                </h2>
                {p?.is_treat && <span className="badge-neutral">Treat</span>}
                {p?.food_type && <span className="badge-pine">{p.food_type}</span>}
              </div>
              <p className="help-text">
                {item.contributor_label ? `From ${item.contributor_label} · ` : ''}
                {new Date(item.created_at).toLocaleString('en-GB')}
              </p>
              <a
                href={item.source_url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="text-[13px] font-semibold text-pine underline-offset-2 hover:underline"
              >
                Open the product page ↗
              </a>
            </header>

            {item.possible_duplicate && (
              <div className="callout-alarm">
                Already in the catalogue as{' '}
                <strong>
                  {item.possible_duplicate.brand} — {item.possible_duplicate.name}
                </strong>
                . Approving would create a second row for one product and split its history. Reject
                this instead.
              </div>
            )}

            {unsupported.size > 0 && (
              <div className="callout-alarm">
                {unsupported.size} ingredient{unsupported.size === 1 ? '' : 's'} not found in the
                pasted label text: <strong>{[...unsupported].join(', ')}</strong>. Check these
                against the page before approving.
              </div>
            )}

            <div className="grid gap-4 sm:grid-cols-2">
              <section>
                <p className="label">Submitted list</p>
                <ol className="mt-2 flex flex-col gap-1">
                  {(p?.ingredients ?? []).map((ing, i) => (
                    <li key={`${ing.name}-${i}`} className="text-[13.5px] leading-snug text-ink">
                      <span className="tabular muted mr-1.5">{i + 1}.</span>
                      <span
                        className={
                          unsupported.has(ing.name) ? 'font-semibold text-alarm' : 'font-medium'
                        }
                      >
                        {ing.name}
                      </span>
                      {ing.inclusion_pct != null && (
                        <span className="muted"> · {ing.inclusion_pct}%</span>
                      )}
                      {ing.note && <span className="muted"> · {ing.note}</span>}
                      {ing.category && (
                        <span className="muted"> · {categoryLabel(ing.category)}</span>
                      )}
                      {ing.sub?.length > 0 && (
                        <ul className="ml-5 mt-1 flex flex-col gap-0.5">
                          {ing.sub.map((child, ci) => (
                            <li key={`${child.name}-${ci}`} className="text-[13px] text-ink-soft">
                              ↳ {child.name}
                              {child.inclusion_pct != null && ` · ${child.inclusion_pct}%`}
                            </li>
                          ))}
                        </ul>
                      )}
                    </li>
                  ))}
                </ol>
              </section>

              <section>
                <p className="label">Label text as pasted</p>
                <p className="mt-2 whitespace-pre-wrap rounded border border-line bg-paper p-3 font-mono text-[12px] leading-relaxed text-ink-soft">
                  {p?.source_excerpt}
                </p>
              </section>
            </div>

            <section>
              <p className="label">Analysis and other fields</p>
              <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[13px] text-ink-soft">
                {Object.entries(NUTRIENT_LABELS).map(([key, label]) => {
                  const value = p?.nutrients?.[key];
                  if (value == null) return null;
                  return (
                    <li key={key}>
                      {label} <span className="tabular font-semibold text-ink">{value}%</span>
                    </li>
                  );
                })}
                {p?.calories_per_kg != null && (
                  <li>
                    kcal/kg <span className="tabular font-semibold text-ink">{p.calories_per_kg}</span>
                  </li>
                )}
                {p?.price_per_kg != null && (
                  <li>
                    £/kg <span className="tabular font-semibold text-ink">{p.price_per_kg}</span>
                  </li>
                )}
                {p?.suitable_age_min_months != null && (
                  <li>
                    From <span className="tabular font-semibold text-ink">{p.suitable_age_min_months}mo</span>
                  </li>
                )}
                {(p?.suitable_size_min || p?.suitable_size_max) && (
                  <li>
                    Size{' '}
                    <span className="font-semibold text-ink">
                      {p.suitable_size_min ?? '—'}–{p.suitable_size_max ?? '—'}
                    </span>
                  </li>
                )}
              </ul>
            </section>

            {item.status === 'pending' ? (
              <div className="flex flex-col gap-2">
                <input
                  type="text"
                  value={notes[item.id] ?? ''}
                  onChange={(e) => setNotes((n) => ({ ...n, [item.id]: e.target.value }))}
                  className="input"
                  placeholder="Note (optional) — why rejected, or what you corrected"
                />
                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => act(item.id, 'approve')}
                    className="btn-primary btn-sm"
                  >
                    {busyId === item.id ? 'Working…' : 'Approve & add'}
                  </button>
                  <button
                    type="button"
                    disabled={busyId === item.id}
                    onClick={() => act(item.id, 'reject')}
                    className="btn-danger btn-sm"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ) : (
              <p className="help-text">
                {item.status === 'approved' ? 'Approved' : 'Rejected'}
                {item.review_note ? ` — ${item.review_note}` : ''}
              </p>
            )}
          </article>
        );
      })}
    </div>
  );
}
