'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import RecalibrationForm from '@/components/RecalibrationForm';

export default function RecalibratePage({ params }: { params: { dogId: string } }) {
  const router = useRouter();

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

        <p className="eyebrow mt-4">Full chart re-select</p>
        <h1 className="page-title mt-2">Recalibrate</h1>
        <p className="lead mt-2 max-w-prose">
          Re-select the full chart for a precise reading, compared against your dog&apos;s baseline.
        </p>

        <div className="card card-pad mt-6">
          <RecalibrationForm dogId={params.dogId} onComplete={() => router.push(`/dogs/${params.dogId}/log`)} />
        </div>
      </main>
    </div>
  );
}
