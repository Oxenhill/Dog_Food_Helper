'use client';

/**
 * Back-compat shim. Owner-side auth now lives in the unified src/lib/session.ts
 * (one real Supabase session for owners AND admins, sent as a verified bearer
 * token — no more unverified x-user-id header). This file is kept so existing
 * imports keep working without edits:
 *   - authHeaders()  -> Authorization: Bearer <access_token>  (was x-user-id)
 *   - getUserId()    -> the signed-in user's id
 *   - clearUserId()  -> full sign-out
 * Prefer importing from '@/lib/session' in new code. Sign-in pages should call
 * saveSession() (in session.ts) instead of the deprecated setUserId() below.
 */
export {
  getSessionUserId as getUserId,
  sessionAuthHeaders as authHeaders,
  clearSession as clearUserId,
} from './session';

/**
 * @deprecated No-op. A user id alone can't establish a verified session; call
 * saveSession(session) from '@/lib/session' with the server-returned session.
 */
export function setUserId(_userId: string) {
  /* intentionally a no-op — see saveSession() */
}
