import { NextRequest } from 'next/server';
import { requireAdmin } from './serverAdminAuth';

/**
 * Shared cron-route auth gate (Phase 6, hardened).
 *
 * Two legitimate ways to call these routes, both via the same
 * `Authorization: Bearer <token>` header:
 *   1. Vercel Cron sends `Authorization: Bearer ${CRON_SECRET}` automatically
 *      when a cron job is configured with that convention
 *      (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs)
 *      — a static machine secret, checked first (cheap string compare).
 *   2. A human manually triggering a job sends their real Supabase session
 *      access token; this is verified via requireAdmin() (real admin role
 *      check, replacing the old shared RESEARCH_INGEST_ADMIN_TOKEN/
 *      x-admin-token stopgap).
 */
export async function isCronAuthorized(request: NextRequest): Promise<boolean> {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const admin = await requireAdmin(request);
  return admin !== null;
}
