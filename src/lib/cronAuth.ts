import { NextRequest } from 'next/server';

/**
 * Shared cron-route auth gate (Phase 6).
 *
 * Same category of stopgap as the RESEARCH_INGEST_ADMIN_TOKEN pattern used
 * throughout Phases 4-5 (no real auth/role system exists yet — see
 * BUILD_PROGRESS.md). Vercel Cron sends `Authorization: Bearer
 * ${CRON_SECRET}` automatically when a cron job is configured with that
 * convention (https://vercel.com/docs/cron-jobs/manage-cron-jobs#securing-cron-jobs);
 * this also accepts the same `x-admin-token` header the rest of the app
 * already uses, so these routes can be triggered manually for testing with
 * the same token an admin already has, without requiring a second secret to
 * be provisioned just for this phase.
 */
export function isCronAuthorized(request: NextRequest): boolean {
  const cronSecret = process.env.CRON_SECRET;
  const authHeader = request.headers.get('authorization');
  if (cronSecret && authHeader === `Bearer ${cronSecret}`) return true;

  const adminToken = process.env.RESEARCH_INGEST_ADMIN_TOKEN;
  const providedAdminToken = request.headers.get('x-admin-token');
  if (adminToken && providedAdminToken === adminToken) return true;

  return false;
}
