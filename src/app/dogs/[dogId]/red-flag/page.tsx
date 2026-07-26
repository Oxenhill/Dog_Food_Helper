'use client';

import Link from 'next/link';
import RedFlagForm from '@/components/RedFlagForm';

export default function RedFlagPage({ params }: { params: { dogId: string } }) {
  return (
    <div className="app-shell bg-alarm-tint">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dogs" className="wordmark">
            <span className="wordmark-dot" />
            Bowl
          </Link>
        </div>
      </header>

      <main className="container-page">
        <Link href={`/dogs/${params.dogId}`} className="muted text-[13px] hover:text-alarm-dark">
          ← Back
        </Link>

        <div className="mt-4">
          <RedFlagForm dogId={params.dogId} />
        </div>
      </main>
    </div>
  );
}
