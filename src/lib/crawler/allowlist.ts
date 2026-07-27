import { supabaseAdmin } from '../supabase';

/**
 * The allowlist gate for Phase 2 crawling. Deliberately three separate
 * conditions, not one — the bug this project already hit once was
 * `approved = true` with both review dates left null. Never collapse these
 * back into a single flag.
 */

export interface AllowlistEntry {
  domain: string;
  approved: boolean;
  robots_txt_checked_at: string | null;
  tos_reviewed_at: string | null;
}

export interface AllowlistCheckResult {
  allowed: boolean;
  reason: string;
}

/** Pure — no DB access, so this is the part that's actually unit-tested. */
export function evaluateAllowlistEntry(entry: AllowlistEntry | null): AllowlistCheckResult {
  if (!entry) {
    return { allowed: false, reason: 'domain is not present in source_domain_allowlist' };
  }
  if (!entry.robots_txt_checked_at) {
    return { allowed: false, reason: 'robots.txt has not been reviewed for this domain' };
  }
  if (!entry.tos_reviewed_at) {
    return { allowed: false, reason: 'Terms of Service has not been reviewed for this domain' };
  }
  if (!entry.approved) {
    return { allowed: false, reason: 'domain has been reviewed but is not approved' };
  }
  return { allowed: true, reason: 'approved, with both robots.txt and ToS review recorded' };
}

/** Looks up one domain by exact match. Callers pass the hostname, e.g. "www.zooplus.co.uk" is not "zooplus.co.uk" — normalize before calling. */
export async function isDomainCrawlable(domain: string): Promise<AllowlistCheckResult> {
  const { data, error } = await supabaseAdmin
    .from('source_domain_allowlist')
    .select('domain, approved, robots_txt_checked_at, tos_reviewed_at')
    .eq('domain', domain)
    .maybeSingle();

  if (error) {
    return { allowed: false, reason: `allowlist lookup failed: ${error.message}` };
  }
  return evaluateAllowlistEntry(data as AllowlistEntry | null);
}

/** Strips a leading "www." so "www.zooplus.co.uk" and "zooplus.co.uk" resolve to the same allowlist row. */
export function normalizeDomain(hostname: string): string {
  return hostname.trim().toLowerCase().replace(/^www\./, '');
}
