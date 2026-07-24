'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authHeaders, getUserId } from '@/lib/clientAuth';
import { Dog } from '@/lib/types';

interface Recommendation {
  food_id: string;
  brand: string;
  name: string;
  food_type: string;
  score: number;
  confidence: number;
  reason: string;
  estimated_monthly_cost: number | null;
}

interface RecommendationsResponse {
  recommendations: Recommendation[];
  message?: string;
  disclaimer: string;
  excluded_count: number;
  total_candidates: number;
}

/**
 * Dog hub page — was entirely missing (BUILD_PROGRESS.md flagged no
 * dog-profile UI exists at all beyond dogId-scoped sub-pages that require
 * already knowing the URL). Links into every existing per-dog feature
 * (baseline, quick-log, red-flag, photo submissions) and gives
 * POST /api/recommendations — the core recommendation engine, built since
 * Phase 3 — its first UI entry point.
 */
export default function DogHubPage({ params }: { params: { dogId: string } }) {
  const router = useRouter();
  const [dog, setDog] = useState<Dog | null>(null);
  const [loadError, setLoadError] = useState('');
  const [recs, setRecs] = useState<RecommendationsResponse | null>(null);
  const [recsLoading, setRecsLoading] = useState(false);
  const [recsError, setRecsError] = useState('');

  useEffect(() => {
    if (!getUserId()) {
      router.replace('/signin');
      return;
    }
    (async () => {
      const res = await fetch(`/api/dogs/${params.dogId}`, { headers: authHeaders() });
      const json = await res.json();
      if (!res.ok) {
        setLoadError(json.error ?? `Failed to load dog (${res.status})`);
        return;
      }
      setDog(json);
    })();
  }, [params.dogId, router]);

  async function getRecommendations() {
    setRecsError('');
    setRecsLoading(true);
    try {
      const res = await fetch('/api/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify({ dog_id: params.dogId }),
      });
      const json = await res.json();
      if (!res.ok) {
        setRecsError(json.error ?? `Failed to get recommendations (${res.status})`);
        return;
      }
      setRecs(json);
    } catch {
      setRecsError('Something went wrong. Please try again.');
    } finally {
      setRecsLoading(false);
    }
  }

  if (loadError) {
    return (
      <main className="min-h-screen bg-gray-50 p-8">
        <div className="max-w-2xl mx-auto">
          <p className="text-red-600">{loadError}</p>
          <Link href="/dogs" className="text-blue-600 underline">
            ← Back to your dogs
          </Link>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <Link href="/dogs" className="text-sm text-blue-600 underline">
            ← Your dogs
          </Link>
          <h1 className="text-3xl font-bold text-gray-900 mt-2">{dog?.name ?? 'Loading…'}</h1>
          {dog && (
            <p className="text-gray-600">
              {[dog.breed, dog.life_stage, dog.size_category].filter(Boolean).join(' · ')}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Link href={`/dogs/${params.dogId}/baseline`} className="bg-white rounded-lg shadow p-4 hover:shadow-md">
            <h2 className="font-semibold text-gray-900">Baseline</h2>
            <p className="text-sm text-gray-600">Establish or review the starting chart</p>
          </Link>
          <Link href={`/dogs/${params.dogId}/log`} className="bg-white rounded-lg shadow p-4 hover:shadow-md">
            <h2 className="font-semibold text-gray-900">Quick log</h2>
            <p className="text-sm text-gray-600">Tap better / worse / no change</p>
          </Link>
          <Link href={`/dogs/${params.dogId}/red-flag`} className="bg-white rounded-lg shadow p-4 hover:shadow-md border border-red-200">
            <h2 className="font-semibold text-red-700">Red flag</h2>
            <p className="text-sm text-gray-600">Log an urgent symptom</p>
          </Link>
          <Link href={`/dogs/${params.dogId}/submissions`} className="bg-white rounded-lg shadow p-4 hover:shadow-md">
            <h2 className="font-semibold text-gray-900">Photo submissions</h2>
            <p className="text-sm text-gray-600">Submit or review a food label photo</p>
          </Link>
        </div>

        <div className="bg-white rounded-lg shadow p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-bold text-gray-900">Food recommendations</h2>
            <button
              type="button"
              onClick={() => void getRecommendations()}
              disabled={recsLoading}
              className="bg-green-600 text-white px-4 py-2 rounded-lg hover:bg-green-700 text-sm disabled:opacity-50"
            >
              {recsLoading ? 'Scoring…' : recs ? 'Refresh' : 'Get recommendations'}
            </button>
          </div>

          {recsError && <p className="text-sm text-red-600">{recsError}</p>}

          {recs && (
            <div className="space-y-4">
              <p className="text-xs text-gray-500 italic">{recs.disclaimer}</p>
              {recs.message && <p className="text-sm text-gray-600">{recs.message}</p>}
              {recs.recommendations.map((r, i) => (
                <div key={r.food_id} className="border border-gray-200 rounded-lg p-4">
                  <div className="flex items-center justify-between">
                    <h3 className="font-semibold text-gray-900">
                      #{i + 1} {r.brand} {r.name}
                    </h3>
                    <span className="text-sm text-gray-500">
                      score {r.score.toFixed(2)} · confidence {(r.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <p className="text-sm text-gray-700 mt-1">{r.reason}</p>
                  {r.estimated_monthly_cost != null && (
                    <p className="text-xs text-gray-500 mt-1">
                      Est. £{r.estimated_monthly_cost.toFixed(2)}/month
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </main>
  );
}
