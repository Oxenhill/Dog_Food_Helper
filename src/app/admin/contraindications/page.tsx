'use client';

import AdminShell from '@/components/AdminShell';
import ContraindicationsAdmin from '@/components/ContraindicationsAdmin';

export default function AdminContraindicationsPage() {
  return (
    <AdminShell eyebrow="Studio · safety layer" title="Condition contraindications">
      <ContraindicationsAdmin />
    </AdminShell>
  );
}
