'use client';

import AdminShell from '@/components/AdminShell';
import FoodsAdmin from '@/components/FoodsAdmin';

export default function AdminFoodsPage() {
  return (
    <AdminShell eyebrow="Studio" title="Food database">
      <FoodsAdmin />
    </AdminShell>
  );
}
