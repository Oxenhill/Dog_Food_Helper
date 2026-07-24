'use client';

import Link from 'next/link';
import IngredientReviewQueueAdmin from '@/components/IngredientReviewQueueAdmin';

export default function ReviewQueuePage() {
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="wordmark">
            <span className="wordmark-dot" />
            Dog Food Helper <span className="muted font-sans font-normal">· admin</span>
          </Link>
        </div>
      </header>

      <main className="container-page max-w-4xl">
        <IngredientReviewQueueAdmin />
      </main>
    </div>
  );
}
