'use client';

import { useState } from 'react';
import Link from 'next/link';
import Image from 'next/image';

// Requests a Supabase password-recovery email via POST /api/auth/forgot-password.
// Always shows the same success message regardless of whether the email
// matched an account -- Supabase itself doesn't leak that, and neither should
// this page.
export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [sent, setSent] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      if (!res.ok) {
        const json = await res.json().catch(() => ({}));
        setError(json.error ?? `Request failed (${res.status})`);
        return;
      }
      setSent(true);
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
        <h1 className="page-title mt-2">Forgot password</h1>
        <p className="lead mt-2">We'll email you a link to choose a new password.</p>

        <div className="card card-pad mt-6">
          {sent ? (
            <p role="status">
              If an account exists for that email, a reset link has been sent. Check your inbox
              (and spam folder).
            </p>
          ) : (
            <>
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
                <button type="submit" disabled={submitting} className="btn-primary btn-block mt-1">
                  {submitting ? 'Sending…' : 'Send reset link'}
                </button>
              </form>
            </>
          )}
        </div>

        <p className="muted mt-5 text-[14px]">
          <Link href="/signin" className="font-semibold text-pine underline-offset-2 hover:underline">
            Back to sign in
          </Link>
        </p>
      </main>
    </div>
  );
}
