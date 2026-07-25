'use client';

import AdminShell from '@/components/AdminShell';
import ResearchAdmin from '@/components/ResearchAdmin';

export default function AdminResearchPage() {
  return (
    <AdminShell eyebrow="Studio" title="Research layer">
      <ResearchAdmin />
    </AdminShell>
  );
}
