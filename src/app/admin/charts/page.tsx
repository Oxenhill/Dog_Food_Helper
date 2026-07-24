'use client';

import Link from 'next/link';
import ChartIllustrationsAdmin from '@/components/ChartIllustrationsAdmin';

export default function ChartsAdminPage() {
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
        <ChartIllustrationsAdmin />
      </main>
    </div>
  );
}
