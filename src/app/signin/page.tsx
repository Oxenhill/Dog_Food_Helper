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
    <main className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-md mx-auto bg-white rounded-lg shadow p-6 space-y-4">
        <h1 className="text-2xl font-bold text-gray-900">Sign In</h1>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <form onSubmit={handleSubmit} className="space-y-3">
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
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full border border-gray-300 rounded-lg p-2 text-sm"
            placeholder="Password"
            autoComplete="current-password"
          />
          <button
            type="submit"
            disabled={submitting}
            className="w-full bg-blue-600 text-white px-6 py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {submitting ? 'Signing in…' : 'Sign In'}
          </button>
        </form>
        <p className="text-sm text-gray-600">
          New here?{' '}
          <Link href="/signup" className="text-blue-600 underline">
            Create an account
          </Link>
        </p>
      </div>
    </main>
  );
}
