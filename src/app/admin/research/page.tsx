'use client';

import AdminShell from '@/components/AdminShell';
import ResearchAdmin from '@/components/ResearchAdmin';
import ResearchIngestionAdmin from '@/components/ResearchIngestionAdmin';
import ResearchKnowledgeAdmin from '@/components/ResearchKnowledgeAdmin';

export default function AdminResearchPage() {
  return (
    <AdminShell eyebrow="Studio" title="Research layer">
      <div className="flex flex-col gap-6">
        <ResearchIngestionAdmin />
        <ResearchKnowledgeAdmin />
        <ResearchAdmin />
      </div>
    </AdminShell>
  );
}
