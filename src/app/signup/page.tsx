'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { saveSession } from '@/lib/session';

// Owner-facing sign-up page. Posts to POST /api/auth/signup, which returns
// `{ user }` but no session (supabase.auth.signUp() doesn't return an active
// session, and may require email confirmation). To land the user in a usable
// signed-in state we immediately attempt a sign-in with the same credentials:
//   - success -> store the real session (saveSession) and route by role
//     (admin -> /admin via the ADMIN_EMAILS bootstrap, owner -> /dogs);
//   - failure (e.g. email confirmation required) -> send them to /signin with
//     a clear message rather than a broken half-signed-in state.
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
      // Establish a real session by signing in with the same credentials.
      const signinRes = await fetch('/api/auth/signin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });
      const signinJson = await signinRes.json();
      if (!signinRes.ok || !signinJson.session?.access_token) {
        // Most likely email confirmation is required — the account exists, but
        // there's no session yet. Route to sign-in with context.
        router.push('/signin?created=1');
        return;
      }
      await saveSession(signinJson.session);
      let isAdmin = false;
      try {
        const meRes = await fetch('/api/auth/me', {
          headers: { Authorization: `Bearer ${signinJson.session.access_token}` },
        });
        if (meRes.ok) isAdmin = (await meRes.json())?.is_admin === true;
      } catch {
        // Fall through to the owner route on any lookup failure.
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
