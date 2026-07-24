'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { clearUserId, getUserId } from '@/lib/clientAuth';

// Minimal account/sign-out page. Signin/signup redirect straight to /dogs
// now (the real landing page); this page is reachable from there for
// account-level actions like signing out.
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
        <h1 className="text-2xl font-bold text-gray-900">Your account</h1>
        <p className="text-gray-600">You&apos;re signed in.</p>
        <div className="flex gap-3">
          <Link href="/dogs" className="text-blue-600 underline text-sm">
            Your dogs
          </Link>
          <button type="button" onClick={handleSignOut} className="text-sm text-red-600 underline">
            Sign out
          </button>
        </div>
      </div>
    </main>
  );
}
