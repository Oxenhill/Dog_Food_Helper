'use client';

import RedFlagForm from '@/components/RedFlagForm';

export default function RedFlagPage({ params }: { params: { dogId: string } }) {
  return (
    <main className="min-h-screen bg-red-50/30 p-8">
      <div className="max-w-2xl mx-auto">
        <RedFlagForm dogId={params.dogId} />
      </div>
    </main>
  );
}
