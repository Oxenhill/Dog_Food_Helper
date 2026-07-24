'use client';

import IngredientPhotoSubmissions from '@/components/IngredientPhotoSubmissions';

export default function SubmissionsPage({ params }: { params: { dogId: string } }) {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <IngredientPhotoSubmissions dogId={params.dogId} />
      </div>
    </main>
  );
}
