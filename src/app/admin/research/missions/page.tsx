'use client';

import ResearchMissionAdmin from '@/components/ResearchMissionAdmin';

export default function ResearchMissionsPage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <p className="eyebrow">Operational telemetry</p>
        <h1 className="page-title mt-2 text-[22px] sm:text-[26px]">Mission monitor</h1>
        <p className="lead mt-2 max-w-3xl">
          Persisted missions, stage attempts, usage and budget caps — actual provider-reported
          spend kept separate from estimates, resumable polling for everything running now.
        </p>
      </div>
      <ResearchMissionAdmin />
    </div>
  );
}
