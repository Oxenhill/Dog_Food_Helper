'use client';

import Link from 'next/link';
import QuickLogForm from '@/components/QuickLogForm';

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
        <h1 className="page-title mt-2">Quick log</h1>
        <p className="lead mt-2 max-w-prose">
          Tap better, worse, or no change for whichever indicators you noticed today.
        </p>

        <div className="mt-6">
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
