'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setUserId } from '@/lib/clientAuth';

// Owner-facing sign-in page (was entirely missing — the landing page's
// "Sign In" button had no href/onClick until this was built). Posts to the
// existing POST /api/auth/signin route and stores the returned user id via
// clientAuth.ts's setUserId(), matching the x-user-id-header stopgap every
// other authenticated owner-facing route already depends on. This is
// deliberately NOT the same mechanism as the admin pages (adminAuth.ts),
// which store a real Supabase access token for src/lib/serverAdminAuth.ts's
// session check — the two auth paths are intentionally different right now.
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Sign-in failed (${res.status})`);
        return;
      }
      if (!json.user?.id) {
        setError('Signed in, but no user id was returned.');
        return;
      }
      setUserId(json.user.id);
      router.push('/dogs');
    } catch {
      setError('Something went wrong. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/" className="wordmark">
            <span className="wordmark-dot" />
            Dog Food Helper
          </Link>
        </div>
      </header>

      <main className="container-narrow">
        <p className="eyebrow">Welcome back</p>
        <h1 className="page-title mt-2">Sign in</h1>
        <p className="lead mt-2">Pick up where you left off with your dogs.</p>

        <div className="card card-pad mt-6">
          {error && (
            <div className="callout-alarm mb-4" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="field">
              <label className="label" htmlFor="email">
                Email
              </label>
              <input
                id="email"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="input"
                autoComplete="email"
              />
            </div>
            <div className="field">
              <label className="label" htmlFor="password">
                Password
              </label>
              <input
                id="password"
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoComplete="current-password"
              />
            </div>
            <button type="submit" disabled={submitting} className="btn-primary btn-block mt-1">
              {submitting ? 'Signing in…' : 'Sign in'}
            </button>
          </form>
        </div>

        <p className="muted mt-5 text-[14px]">
          New here?{' '}
          <Link href="/signup" className="font-semibold text-pine underline-offset-2 hover:underline">
            Create an account
          </Link>
        </p>
      </main>
    </div>
  );
}
