import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';

/**
 * Unified server-side identity for BOTH owner and admin routes.
 *
 * Every authenticated request — owner or admin — now carries the same
 * credential: `Authorization: Bearer <supabase_access_token>` (the real
 * session token from supabase.auth.signInWithPassword). This module verifies
 * that token against Supabase Auth and, for admin routes, additionally checks
 * `user_profiles.is_admin`.
 *
 * This replaces the previous split:
 *   - owner routes trusted an UNVERIFIED `x-user-id` header (any caller could
 *     impersonate any user by setting it) — the core vulnerability WS1 closes;
 *   - admin routes already used this bearer-verification pattern (formerly
 *     src/lib/serverAdminAuth.ts, now re-exported from here).
 *
 * Fail-closed: any missing/invalid token, auth error, or (for admin) missing
 * is_admin returns null. Callers translate null to a 401/404 — they must never
 * proceed on a null identity.
 *
 * All lookups go through supabaseAdmin (service role) so they are independent
 * of RLS policy on user_profiles.
 *
 * Server-only. Do NOT mark 'use client'.
 */
export interface SessionUser {
  id: string;
  email: string | null;
}

export interface AdminUser extends SessionUser {}

function bearerToken(request: NextRequest): string | null {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  return token || null;
}

/**
 * Verify the request's bearer token and return the authenticated user, or null.
 * This is the single source of server-verified identity for owner routes.
 */
export async function getSessionUser(request: NextRequest): Promise<SessionUser | null> {
  const token = bearerToken(request);
  if (!token) return null;

  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data?.user) return null;

  return { id: data.user.id, email: data.user.email ?? null };
}

/**
 * Owner-route guard. Returns the authenticated user or null. A null result
 * means the caller must reject the request (401) — there is no fallback to an
 * unverified header any more.
 */
export async function requireUser(request: NextRequest): Promise<SessionUser | null> {
  return getSessionUser(request);
}

/**
 * Admin-route guard: a verified session AND user_profiles.is_admin = true.
 * Returns null (fail-closed) for a non-admin or unauthenticated caller.
 */
export async function requireAdmin(request: NextRequest): Promise<AdminUser | null> {
  const user = await getSessionUser(request);
  if (!user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('is_admin')
    .eq('id', user.id)
    .maybeSingle();

  if (profileError || !profile?.is_admin) return null;

  return user;
}
