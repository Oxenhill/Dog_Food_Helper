'use client';

import { useRouter } from 'next/navigation';
import RecalibrationForm from '@/components/RecalibrationForm';

export default function RecalibratePage({ params }: { params: { dogId: string } }) {
  const router = useRouter();

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">Recalibrate</h1>
        <p className="text-gray-600 mb-6">
          Re-select the full chart for a precise reading, compared against your dog&apos;s baseline.
        </p>
        <RecalibrationForm dogId={params.dogId} onComplete={() => router.push(`/dogs/${params.dogId}/log`)} />
      </div>
    </main>
  );
}
