'use client';

import Link from 'next/link';
import QuickLogForm from '@/components/QuickLogForm';

export default function LogPage({ params }: { params: { dogId: string } }) {
  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Quick log</h1>
          <p className="text-gray-600">
            Tap better, worse, or no change for whichever indicators you noticed today.
          </p>
        </div>

        <QuickLogForm dogId={params.dogId} />

        <div className="flex flex-wrap gap-4 pt-4 border-t border-gray-200 text-sm">
          <Link href={`/dogs/${params.dogId}/log/recalibrate`} className="text-blue-600 hover:underline">
            Recalibrate with the full chart instead →
          </Link>
          <Link href={`/dogs/${params.dogId}/red-flag`} className="text-red-700 font-semibold hover:underline">
            Something urgent instead? →
          </Link>
        </div>
      </div>
    </main>
  );
}
