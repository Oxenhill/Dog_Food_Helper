'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { authHeaders, getUserId } from '@/lib/clientAuth';
import { Dog } from '@/lib/types';

/**
 * Owner's dog list — the missing landing page after sign-in. Links to the
 * new /dogs/new creation form and each dog's new /dogs/[dogId] hub page.
 */
export default function DogsPage() {
  const router = useRouter();
  const [dogs, setDogs] = useState<Dog[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!getUserId()) {
      router.replace('/signin');
      return;
    }
    (async () => {
      try {
        const res = await fetch('/api/dogs', { headers: authHeaders() });
        const json = await res.json();
        if (!res.ok) {
          setError(json.error ?? `Failed to load dogs (${res.status})`);
          return;
        }
        setDogs(json.dogs ?? []);
      } finally {
        setLoading(false);
      }
    })();
  }, [router]);

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-3xl font-bold text-gray-900">Your dogs</h1>
          <div className="flex items-center gap-3">
            <Link href="/account" className="text-sm text-gray-600 underline">
              Account
            </Link>
            <Link
              href="/dogs/new"
              className="bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 text-sm"
            >
              Add a dog
            </Link>
          </div>
        </div>

        {error && <p className="text-sm text-red-600">{error}</p>}
        {loading && <p className="text-gray-600">Loading…</p>}

        {!loading && dogs.length === 0 && !error && (
          <div className="bg-white rounded-lg shadow p-6 text-center space-y-3">
            <p className="text-gray-600">No dog profiles yet.</p>
            <Link href="/dogs/new" className="text-blue-600 underline">
              Add your first dog →
            </Link>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {dogs.map((dog) => (
            <Link
              key={dog.id}
              href={`/dogs/${dog.id}`}
              className="bg-white rounded-lg shadow p-4 hover:shadow-md transition-shadow"
            >
              <h2 className="text-lg font-semibold text-gray-900">{dog.name}</h2>
              <p className="text-sm text-gray-600">
                {[dog.breed, dog.life_stage].filter(Boolean).join(' · ') || 'No details yet'}
              </p>
            </Link>
          ))}
        </div>
      </div>
    </main>
  );
}
