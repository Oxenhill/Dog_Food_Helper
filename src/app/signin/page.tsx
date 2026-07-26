'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { saveSession } from '@/lib/session';

// Unified sign-in for owners AND admins. Posts to POST /api/auth/signin, then
// stores the real Supabase session (saveSession) — the single credential every
// authenticated route now verifies server-side. Role-aware routing: we ask the
// server (/api/auth/me) whether this account is an admin and route to /admin or
// /dogs accordingly. is_admin is derived server-side from user_profiles, never
// from any client-supplied value.
export default function SignInPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    // Read ?created=1 without useSearchParams (which would force a Suspense
    // boundary for static generation).
    if (new URLSearchParams(window.location.search).get('created') === '1') {
      setInfo('Account created. Sign in to continue — if you were asked to confirm your email, do that first.');
    }
  }, []);

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
      if (!json.session?.access_token) {
        setError('Signed in, but no session was returned.');
        return;
      }
      saveSession(json.session);
      let isAdmin = false;
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${json.session.access_token}` },
        });
        if (meRes.ok) isAdmin = (await meRes.json())?.is_admin === true;
      } catch {
        // On any lookup failure, fall through to the owner route.
      }
      router.push(isAdmin ? '/admin' : '/dogs');
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
            Bowl
          </Link>
        </div>
      </header>

      <main className="container-narrow">
        <Image
          src="/bowl-logo.png"
          alt="Bowl — Every dog is different. Every choice matters. By Dog Smart."
          width={140}
          height={140}
          sizes="140px"
          priority
          className="mb-4 h-auto w-[140px]"
        />
        <p className="eyebrow">Welcome back</p>
        <h1 className="page-title mt-2">Sign in</h1>
        <p className="lead mt-2">Pick up where you left off with your dogs.</p>

        <div className="card card-pad mt-6">
          {info && (
            <div className="callout-info mb-4" role="status">
              {info}
            </div>
          )}
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
