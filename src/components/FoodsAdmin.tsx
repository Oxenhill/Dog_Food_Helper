'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { sessionAuthHeaders } from '@/lib/session';
import { FoodType } from '@/lib/types';

interface FoodListRow {
  id: string;
  brand: string;
  name: string;
  food_type: FoodType;
  price_per_kg: number | null;
  nutrient_count: number;
  nutrient_total: number;
}

function nutrientBadge(row: FoodListRow) {
  if (row.nutrient_count === 0) {
    return <span className="signal-worse">no composition</span>;
  }
  if (row.nutrient_count === row.nutrient_total) {
    return <span className="badge-pine">nutrients {row.nutrient_count}/{row.nutrient_total}</span>;
  }
  return (
    <span className="badge-neutral">
      nutrients {row.nutrient_count}/{row.nutrient_total}
    </span>
  );
}

/**
 * Admin food-database list (/admin/foods). Search box filters brand/name
 * server-side via GET /api/admin/foods?q=. Each row links to the detail/edit
 * page. This is a review/correction surface — composition data primarily
 * arrives via automated extraction elsewhere in the product.
 */
export default function FoodsAdmin() {
  const [foods, setFoods] = useState<FoodListRow[]>([]);
  const [q, setQ] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  async function load(query: string) {
    setLoading(true);
    setError('');
    try {
      const url = query ? `/api/admin/foods?q=${encodeURIComponent(query)}` : '/api/admin/foods';
      const res = await fetch(url, { headers: sessionAuthHeaders() });
      if (!res.ok) {
        setError(`Could not load foods (${res.status}).`);
        return;
      }
      const json = await res.json();
      setFoods(json.foods ?? []);
    } catch {
      setError('Could not load foods.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void load('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    void load(q);
  }

  return (
    <div className="flex flex-col gap-6">
      <form onSubmit={handleSearchSubmit} className="flex gap-3">
        <div className="field flex-1">
          <label className="label" htmlFor="foods-search">
            Search brand or name
          </label>
          <input
            id="foods-search"
            type="text"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="e.g. Royal Canin, Salmon…"
            className="input"
          />
        </div>
        <button type="submit" className="btn-secondary self-end">
          {loading ? 'Searching…' : 'Search'}
        </button>
      </form>

      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}

      {!loading && foods.length === 0 && !error && (
        <p className="muted text-[14px]">No foods match.</p>
      )}

      <div className="flex flex-col gap-3">
        {foods.map((food) => (
          <Link key={food.id} href={`/admin/foods/${food.id}`} className="card-link">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <p className="section-title">
                  {food.brand} <span className="font-normal text-ink-soft">{food.name}</span>
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="badge-neutral">{food.food_type}</span>
                  {nutrientBadge(food)}
                </div>
              </div>
              <span className="metric text-[16px] font-semibold text-ink">
                {food.price_per_kg != null ? `£${Number(food.price_per_kg).toFixed(2)}/kg` : '—'}
              </span>
            </div>
          </Link>
        ))}
      </div>
    </div>
  );
}
