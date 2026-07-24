'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { setUserId } from '@/lib/clientAuth';

// Owner-facing sign-up page (was entirely missing — see /signin's header
// comment for the same context). Posts to the existing POST /api/auth/signup
// route.
//
// POST /api/auth/signup only ever returns `{ user }`, never a session (it
// calls supabase.auth.signUp(), which doesn't return an active session when
// email confirmation is required) — so there is no access token to store
// here even if we wanted one. We store the returned user.id via
// clientAuth.ts's setUserId() regardless: the x-user-id header this app's
// owner-facing routes read is an unverified stopgap already (see
// clientAuth.ts), so setting it immediately post-signup is consistent with
// that existing trust level, not a new gap. If email confirmation turns out
// to be enabled on this Supabase project, sign-in itself would still work
// once confirmed — this page can't currently detect confirmation status
// either way (no such flag comes back from the API).
//
// Redirects to /dogs, the owner's dog list — that page shows an empty state
// with a link into /dogs/new if they have no dogs yet, rather than forcing a
// first-dog-profile step directly into the signup flow itself.
export default function SignUpPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, display_name: displayName || undefined }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Sign-up failed (${res.status})`);
        return;
      }
      if (!json.user?.id) {
        setError('Account created, but no user id was returned.');
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
        <p className="eyebrow">Get started</p>
        <h1 className="page-title mt-2">Create your account</h1>
        <p className="lead mt-2">Start tracking what actually works for your dog.</p>

        <div className="card card-pad mt-6">
          {error && (
            <div className="callout-alarm mb-4" role="alert">
              {error}
            </div>
          )}
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="field">
              <label className="label" htmlFor="displayName">
                Display name <span className="muted font-normal">(optional)</span>
              </label>
              <input
                id="displayName"
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                className="input"
                autoComplete="name"
              />
            </div>
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
                minLength={6}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input"
                autoComplete="new-password"
              />
              <p className="help-text">At least 6 characters.</p>
            </div>
            <button type="submit" disabled={submitting} className="btn-primary btn-block mt-1">
              {submitting ? 'Creating account…' : 'Create account'}
            </button>
          </form>
        </div>

        <p className="muted mt-5 text-[14px]">
          Already have an account?{' '}
          <Link href="/signin" className="font-semibold text-pine underline-offset-2 hover:underline">
            Sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
