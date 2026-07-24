'use client';

import Link from 'next/link';
import RestrictionsManager from '@/components/RestrictionsManager';

/**
 * Allergies & health-conditions management for a single dog. This is the
 * primary data-entry point for dog_restrictions / dog_health_conditions —
 * both read directly by the deterministic hard-filter safety layer
 * (architecture doc §2) before any scoring or research-based ranking runs.
 * Thin wrapper (shell/header/title/back-link/callout) around the
 * interactive RestrictionsManager, matching the "← Back" pattern already
 * used by the redesigned dogs/[dogId]/baseline and dogs/[dogId]/red-flag
 * page wrappers.
 */
export default function RestrictionsPage({ params }: { params: { dogId: string } }) {
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
        <Link href={`/dogs/${params.dogId}`} className="muted text-[13px] hover:text-pine">
          ← Back
        </Link>

        <p className="eyebrow mt-4">Safety layer</p>
        <h1 className="page-title mt-2">Allergies &amp; health</h1>

        <div className="callout-info mt-5">
          These entries drive the recommendation engine&apos;s hard safety filter: any food
          containing a listed allergen or intolerance substance is excluded outright, before any
          scoring or research-based ranking ever runs.
        </div>

        <RestrictionsManager dogId={params.dogId} />
      </main>
    </div>
  );
}
