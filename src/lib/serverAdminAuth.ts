/**
 * Back-compat shim. Admin auth now lives in the unified src/lib/serverAuth.ts
 * alongside owner-identity verification (both use the same bearer-token
 * session). This file is kept so existing imports
 * (`import { requireAdmin } from '@/lib/serverAdminAuth'`) keep working.
 * Prefer importing from '@/lib/serverAuth' in new code.
 */
export { requireAdmin } from './serverAuth';
export type { AdminUser } from './serverAuth';
