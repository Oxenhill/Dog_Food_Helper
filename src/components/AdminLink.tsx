'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { getAccessToken, sessionAuthHeaders } from '@/lib/session';

/**
 * Renders an "Admin" link in an owner-facing header, but only for accounts the
 * server confirms are admins (is_admin from /api/auth/me — never a client
 * field). Nothing renders for regular owners. Gives an admin who's browsing the
 * owner flow a persistent path into the admin area.
 */
export default function AdminLink({ className = 'btn-ghost btn-sm' }: { className?: string }) {
  const [isAdmin, setIsAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    if (!getAccessToken()) return;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { headers: sessionAuthHeaders() });
        if (!active || !res.ok) return;
        const me = await res.json();
        if (active && me?.is_admin === true) setIsAdmin(true);
      } catch {
        /* silently render nothing on failure */
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  if (!isAdmin) return null;
  return (
    <Link href="/admin" className={className}>
      Admin
    </Link>
  );
}
