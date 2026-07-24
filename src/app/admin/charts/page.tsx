'use client';

import AdminShell from '@/components/AdminShell';
import ChartIllustrationsAdmin from '@/components/ChartIllustrationsAdmin';

export default function ChartsAdminPage() {
  return (
    <AdminShell eyebrow="Studio" title="Chart illustrations">
      <ChartIllustrationsAdmin />
    </AdminShell>
  );
}
