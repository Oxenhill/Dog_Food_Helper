'use client';

import AdminShell from '@/components/AdminShell';
import ContributedFoodsAdmin from '@/components/ContributedFoodsAdmin';

export default function ContributionsPage() {
  return (
    <AdminShell eyebrow="Studio" title="Contributed foods">
      <ContributedFoodsAdmin />
    </AdminShell>
  );
}
