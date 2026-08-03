'use client';

import ResearchGraphExplorer from '@/components/ResearchGraphExplorer';

export default function ResearchExplorerPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">Reference-quality lookup</p>
        <h1 className="page-title mt-2 text-[22px] sm:text-[26px]">Evidence explorer</h1>
        <p className="lead mt-2 max-w-3xl">
          Search and drill into a claim, cluster, document or concept: literal quote, reviewer,
          study family and retraction/supersession lineage, one node at a time. For a spatial view
          of the same data, see <span className="font-semibold text-ink">Graph canvas</span>.
        </p>
      </div>
      <ResearchGraphExplorer />
    </div>
  );
}
