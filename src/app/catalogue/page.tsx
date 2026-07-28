'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';

/**
 * Public food catalogue browse (DECISION 4, owner, 2026-07-28).
 *
 * No login, no dog context. This is a catalogue, not a recommendation: no
 * score, no ranking language anywhere on this page. Reads /api/catalogue,
 * which itself reads only catalogue.foods / catalogue.food_ingredients —
 * the same population the ODbL export publishes, by construction.
 */

type DataState = 'no_ingredients' | 'opaque' | 'clean';

interface CatalogueFood {
  food_id: string;
  brand: string;
  name: string;
  food_type: string;
  is_treat: boolean;
  source_url: string | null;
  price_per_kg: number | null;
  calories_per_kg: number | null;
  data_state: DataState;
  data_state_message: string | null;
}

interface CatalogueResponse {
  foods: CatalogueFood[];
  total: number;
  facets: { brands: string[]; food_types: string[] };
}

const STATE_LABEL: Record<DataState, string> = {
  clean: 'Ingredients on record',
  opaque: 'Ingredients on record, with an unnamed category',
  no_ingredients: 'No ingredients on record',
};

const TREAT_OPTIONS = [
  { value: '', label: 'All' },
  { value: 'false', label: 'Meals only' },
  { value: 'true', label: 'Treats only' },
];

const STATE_OPTIONS: { value: '' | DataState; label: string }[] = [
  { value: '', label: 'All' },
  { value: 'clean', label: STATE_LABEL.clean },
  { value: 'opaque', label: STATE_LABEL.opaque },
  { value: 'no_ingredients', label: STATE_LABEL.no_ingredients },
];

export default function CataloguePage() {
  const [data, setData] = useState<CatalogueResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [brand, setBrand] = useState('');
  const [foodType, setFoodType] = useState('');
  const [isTreat, setIsTreat] = useState('');
  const [state, setState] = useState<'' | DataState>('');

  const query = useMemo(() => {
    const params = new URLSearchParams();
    if (brand) params.set('brand', brand);
    if (foodType) params.set('food_type', foodType);
    if (isTreat) params.set('is_treat', isTreat);
    if (state) params.set('state', state);
    return params.toString();
  }, [brand, foodType, isTreat, state]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    fetch(`/api/catalogue${query ? `?${query}` : ''}`)
      .then((res) => res.json())
      .then((json) => {
        if (cancelled) return;
        if (json.error) {
          setError(json.error);
          return;
        }
        setData(json as CatalogueResponse);
      })
      .catch(() => {
        if (!cancelled) setError('Could not load the catalogue.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [query]);

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <span className="wordmark">
            <span className="wordmark-dot" />
            Bowl
          </span>
          <Link href="/signin" className="btn-ghost btn-sm">
            Sign in
          </Link>
        </div>
      </header>

      <main className="container-page">
        <section className="pt-6 sm:pt-10">
          <p className="eyebrow">Open food data</p>
          <h1 className="page-title mt-2 text-[28px] leading-[1.1] sm:text-[36px]">
            Food catalogue
          </h1>
          <p className="lead mt-4 max-w-prose">
            Every UK dog food we hold a record for, and exactly what we do and
            don&apos;t know about its ingredients. This is a catalogue, not a
            recommendation — it has no dog context and nothing here is
            scored or ranked.
          </p>
        </section>

        <section className="mt-6 flex flex-wrap gap-3">
          <label className="flex flex-col gap-1 text-[13px]">
            <span className="help-text">Brand</span>
            <select
              className="input"
              value={brand}
              onChange={(e) => setBrand(e.target.value)}
            >
              <option value="">All</option>
              {(data?.facets.brands ?? []).map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[13px]">
            <span className="help-text">Food type</span>
            <select
              className="input"
              value={foodType}
              onChange={(e) => setFoodType(e.target.value)}
            >
              <option value="">All</option>
              {(data?.facets.food_types ?? []).map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[13px]">
            <span className="help-text">Meals / treats</span>
            <select
              className="input"
              value={isTreat}
              onChange={(e) => setIsTreat(e.target.value)}
            >
              {TREAT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>

          <label className="flex flex-col gap-1 text-[13px]">
            <span className="help-text">Ingredient data</span>
            <select
              className="input"
              value={state}
              onChange={(e) => setState(e.target.value as '' | DataState)}
            >
              {STATE_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="mt-6">
          {loading && <p className="muted text-[14px]">Loading…</p>}
          {error && <p className="callout-disclaimer text-[14px]">{error}</p>}

          {!loading && !error && data && (
            <>
              <p className="help-text mb-3">{data.total} foods</p>
              <div className="flex flex-col gap-4">
                {data.foods.map((f) => (
                  <div key={f.food_id} className="hairline pt-4 first:border-0 first:pt-0">
                    <div className="flex items-center justify-between gap-3">
                      <h3 className="font-semibold text-ink">
                        {f.brand} {f.name}
                      </h3>
                      <span className="badge-pine metric shrink-0 normal-case">
                        {f.food_type}
                        {f.is_treat ? ' · treat' : ''}
                      </span>
                    </div>
                    <p className="help-text mt-1">{STATE_LABEL[f.data_state]}</p>
                    {f.data_state_message && (
                      <p className="callout-disclaimer mt-1 text-[13px]">
                        {f.data_state_message}
                      </p>
                    )}
                    {f.price_per_kg != null && (
                      <p className="metric help-text mt-1">£{f.price_per_kg.toFixed(2)}/kg</p>
                    )}
                    {f.source_url && (
                      <a
                        href={f.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="help-text mt-1 inline-block underline"
                      >
                        Source
                      </a>
                    )}
                  </div>
                ))}
                {data.foods.length === 0 && (
                  <p className="muted text-[14px]">No foods match these filters.</p>
                )}
              </div>
            </>
          )}
        </section>

        <footer className="mt-12 border-t border-line pt-6 pb-10">
          <p className="help-text max-w-prose">
            This data is available under the{' '}
            <a
              href="https://opendatacommons.org/licenses/odbl/"
              target="_blank"
              rel="noopener noreferrer"
              className="underline"
            >
              Open Database License (ODbL)
            </a>
            .
          </p>
          <p className="help-text mt-2 max-w-prose">
            Bowl takes no commission on food recommendations. No affiliate
            links are used anywhere on this site.
          </p>
        </footer>
      </main>
    </div>
  );
}
