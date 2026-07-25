'use client';

import AdminShell from '@/components/AdminShell';
import FoodDetailAdmin from '@/components/FoodDetailAdmin';

export default function AdminFoodDetailPage({ params }: { params: { foodId: string } }) {
  return (
    <AdminShell eyebrow="Studio" title="Food detail">
      <FoodDetailAdmin foodId={params.foodId} />
    </AdminShell>
  );
}
