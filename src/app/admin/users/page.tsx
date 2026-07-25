'use client';

import AdminShell from '@/components/AdminShell';
import UsersAdmin from '@/components/UsersAdmin';

export default function UsersAdminPage() {
  return (
    <AdminShell eyebrow="Studio" title="Users">
      <UsersAdmin />
    </AdminShell>
  );
}
