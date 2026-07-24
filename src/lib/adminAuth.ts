'use client';

/**
 * Back-compat shim. Admin auth is now part of the unified src/lib/session.ts —
 * the same single session used for owner requests. The admin API routes verify
 * the bearer token AND check user_profiles.is_admin server-side
 * (src/lib/serverAuth.ts). This file is kept so existing imports keep working:
 *   - adminAuthHeaders() -> Authorization: Bearer <access_token>
 *   - getAdminToken()    -> the current access token
 *   - clearAdminToken()  -> full sign-out
 * Prefer importing from '@/lib/session' in new code. Admin sign-in forms should
 * call saveSession(session) instead of the deprecated setAdminToken() below.
 */
export {
  getAccessToken as getAdminToken,
  sessionAuthHeaders as adminAuthHeaders,
  clearSession as clearAdminToken,
} from './session';

/**
 * @deprecated No-op. Call saveSession(session) from '@/lib/session' with the
 * full server-returned session so refresh + user id are captured too.
 */
export function setAdminToken(_token: string) {
  /* intentionally a no-op — see saveSession() */
}
