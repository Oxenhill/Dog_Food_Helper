'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearUserId, getUserId } from '@/lib/clientAuth';

// Bare post-sign-in/sign-up confirmation page. There is no dog-profile
// creation flow or dog-listing dashboard built yet (see /signup's header
// comment) — this intentionally stays minimal rather than guessing at that
// larger flow. Redirects to /signin if no stopgap session is present.
export default function AccountPage() {
  const router = useRouter();
  const [userId, setLocalUserId] = useState<string | null>(null);

  useEffect(() => {
    const id = getUserId();
    if (!id) {
      router.replace('/signin');
      return;
    }
    setLocalUserId(id);
  }, [router]);

  function handleSignOut() {
    clearUserId();
    router.push('/');
  }

  if (!userId) return null;

  return (
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">You&apos;re signed in</h1>
        <p className="text-gray-600">
          Your account is ready. Dog profile creation isn&apos;t available in the interface yet —
          this is a known gap, tracked in BUILD_PROGRESS.md.
        </p>
        <p className="text-sm text-gray-500">
          If you already have a dog profile set up for you, use the link your admin gave you (of
          the form <code>/dogs/&lt;dogId&gt;/log</code>) to reach its logging pages.
        </p>
        <div className="flex gap-3">
          <Link href="/" className="text-blue-600 underline text-sm">
            Back home
          </Link>
          <button type="button" onClick={handleSignOut} className="text-sm text-red-600 underline">
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
