'use client';

import Link from 'next/link';
import IngredientPhotoSubmissions from '@/components/IngredientPhotoSubmissions';

export default function SubmissionsPage({ params }: { params: { dogId: string } }) {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href={`/dogs/${params.dogId}`} className="wordmark">
            <span className="wordmark-dot" />
            Bowl
          </Link>
        </div>
      </header>

      <main className="container-page">
        <Link
          href={`/dogs/${params.dogId}`}
          className="muted text-[13px] font-semibold text-pine hover:underline"
        >
          ← Back to dog
        </Link>
        <p className="eyebrow mt-3">Photo submissions</p>
        <h1 className="page-title mt-1">Food label photos</h1>

        <div className="mt-6">
          <IngredientPhotoSubmissions dogId={params.dogId} />
        </div>
      </main>
    </div>
  );
}
