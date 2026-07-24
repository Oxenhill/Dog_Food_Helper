'use client';

import { createClient, type Session, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Unified client-side session for the WHOLE app (owners AND admins).
 *
 * Replaces the two former stopgaps:
 *   - clientAuth.ts (localStorage `userId`, sent as the UNVERIFIED `x-user-id`
 *     header — any caller could forge it), and
 *   - adminAuth.ts (a separately-stored admin access token).
 *
 * Now there is ONE session. On sign-in the server returns a real Supabase
 * session (access + refresh tokens); we store it and arm supabase-js's own
 * auto-refresh so the access token stays valid without bouncing the user
 * hourly. Every authenticated request carries `Authorization: Bearer
 * <access_token>`, which the server verifies (src/lib/serverAuth.ts). Identity
 * and is_admin are derived server-side from that token — never trusted from the
 * client.
 *
 * `authHeaders()` is intentionally SYNCHRONOUS so existing call sites (and the
 * clientAuth/adminAuth compat shims) don't have to change: we keep a plain copy
 * of the current access token in localStorage, refreshed via onAuthStateChange.
 *
 * Trade-off (flagged in BUILD_PROGRESS): the token lives in localStorage, same
 * trust model the admin path already used. An httpOnly-cookie SSR session
 * (@supabase/ssr) would be stronger and is the recommended future hardening.
 */

const STORAGE_KEY = 'dogFoodHelper.session.v1';

interface StoredSession {
  access_token: string;
  refresh_token: string;
  user_id: string;
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

let browserClient: SupabaseClient | null = null;
let initialised = false;

function read(): StoredSession | null {
  if (typeof window === 'undefined') return null;
  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as StoredSession;
    if (!parsed?.access_token || !parsed?.user_id) return null;
    return parsed;
  } catch {
    return null;
  }
}

function write(session: StoredSession) {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
}

function erase() {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
}

/**
 * Lazily create a browser Supabase client (custom storageKey to avoid clashing
 * with the server-side client in lib/supabase.ts) and arm auto-refresh from the
 * currently-stored session. Subscribing to auth state keeps our synchronous
 * localStorage copy of the access token fresh after every silent refresh.
 */
function getClient(): SupabaseClient | null {
  if (typeof window === 'undefined') return null;
  if (browserClient) return browserClient;
  if (!supabaseUrl || !supabaseAnonKey) return null;

  browserClient = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      detectSessionInUrl: false,
      storageKey: 'dogFoodHelper.sb.v1',
    },
  });

  browserClient.auth.onAuthStateChange((_event, session) => {
    if (session?.access_token && session?.user?.id) {
      write({
        access_token: session.access_token,
        refresh_token: session.refresh_token,
        user_id: session.user.id,
      });
    } else if (_event === 'SIGNED_OUT') {
      erase();
    }
  });

  return browserClient;
}

/**
 * Arm auto-refresh from the stored session on first load, so a returning user's
 * token gets silently refreshed. Safe to call repeatedly; only runs once.
 */
function ensureInit() {
  if (initialised) return;
  initialised = true;
  const stored = read();
  const client = getClient();
  if (stored && client) {
    void client.auth.setSession({
      access_token: stored.access_token,
      refresh_token: stored.refresh_token,
    });
  }
}

if (typeof window !== 'undefined') {
  ensureInit();
}

/**
 * Persist a freshly-created session (from POST /api/auth/signin or /signup's
 * returned `session`) and arm auto-refresh. Call this on successful login.
 */
export function saveSession(session: Session | null | undefined) {
  if (!session?.access_token || !session?.user?.id) return;
  write({
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    user_id: session.user.id,
  });
  const client = getClient();
  if (client) {
    void client.auth.setSession({
      access_token: session.access_token,
      refresh_token: session.refresh_token,
    });
  }
}

/** Current access token, or null. Synchronous (reads localStorage). */
export function getAccessToken(): string | null {
  ensureInit();
  return read()?.access_token ?? null;
}

/** Current signed-in user id, or null. Synchronous. */
export function getSessionUserId(): string | null {
  ensureInit();
  return read()?.user_id ?? null;
}

/** True if a session is stored. */
export function isSignedIn(): boolean {
  return getAccessToken() !== null;
}

/** The bearer header every authenticated request should carry. */
export function sessionAuthHeaders(): Record<string, string> {
  const token = getAccessToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/** Clear the session locally and revoke it with Supabase (best-effort). */
export function clearSession() {
  erase();
  const client = getClient();
  if (client) void client.auth.signOut();
}
