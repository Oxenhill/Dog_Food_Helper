'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import BaselineForm from '@/components/BaselineForm';

export default function BaselinePage({ params }: { params: { dogId: string } }) {
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

        <p className="eyebrow mt-4">One-time check-in</p>
        <h1 className="page-title mt-2">Establish baseline</h1>
        <p className="lead mt-2 max-w-prose">
          A full check-in, done once, that everything else gets compared against.
        </p>

        <div className="card card-pad mt-6">
          <BaselineForm dogId={params.dogId} onComplete={() => router.push(`/dogs/${params.dogId}/log`)} />
        </div>
      </main>
    </div>
  );
}
