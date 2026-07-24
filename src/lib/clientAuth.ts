'use client';

// Minimal client-side session helper.
//
// Phase 1 didn't build a real session/cookie layer yet (its API routes read
// a plain x-user-id header, and the landing page's sign-in/sign-up buttons
// aren't wired up to anything). Phase 2's logging UI needs *some* way to
// attach the signed-in owner's id to requests, so this adds a tiny
// localStorage-backed helper rather than inventing a bigger auth system that
// isn't this phase's scope. Flagged in BUILD_PROGRESS.md — a proper session
// (e.g. Supabase's own client-side session persistence) should replace this
// when auth is revisited.
const USER_ID_KEY = 'dogFoodHelper.userId';

export function getUserId(): string | null {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(USER_ID_KEY);
}

export function setUserId(userId: string) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(USER_ID_KEY, userId);
}

export function clearUserId() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(USER_ID_KEY);
}

export function authHeaders(): Record<string, string> {
  const userId = getUserId();
  return userId ? { 'x-user-id': userId } : {};
}
