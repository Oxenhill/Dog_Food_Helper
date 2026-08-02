'use client';

import AdminShell from '@/components/AdminShell';
import ResearchAdmin from '@/components/ResearchAdmin';
import ResearchIngestionAdmin from '@/components/ResearchIngestionAdmin';
import ResearchKnowledgeAdmin from '@/components/ResearchKnowledgeAdmin';
import ResearchMissionAdmin from '@/components/ResearchMissionAdmin';

export default function AdminResearchPage() {
  return (
    <AdminShell eyebrow="Studio" title="Research layer">
      <div className="flex flex-col gap-6">
        <ResearchMissionAdmin />
        <ResearchIngestionAdmin />
        <ResearchKnowledgeAdmin />
        <ResearchAdmin />
      </div>
    </AdminShell>
  );
}
