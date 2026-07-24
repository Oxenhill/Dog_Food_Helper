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
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Create Account</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            type="text"
            value={displayName}
            onChange={(e) => setDisplayName(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            placeholder="Display name (optional)"
            autoComplete="name"
          />
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            placeholder="Email"
            autoComplete="email"
          />
          <input
            type="password"
            required
            minLength={6}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            placeholder="Password"
            autoComplete="new-password"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-green-600 text-white px-6 py-2 rounded-lg hover:bg-green-700 disabled:opacity-50"
          >
            {submitting ? 'Creating account…' : 'Sign Up'}
          </button>
        </form>
        <p className="text-sm text-gray-600">
          Already have an account?{' '}
          <Link href="/signin" className="text-blue-600 underline">
            Sign in
          </Link>
        </p>
      </div>
    </main>
  );
}
