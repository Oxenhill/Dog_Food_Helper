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
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/dogs" className="wordmark">
            <span className="wordmark-dot" />
            Dog Food Helper
          </Link>
          <Link href="/dogs" className="btn-ghost btn-sm">
            Your dogs
          </Link>
        </div>
      </header>

      <main className="container-narrow">
        <p className="eyebrow">Account</p>
        <h1 className="page-title mt-2">Your account</h1>

        <div className="card card-pad mt-6">
          <div className="flex items-center gap-3">
            <span className="signal-better">signed in</span>
          </div>
          <p className="help-text mt-3 break-all">
            Signed in as <span className="metric text-ink">{userId}</span>
          </p>

          <div className="hairline mt-5 pt-5">
            <button type="button" onClick={handleSignOut} className="btn-secondary">
              Sign out
            </button>
          </div>
        </div>

        <p className="muted mt-5 text-[14px]">
          <Link href="/dogs" className="font-semibold text-pine underline-offset-2 hover:underline">
            ← Back to your dogs
          </Link>
        </p>
      </main>
    </div>
  );
}
