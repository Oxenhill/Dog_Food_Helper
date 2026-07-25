'use client';

import { useEffect, useState } from 'react';
import { sessionAuthHeaders } from '@/lib/session';
import { UserProfile } from '@/lib/types';

type AdminUserRow = UserProfile & { email: string | null };

function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

/**
 * Admin user-management surface. Lists user_profiles enriched with email
 * (pulled server-side from auth.users, since user_profiles has no email
 * column) and lets an admin grant/revoke admin status. The current admin's
 * own row has its toggle disabled — the server independently rejects
 * self-demotion (POST /api/admin/users/[userId] returns 400), this is just
 * the matching UX so the control isn't shown as actionable when it can't work.
 */
export default function UsersAdmin() {
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);

  async function loadUsers() {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/admin/users', { headers: sessionAuthHeaders() });
      if (!res.ok) {
        setError(`Could not load users (${res.status}).`);
        return;
      }
      const json = await res.json();
      setUsers(json.users ?? []);
    } catch {
      setError('Could not load users.');
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const res = await fetch('/api/auth/me', { headers: sessionAuthHeaders() });
        if (active && res.ok) {
          const me = await res.json();
          setCurrentUserId(me?.user?.id ?? null);
        }
      } catch {
        // ignore — self-row disabling is UX only, server enforces the real guard
      }
    })();
    void loadUsers();
    return () => {
      active = false;
    };
  }, []);

  async function toggleAdmin(user: AdminUserRow) {
    const grantingAdmin = !user.is_admin;
    if (!grantingAdmin) {
      const confirmed = window.confirm(
        `Revoke admin access for ${user.email ?? user.display_name ?? user.id}?`,
      );
      if (!confirmed) return;
    }

    setBusyId(user.id);
    setError('');
    try {
      const res = await fetch(`/api/admin/users/${user.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...sessionAuthHeaders() },
        body: JSON.stringify({ is_admin: grantingAdmin }),
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.error ?? `Could not update user (${res.status}).`);
        return;
      }
      await loadUsers();
    } catch {
      setError('Could not update user.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-3">
        <p className="help-text">
          Grant or revoke Studio admin access. Admins cannot change their own status here.
        </p>
        <button
          type="button"
          onClick={() => void loadUsers()}
          className="btn-secondary btn-sm shrink-0"
        >
          {loading ? 'Loading…' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="callout-alarm" role="alert">
          {error}
        </div>
      )}

      {!loading && users.length === 0 && !error && (
        <p className="muted text-[14px]">No users found.</p>
      )}

      <div className="flex flex-col gap-3">
        {users.map((u) => {
          const isSelf = currentUserId === u.id;
          return (
            <div key={u.id} className="card card-pad">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-ink">{u.email ?? '—'}</span>
                    {u.is_admin ? (
                      <span className="badge-pine">admin</span>
                    ) : (
                      <span className="badge-neutral">owner</span>
                    )}
                  </div>
                  {u.display_name && <p className="help-text mt-1">{u.display_name}</p>}
                  <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-[13px]">
                    <span className="muted">
                      Last active: <span className="metric">{fmtDate(u.last_active_at)}</span>
                    </span>
                    <span className="muted">
                      Created: <span className="metric">{fmtDate(u.created_at)}</span>
                    </span>
                  </div>
                </div>

                <div className="flex shrink-0 flex-col items-end gap-1">
                  <button
                    type="button"
                    onClick={() => void toggleAdmin(u)}
                    disabled={isSelf || busyId === u.id}
                    className={u.is_admin ? 'btn-danger btn-sm' : 'btn-secondary btn-sm'}
                  >
                    {busyId === u.id
                      ? 'Saving…'
                      : u.is_admin
                        ? 'Revoke admin'
                        : 'Grant admin'}
                  </button>
                  {isSelf && <span className="help-text">This is you</span>}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
