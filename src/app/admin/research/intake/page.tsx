'use client';

import ResearchIngestionAdmin from '@/components/ResearchIngestionAdmin';

export default function ResearchIntakePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">Acquisition, kept apart from review</p>
        <h1 className="page-title mt-2 text-[22px] sm:text-[26px]">Intake</h1>
        <p className="lead mt-2 max-w-3xl">
          Discovery, link import and PDF upload only acquire and structurally store source text.
          Nothing here becomes evidence — that happens one deliberate decision at a time on the{' '}
          <span className="font-semibold text-ink">Review queue</span>.
        </p>
      </div>
      <ResearchIngestionAdmin />
    </div>
  );
}
