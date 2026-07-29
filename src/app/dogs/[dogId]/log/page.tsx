'use client';

import Link from 'next/link';
import QuickLogForm from '@/components/QuickLogForm';
import StoolEventForm from '@/components/StoolEventForm';

export default function LogPage({ params }: { params: { dogId: string } }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dogs" className="wordmark">
            <span className="wordmark-dot" />
            Bowl
          </Link>
        </div>
      </header>

      <main className="container-page">
        <Link href={`/dogs/${params.dogId}`} className="muted text-[13px] hover:text-pine">
          ← Back
        </Link>

        <p className="eyebrow mt-4">Everyday tracking</p>
        <h1 className="page-title mt-2">Log today</h1>
        <p className="lead mt-2 max-w-prose">
          Record each stool when it happens, then add any broader changes you noticed.
        </p>

        <div className="card card-pad mt-6">
          <h2 className="section-title mb-4">Stool event</h2>
          <StoolEventForm dogId={params.dogId} />
        </div>

        <div className="mt-8">
          <h2 className="section-title mb-4">Other indicators</h2>
          <QuickLogForm dogId={params.dogId} />
        </div>

        <div className="mt-8 flex flex-wrap gap-x-6 gap-y-2 border-t border-line pt-6 text-[13px]">
          <Link href={`/dogs/${params.dogId}/log/recalibrate`} className="font-semibold text-pine hover:underline">
            Recalibrate with the full chart instead →
          </Link>
          <Link href={`/dogs/${params.dogId}/red-flag`} className="font-semibold text-alarm hover:underline">
            Something urgent instead? →
          </Link>
        </div>
      </main>
    </div>
  );
}
