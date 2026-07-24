'use client';

import { useRouter } from 'next/navigation';
import BaselineForm from '@/components/BaselineForm';

export default function BaselinePage({ params }: { params: { dogId: string } }) {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Establish baseline</h1>
        <p className="text-gray-600 mb-6">
          A full check-in, done once, that everything else gets compared against.
        </p>
        <BaselineForm dogId={params.dogId} onComplete={() => router.push(`/dogs/${params.dogId}/log`)} />
      </div>
    </main>
  );
}
