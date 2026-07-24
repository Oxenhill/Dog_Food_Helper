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
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dogs" className="wordmark">
            <span className="wordmark-dot" />
            Dog Food Helper
          </Link>
          <Link href="/account" className="btn-ghost btn-sm">
            Account
          </Link>
        </div>
      </header>

      <main className="container-page">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="eyebrow">Your household</p>
            <h1 className="page-title mt-2">Your dogs</h1>
          </div>
          <Link href="/dogs/new" className="btn-primary btn-sm shrink-0">
            Add a dog
          </Link>
        </div>

        {error && (
          <div className="callout-alarm mt-6" role="alert">
            {error}
          </div>
        )}
        {loading && <p className="muted mt-6">Loading…</p>}

        {!loading && dogs.length === 0 && !error && (
          <div className="card card-pad mt-6 text-center">
            <p className="lead">No dog profiles yet.</p>
            <Link href="/dogs/new" className="btn-primary mt-4 inline-flex">
              Add your first dog
            </Link>
          </div>
        )}

        {!loading && dogs.length > 0 && (
          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
            {dogs.map((dog) => (
              <Link key={dog.id} href={`/dogs/${dog.id}`} className="card-link">
                <h2 className="section-title">{dog.name}</h2>
                <p className="muted mt-1 text-[14px]">
                  {[dog.breed, dog.life_stage].filter(Boolean).join(' · ') || 'No details yet'}
                </p>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
