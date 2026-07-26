'use client';

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { authHeaders, getUserId } from '@/lib/clientAuth';
import type { FoodFull } from '@/lib/foodFull';
import CompositionPie from '@/components/CompositionPie';
import IngredientList from '@/components/IngredientList';

/**
 * Owner-facing food detail page.
 *
 * The owner's request this answers: "clients need to be able to see the
 * ingredients when a food is displayed." The existing /admin/foods/[foodId] is
 * admin-only and framed as record review; this is the client's view, and the
 * full ordered ingredient list is the primary content on it.
 *
 * The composition pie is deliberately secondary and renders itself away when
 * the guaranteed-analysis panel is incomplete.
 */
export default function FoodDetailPage({ params }: { params: { foodId: string } }) {
  // useSearchParams must sit under a Suspense boundary, otherwise the whole
  // route deopts to client-side rendering at build time.
  return (
    <Suspense fallback={null}>
      <FoodDetail foodId={params.foodId} />
    </Suspense>
  );
}

function FoodDetail({ foodId }: { foodId: string }) {
  const router = useRouter();
  const searchParams = useSearchParams();
  // Set when arriving from a dog's recommendations, so "back" returns there.
  const fromDogId = searchParams.get('dog');

  const [food, setFood] = useState<FoodFull | null>(null);
  const [loadError, setLoadError] = useState('');
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!getUserId()) {
      router.replace('/signin');
      return;
    }
    (async () => {
      try {
        const res = await fetch(`/api/foods/${foodId}`, { headers: authHeaders() });
        const json = await res.json();
        if (!res.ok) {
          setLoadError(json.error ?? `Failed to load food (${res.status})`);
          return;
        }
        setFood(json);
      } catch {
        setLoadError('Something went wrong loading this food.');
      } finally {
        setLoading(false);
      }
    })();
  }, [foodId, router]);

  const backHref = fromDogId ? `/dogs/${fromDogId}` : '/dogs';
  const backLabel = fromDogId ? '← Back to your dog' : '← Your dogs';

  const nutrients = food?.nutrients;
  const extraNutrients = nutrients
    ? ([
        ['Phosphorus', nutrients.phosphorus_pct],
        ['Sodium', nutrients.sodium_pct],
        ['Calcium', nutrients.calcium_pct],
      ] as const).filter(([, v]) => v !== null)
    : [];

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
        <Link href={backHref} className="muted text-[13px] font-semibold text-pine hover:underline">
          {backLabel}
        </Link>

        {loadError && (
          <div className="callout-alarm mt-4" role="alert">
            {loadError}
          </div>
        )}

        {loading && !loadError && <p className="muted mt-6">Loading…</p>}

        {food && (
          <>
            <p className="eyebrow mt-4">{food.brand}</p>
            <h1 className="page-title mt-1">{food.name}</h1>
            <div className="mt-3 flex flex-wrap items-center gap-2">
              <span className="badge-neutral normal-case">{food.food_type.replace('_', ' ')}</span>
              {food.price_per_kg !== null && (
                <span className="badge-neutral metric normal-case">
                  £{food.price_per_kg.toFixed(2)}/kg
                </span>
              )}
              {food.calories_per_kg !== null && (
                <span className="badge-neutral metric normal-case">
                  {Math.round(food.calories_per_kg)} kcal/kg
                </span>
              )}
            </div>

            {/* Ingredients first — this is the primary information about a food. */}
            <section className="card card-pad mt-6">
              <h2 className="section-title">
                Ingredients
                {food.ingredients.length > 0 && (
                  <span className="metric ml-2 text-[14px] font-normal text-ink-soft">
                    {food.ingredients.length} listed
                  </span>
                )}
              </h2>
              <div className="mt-4">
                <IngredientList
                  ingredients={food.ingredients}
                  foodLabel={`${food.brand} ${food.name}`}
                />
              </div>
            </section>

            <section className="card card-pad mt-5">
              <h2 className="section-title">Composition by weight</h2>
              {nutrients && <CompositionPie nutrients={nutrients} />}
              {nutrients?.est_digestible_carbohydrate_pct === null && (
                <p className="muted mt-2 text-[14px]">
                  This food&apos;s guaranteed-analysis panel is incomplete, so we can&apos;t show a
                  reliable breakdown of its composition.
                </p>
              )}

              {extraNutrients.length > 0 && (
                <div className="hairline mt-5 pt-4">
                  <p className="eyebrow">Also declared</p>
                  <dl className="mt-2 flex flex-wrap gap-x-6 gap-y-1">
                    {extraNutrients.map(([label, value]) => (
                      <div key={label} className="flex items-baseline gap-2">
                        <dt className="text-[13px] text-ink-soft">{label}</dt>
                        <dd className="metric text-[13px] font-semibold text-ink">{value}%</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              )}

              {nutrients?.est_digestible_carbohydrate_pct !== null && (
                <p className="help-text mt-4">
                  Carbohydrate is estimated by subtracting the printed fractions from 100 —
                  manufacturers rarely print it. Because &ldquo;crude fibre&rdquo; understates total
                  dietary fibre, this figure tends to run high, and it can&apos;t tell you{' '}
                  <em>which</em> carbohydrate or fibre a food uses. The ingredient list above is the
                  reliable source for that.
                </p>
              )}
            </section>

            {(food.source_url || food.last_verified_at) && (
              <section className="mt-5">
                <p className="help-text">
                  {food.source_url && (
                    <>
                      Recorded from{' '}
                      <a
                        href={food.source_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-semibold text-pine hover:underline"
                      >
                        {food.source_domain ?? 'the manufacturer’s page'}
                      </a>
                      .{' '}
                    </>
                  )}
                  {food.last_verified_at && (
                    <>
                      Last checked{' '}
                      <span className="metric">
                        {new Date(food.last_verified_at).toLocaleDateString('en-GB')}
                      </span>
                      . Always confirm against the packet you actually buy — recipes change.
                    </>
                  )}
                </p>
              </section>
            )}

            <div className="callout-disclaimer mt-6">
              This is a decision-support tool, not veterinary advice. Always consult your vet before
              changing your dog&apos;s diet, especially if your dog has existing health conditions.
            </div>
          </>
        )}
      </main>
    </div>
  );
}
