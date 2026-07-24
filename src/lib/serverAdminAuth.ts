import { NextRequest } from 'next/server';
import { supabaseAdmin } from './supabase';

/**
 * Real admin auth, replacing the RESEARCH_INGEST_ADMIN_TOKEN shared-secret
 * stopgap that every admin-gated route (research ingest, ingredient review,
 * review-queue listing, photo signed-URLs, and — via cronAuth.ts — the three
 * cron routes for manual triggering) reused since Phase 4.
 *
 * Model: the caller sends `Authorization: Bearer <supabase_access_token>` —
 * the real session token from `supabase.auth.signInWithPassword` /
 * `getSession()`, not a static secret. This is verified against Supabase
 * Auth (`auth.getUser`), then `user_profiles.is_admin` is checked for that
 * user id. Both checks run through supabaseAdmin (service role) so they work
 * regardless of RLS policy on user_profiles.
 *
 * Server-only — deliberately not `'use client'` (compare src/lib/adminAuth.ts,
 * which is the client-side localStorage token holder).
 */
export interface AdminUser {
  id: string;
  email: string | null;
}

export async function requireAdmin(request: NextRequest): Promise<AdminUser | null> {
  const authHeader = request.headers.get('authorization');
  if (!authHeader?.startsWith('Bearer ')) return null;
  const token = authHeader.slice('Bearer '.length).trim();
  if (!token) return null;

  const { data: userData, error: userError } = await supabaseAdmin.auth.getUser(token);
  if (userError || !userData?.user) return null;

  const { data: profile, error: profileError } = await supabaseAdmin
    .from('user_profiles')
    .select('is_admin')
    .eq('id', userData.user.id)
    .maybeSingle();

  if (profileError || !profile?.is_admin) return null;

  return { id: userData.user.id, email: userData.user.email ?? null };
}
