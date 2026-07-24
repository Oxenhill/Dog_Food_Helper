'use client';

// Minimal client-side admin-token helper, same pattern/limitations as
// src/lib/clientAuth.ts. The admin review-queue page needs *some* way to
// attach the shared-secret x-admin-token header (RESEARCH_INGEST_ADMIN_TOKEN
// stopgap, reused per Part B item 4's instruction) to its requests without
// hardcoding the secret into client-shipped JS. NOT a real admin/session
// auth system — see BUILD_PROGRESS.md.
const ADMIN_TOKEN_KEY = 'dogFoodHelper.adminToken';

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
  return token ? { 'x-admin-token': token } : {};
}
