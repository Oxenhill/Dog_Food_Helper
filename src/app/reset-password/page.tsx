'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { establishRecoverySession, updatePassword, clearSession } from '@/lib/session';

type Status = 'checking' | 'ready' | 'invalid';

// Landing page for the link Supabase emails from resetPasswordForEmail().
// This app's browser client has detectSessionInUrl: false (src/lib/session.ts),
// so the implicit-flow recovery tokens Supabase appends to the URL hash
// (#access_token=...&refresh_token=...&type=recovery) are parsed manually
// here rather than auto-detected.
export default function ResetPasswordPage() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>('checking');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);

  useEffect(() => {
    const hash = window.location.hash.startsWith('#')
      ? window.location.hash.slice(1)
      : window.location.hash;
    const params = new URLSearchParams(hash);
    const accessToken = params.get('access_token');
    const refreshToken = params.get('refresh_token');
    const type = params.get('type');

    if (type !== 'recovery' || !accessToken || !refreshToken) {
      setStatus('invalid');
      return;
    }

    (async () => {
      const { error: sessionError } = await establishRecoverySession(accessToken, refreshToken);
      // Strip the tokens from the visible URL either way -- they're single-use
      // and shouldn't linger in browser history / be re-shared via the URL bar.
      window.history.replaceState(null, '', window.location.pathname);
      setStatus(sessionError ? 'invalid' : 'ready');
    })();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    if (password !== confirmPassword) {
      setError('Passwords do not match.');
      return;
    }
    setSubmitting(true);
    try {
      const { error: updateError } = await updatePassword(password);
      if (updateError) {
        setError(updateError.message);
        return;
      }
      // Force a fresh sign-in with the new password rather than carrying the
      // recovery session forward as a normal logged-in session.
      clearSession();
      setDone(true);
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
        <p className="eyebrow">Reset your password</p>
        <h1 className="page-title mt-2">Choose a new password</h1>

        <div className="card card-pad mt-6">
          {status === 'checking' && <p className="muted">Checking your reset link…</p>}

          {status === 'invalid' && (
            <>
              <div className="callout-alarm mb-4" role="alert">
                This reset link is invalid or has expired.
              </div>
              <Link href="/forgot-password" className="btn-primary btn-block">
                Request a new link
              </Link>
            </>
          )}

          {status === 'ready' && !done && (
            <form onSubmit={handleSubmit} className="flex flex-col gap-4">
              {error && (
                <div className="callout-alarm" role="alert">
                  {error}
                </div>
              )}
              <div className="field">
                <label className="label" htmlFor="password">
                  New password
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
              <div className="field">
                <label className="label" htmlFor="confirmPassword">
                  Confirm new password
                </label>
                <input
                  id="confirmPassword"
                  type="password"
                  required
                  minLength={6}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  className="input"
                  autoComplete="new-password"
                />
              </div>
              <button type="submit" disabled={submitting} className="btn-primary btn-block mt-1">
                {submitting ? 'Updating…' : 'Update password'}
              </button>
            </form>
          )}

          {status === 'ready' && done && (
            <>
              <p role="status" className="mb-4">
                Password updated. Sign in with your new password.
              </p>
              <button
                type="button"
                onClick={() => router.push('/signin')}
                className="btn-primary btn-block"
              >
                Go to sign in
              </button>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
