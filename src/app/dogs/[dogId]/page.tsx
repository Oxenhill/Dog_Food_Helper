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
  const [removing, setRemoving] = useState(false);
  const [removeError, setRemoveError] = useState('');

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

  // New: removes this dog from the owner's account. Confirmed via
  // window.confirm before the destructive call, per the design brief — this
  // is a calm, deliberate action (not the red-flag alarm register), so it
  // stays styled with .btn-danger rather than a full-page alarm treatment.
  async function handleRemoveDog() {
    if (!window.confirm(`Remove ${dog?.name ?? 'this dog'} from your account?`)) return;
    setRemoveError('');
    setRemoving(true);
    try {
      const res = await fetch(`/api/dogs/${params.dogId}`, {
        method: 'DELETE',
        headers: authHeaders(),
      });
      const json = await res.json();
      if (!res.ok) {
        setRemoveError(json.error ?? `Failed to remove dog (${res.status})`);
        return;
      }
      router.push('/dogs');
    } catch {
      setRemoveError('Something went wrong. Please try again.');
    } finally {
      setRemoving(false);
    }
  }

  if (loadError) {
    return (
      <div className="app-shell">
        <header className="app-header">
          <div className="app-header-inner">
            <Link href="/dogs" className="wordmark">
              <span className="wordmark-dot" />
              Dog Food Helper
            </Link>
          </div>
        </header>
        <main className="container-page">
          <div className="callout-alarm" role="alert">
            {loadError}
          </div>
          <Link href="/dogs" className="btn-secondary mt-4 inline-flex">
            ← Back to your dogs
          </Link>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dogs" className="wordmark">
            <span className="wordmark-dot" />
            Dog Food Helper
          </Link>
        </div>
      </header>

      <main className="container-page">
        <Link href="/dogs" className="muted text-[13px] font-semibold text-pine hover:underline">
          ← Your dogs
        </Link>
        <h1 className="page-title mt-2">{dog?.name ?? 'Loading…'}</h1>
        {dog && (
          <p className="lead mt-1">
            {[dog.breed, dog.life_stage, dog.size_category].filter(Boolean).join(' · ')}
          </p>
        )}

        <div className="mt-6 grid grid-cols-2 gap-3">
          <Link href={`/dogs/${params.dogId}/baseline`} className="card-link">
            <h2 className="section-title text-[15px]">Baseline</h2>
            <p className="muted mt-1 text-[13px]">Establish or review the starting chart</p>
          </Link>
          <Link href={`/dogs/${params.dogId}/log`} className="card-link">
            <h2 className="section-title text-[15px]">Quick log</h2>
            <p className="muted mt-1 text-[13px]">Tap better / worse / no change</p>
          </Link>
          <Link
            href={`/dogs/${params.dogId}/red-flag`}
            className="card-link border-alarm/25 hover:border-alarm/40"
          >
            <h2 className="section-title text-[15px] text-alarm">Red flag</h2>
            <p className="muted mt-1 text-[13px]">Log an urgent symptom</p>
          </Link>
          <Link href={`/dogs/${params.dogId}/submissions`} className="card-link">
            <h2 className="section-title text-[15px]">Photo submissions</h2>
            <p className="muted mt-1 text-[13px]">Submit or review a food label photo</p>
          </Link>
          <Link href={`/dogs/${params.dogId}/edit`} className="card-link">
            <h2 className="section-title text-[15px]">Edit profile</h2>
            <p className="muted mt-1 text-[13px]">Update breed, weight, lifestyle and more</p>
          </Link>
          <Link href={`/dogs/${params.dogId}/restrictions`} className="card-link">
            <h2 className="section-title text-[15px]">Allergies &amp; health</h2>
            <p className="muted mt-1 text-[13px]">Manage restrictions and conditions</p>
          </Link>
        </div>

        <div className="card card-pad mt-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="section-title">Food recommendations</h2>
            <button
              type="button"
              onClick={() => void getRecommendations()}
              disabled={recsLoading}
              className="btn-primary btn-sm shrink-0"
            >
              {recsLoading ? 'Scoring…' : recs ? 'Refresh' : 'Get recommendations'}
            </button>
          </div>

          {recsError && (
            <div className="callout-alarm mt-4" role="alert">
              {recsError}
            </div>
          )}

          {recs && (
            <div className="mt-4 flex flex-col gap-4">
              <p className="help-text italic">{recs.disclaimer}</p>
              {recs.message && <p className="muted text-[14px]">{recs.message}</p>}
              {recs.recommendations.map((r, i) => (
                <div key={r.food_id} className="hairline pt-4 first:border-0 first:pt-0">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-semibold text-ink">
                      <span className="metric text-ink-soft">#{i + 1}</span> {r.brand} {r.name}
                    </h3>
                    <span className="badge-pine metric shrink-0 normal-case">
                      score {r.score.toFixed(2)} · {(r.confidence * 100).toFixed(0)}% confidence
                    </span>
                  </div>
                  <p className="lead mt-1">{r.reason}</p>
                  {r.estimated_monthly_cost != null && (
                    <p className="metric help-text mt-1">
                      Est. £{r.estimated_monthly_cost.toFixed(2)}/month
                    </p>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="hairline mt-10 pt-6">
          {removeError && (
            <div className="callout-alarm mb-4" role="alert">
              {removeError}
            </div>
          )}
          <button
            type="button"
            onClick={() => void handleRemoveDog()}
            disabled={removing}
            className="btn-danger btn-sm"
          >
            {removing ? 'Removing…' : 'Remove dog'}
          </button>
          <p className="help-text mt-2">
            Removes this dog from your account. Its logged data is kept anonymously to improve
            recommendations.
          </p>
        </div>
      </main>
    </div>
  );
}
