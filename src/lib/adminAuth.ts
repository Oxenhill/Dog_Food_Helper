'use client';

// Client-side admin session helper.
//
// Previously stored a static shared-secret (RESEARCH_INGEST_ADMIN_TOKEN)
// entered by hand. Now stores the real Supabase access token returned by
// POST /api/auth/signin — the admin routes verify it server-side via
// src/lib/serverAdminAuth.ts (session + user_profiles.is_admin check), not a
// static secret comparison. Still localStorage-based (no httpOnly cookie /
// refresh-token handling here) — acceptable for a small admin surface, but a
// real cookie-session layer would be a further improvement if this grows
// beyond a single owner/small staff.
const ADMIN_TOKEN_KEY = 'dogFoodHelper.adminAccessToken';

export function getAdminToken(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(ADMIN_TOKEN_KEY);
}

export function setAdminToken(token: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(ADMIN_TOKEN_KEY, token);
}

export function clearAdminToken() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(ADMIN_TOKEN_KEY);
}

export function adminAuthHeaders(): Record<string, string> {
  const token = getAdminToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}
