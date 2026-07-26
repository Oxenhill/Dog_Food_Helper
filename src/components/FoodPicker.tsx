'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { authHeaders } from '@/lib/clientAuth';

export interface PickableFood {
  id: string;
  brand: string;
  name: string;
  food_type: string;
  is_treat: boolean;
}

interface Props {
  /** 'meal' excludes treats (a chew is never dinner); 'treat' shows only treats. */
  type: 'meal' | 'treat';
  onSelect: (food: PickableFood) => void;
  /** Free text is a fallback for a food genuinely not in the catalogue. */
  onSelectFreetext?: (text: string) => void;
  autoFocus?: boolean;
  /** Dog id, so the "scan a packet" escape hatch returns to the right place. */
  dogId?: string;
}

/**
 * Catalogue search for naming what a dog is actually eating.
 *
 * Picking a real catalogue row is what makes everything downstream work: free
 * text cannot be joined to an ingredient list, so a free-text food contributes
 * nothing to attribution. Free text is still offered, because a food that
 * genuinely isn't in the catalogue must not be a dead end — but it is framed
 * as a prompt to scan the packet rather than a resting state.
 */
export default function FoodPicker({
  type,
  onSelect,
  onSelectFreetext,
  autoFocus,
  dogId,
}: Props) {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<PickableFood[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [searched, setSearched] = useState(false);
  // Guards against an earlier, slower request overwriting a later one's
  // results — the classic search race that shows stale matches.
  const requestSeq = useRef(0);

  useEffect(() => {
    const trimmed = query.trim();
    if (trimmed.length < 2) {
      setResults([]);
      setSearched(false);
      return;
    }

    const seq = ++requestSeq.current;
    const timer = setTimeout(async () => {
      setLoading(true);
      setError('');
      try {
        const res = await fetch(
          `/api/foods?q=${encodeURIComponent(trimmed)}&type=${type}&limit=25`,
          { headers: authHeaders() }
        );
        const json = await res.json();
        if (seq !== requestSeq.current) return; // superseded
        if (!res.ok) {
          setError(json.error ?? `Search failed (${res.status})`);
          return;
        }
        setResults(json.foods ?? []);
        setSearched(true);
      } catch {
        if (seq === requestSeq.current) setError('Search failed. Please try again.');
      } finally {
        if (seq === requestSeq.current) setLoading(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [query, type]);

  const noun = type === 'treat' ? 'treat' : 'food';

  return (
    <div className="flex flex-col gap-3">
      <div className="field">
        <label className="label" htmlFor={`food-search-${type}`}>
          Search for the {noun}
        </label>
        <input
          id={`food-search-${type}`}
          type="search"
          autoFocus={autoFocus}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={type === 'treat' ? 'e.g. Dentastix' : 'e.g. Canagan chicken'}
          className="input"
          autoComplete="off"
        />
        <p className="help-text">Type at least two characters.</p>
      </div>

      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}

      {loading && <p className="muted text-[14px]">Searching…</p>}

      {results.length > 0 && (
        <ul className="flex flex-col gap-2">
          {results.map((food) => (
            <li key={food.id}>
              <button
                type="button"
                onClick={() => onSelect(food)}
                className="card card-pad w-full text-left hover:border-pine/40"
              >
                <span className="font-semibold text-ink">
                  {food.brand} {food.name}
                </span>
                <span className="muted ml-2 text-[13px]">{food.food_type}</span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {searched && !loading && results.length === 0 && (
        <div className="callout-info">
          <p className="text-[14px]">
            No {noun} in our list matches that.
          </p>
          <p className="help-text mt-2">
            The best fix is to scan the packet — that records the exact recipe and its full
            ingredient list, which is what lets us spot patterns later.
          </p>
          <Link
            href={dogId ? `/foods/add?dog=${dogId}` : '/foods/add'}
            className="btn-secondary btn-sm mt-3 inline-flex"
          >
            Scan the packet
          </Link>
          {onSelectFreetext && (
            <div className="hairline mt-3 pt-3">
              <button
                type="button"
                onClick={() => onSelectFreetext(query.trim())}
                className="btn-ghost btn-sm"
              >
                Just record the name &ldquo;{query.trim()}&rdquo; for now
              </button>
              <p className="help-text mt-1">
                We&apos;ll remember the name, but without the ingredient list we can&apos;t link
                it to how your dog responds.
              </p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
