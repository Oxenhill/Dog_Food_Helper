'use client';

import AdminShell from '@/components/AdminShell';
import IngredientReviewQueueAdmin from '@/components/IngredientReviewQueueAdmin';

export default function ReviewQueuePage() {
  return (
    <AdminShell eyebrow="Studio" title="Ingredient review queue">
      <IngredientReviewQueueAdmin />
    </AdminShell>
  );
}
