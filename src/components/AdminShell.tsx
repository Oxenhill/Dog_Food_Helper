'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import Link from 'next/link';
import { getAccessToken, sessionAuthHeaders, clearSession } from '@/lib/session';

/**
 * Shared chrome + access guard for every /admin page. Fail-closed:
 *   - no stored session -> redirect to /signin;
 *   - session but not is_admin (checked server-side via /api/auth/me) ->
 *     redirect to /dogs.
 * Only renders admin content once the server has confirmed is_admin. This is
 * the client-side gate; every admin API route independently re-checks
 * requireAdmin server-side, so this is convenience/UX, not the security
 * boundary.
 */
const NAV: { href: string; label: string }[] = [
  { href: '/admin', label: 'Dashboard' },
  { href: '/admin/foods', label: 'Foods' },
  { href: '/admin/contraindications', label: 'Contraindications' },
  { href: '/admin/research', label: 'Research' },
  { href: '/admin/review-queue', label: 'Review queue' },
  { href: '/admin/contributions', label: 'Contributed' },
  { href: '/admin/users', label: 'Users' },
  { href: '/admin/charts', label: 'Chart art' },
];

export default function AdminShell({
  children,
  eyebrow,
  title,
}: {
  children: React.ReactNode;
  eyebrow?: string;
  title?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const [state, setState] = useState<'checking' | 'ok' | 'denied'>('checking');

  useEffect(() => {
    let active = true;
    (async () => {
      const token = getAccessToken();
      if (!token) {
        router.replace('/signin');
        return;
      }
      try {
        const res = await fetch('/api/auth/me', { headers: sessionAuthHeaders() });
        if (!active) return;
        if (!res.ok) {
          router.replace('/signin');
          return;
        }
        const me = await res.json();
        if (!active) return;
        if (me?.is_admin === true) {
          setState('ok');
        } else {
          setState('denied');
          router.replace('/dogs');
        }
      } catch {
        if (active) router.replace('/signin');
      }
    })();
    return () => {
      active = false;
    };
  }, [router]);

  function handleSignOut() {
    clearSession();
    router.push('/');
  }

  if (state !== 'ok') {
    return (
      <div className="app-shell">
        <main className="container-page">
          <p className="muted">
            {state === 'denied' ? 'Not authorised — redirecting…' : 'Checking access…'}
          </p>
        </main>
      </div>
    );
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="app-header-inner">
          <Link href="/admin" className="wordmark">
            <span className="wordmark-dot" />
            Bowl <span className="muted font-sans font-normal">· admin</span>
          </Link>
          <button type="button" onClick={handleSignOut} className="btn-ghost btn-sm">
            Sign out
          </button>
        </div>
        <nav
          aria-label="Admin sections"
          className="mx-auto flex w-full max-w-3xl gap-1 overflow-x-auto px-5 pb-2 sm:px-6"
        >
          {NAV.map((item) => {
            const active = pathname === item.href;
            return (
              <Link
                key={item.href}
                href={item.href}
                aria-current={active ? 'page' : undefined}
                className={`${active ? 'btn-secondary' : 'btn-ghost'} btn-sm whitespace-nowrap`}
              >
                {item.label}
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="container-page">
        {(eyebrow || title) && (
          <div className="mb-6">
            {eyebrow && <p className="eyebrow">{eyebrow}</p>}
            {title && <h1 className="page-title mt-2">{title}</h1>}
          </div>
        )}
        {children}
      </main>
    </div>
  );
}
