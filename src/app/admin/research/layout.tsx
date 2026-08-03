'use client';

import AdminShell from '@/components/AdminShell';
import ResearchNav from '@/components/research/ResearchNav';

/**
 * Shared shell for the whole research workspace. Replaces the old single
 * page that stacked five unrelated components vertically -- each workspace
 * below is now its own route, sharing this nav and the wide container the
 * evidence graph in particular needs.
 */
export default function ResearchLayout({ children }: { children: React.ReactNode }) {
  return (
    <AdminShell eyebrow="Studio" title="Research layer" wide>
      <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:gap-8">
        <ResearchNav />
        <div className="min-w-0 flex-1">{children}</div>
      </div>
    </AdminShell>
  );
}
