/**
 * GS1 registry verification for an owner-scanned/OCR'd barcode, on top of
 * the local mod-10 checksum already enforced before a GTIN is written to
 * `foods.gtin` (see src/lib/gtin.ts). The checksum only proves the number
 * is well-formed; this proves it corresponds to a real, GS1-licensed
 * product.
 *
 * IMPORTANT — read before wiring up real credentials:
 * "Verified by GS1" (gs1uk.org/our-services/data-services/verified-by-gs1)
 * is documented as a human-facing web search tool with a 30-searches/day
 * free cap. GS1 UK's actual programmatic option, the "GTIN Check API"
 * (gs1uk.org/standards-services/data-services/gtin-check-api), is
 * partner-gated: "only members who have been provided with an appropriate
 * 'key' may access the service", obtained by emailing gtincheck@gs1uk.org.
 * Neither publishes a public endpoint URL, header name, or request/response
 * schema — those need confirming directly with GS1 UK once a partner key
 * exists. Rather than guess at an endpoint and pretend it works, this
 * module is deliberately inert without real configuration: every lookup
 * resolves to `skipped_no_api_key` until GS1_API_BASE_URL and
 * GS1_API_KEY are actually set, so nothing is ever silently treated as
 * "verified" without a real registry response.
 */

import { supabaseAdmin } from './supabase';

const FREE_TIER_DAILY_LIMIT = 30;

export function isGs1Configured(): boolean {
  return Boolean(process.env.GS1_API_BASE_URL && process.env.GS1_API_KEY);
}

export interface Gs1VerifyResult {
  status: 'verified' | 'not_found' | 'mismatch' | 'failed' | 'skipped_no_api_key';
  response: unknown;
}

/**
 * Calls the configured GS1 endpoint for one GTIN. Structure (POST JSON over
 * HTTPS, bearer-style key) follows GS1 UK's own description of the GTIN
 * Check API's transport ("standard web API principles... POST request
 * interface over secure web HTTPS... JSON format"), but the exact request
 * body shape, header name, and response fields are NOT independently
 * confirmed — GS1 does not publish them. Treat the field mapping below as a
 * best-effort placeholder to adjust against GS1's real docs/support once
 * partner access exists, not as a verified integration.
 */
async function callGs1(gtin: string): Promise<Gs1VerifyResult> {
  const baseUrl = process.env.GS1_API_BASE_URL;
  const apiKey = process.env.GS1_API_KEY;
  if (!baseUrl || !apiKey) {
    return { status: 'skipped_no_api_key', response: null };
  }

  try {
    const res = await fetch(baseUrl, {
      method: 'POST',
      headers: {
        'content-type': 'application/json',
        authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ gtin }),
    });

    if (!res.ok) {
      return { status: 'failed', response: { httpStatus: res.status, body: await res.text().catch(() => null) } };
    }

    const body = await res.json();
    // Placeholder field names — confirm against GS1's actual response shape
    // once partner access exists. Never treat an ambiguous response as
    // "verified"; default to "failed" so a schema mismatch surfaces as a
    // review item instead of a false positive.
    if (body?.found === true || body?.matched === true) {
      return { status: 'verified', response: body };
    }
    if (body?.found === false || body?.matched === false) {
      return { status: 'not_found', response: body };
    }
    return { status: 'failed', response: body };
  } catch (err) {
    return { status: 'failed', response: { error: err instanceof Error ? err.message : String(err) } };
  }
}

/** How many real GS1 lookups (not pending, not skipped) have been recorded since UTC midnight today. */
export async function todaysLookupCount(): Promise<number> {
  const startOfDayUtc = new Date();
  startOfDayUtc.setUTCHours(0, 0, 0, 0);

  const { count, error } = await supabaseAdmin
    .from('gtin_verifications')
    .select('id', { count: 'exact', head: true })
    .gte('checked_at', startOfDayUtc.toISOString())
    .not('status', 'in', '(pending,skipped_no_api_key)');

  if (error) throw error;
  return count ?? 0;
}

/** Queues a GTIN for GS1 verification. Never calls GS1 synchronously — see module docblock on why this is async. */
export async function enqueueGtinVerification(
  gtin: string,
  context: { foodId?: string; submittedBy?: string; context?: string } = {}
): Promise<void> {
  const { error } = await supabaseAdmin.from('gtin_verifications').insert({
    gtin,
    context: context.context ?? 'label_photo',
    food_id: context.foodId ?? null,
    submitted_by: context.submittedBy ?? null,
    status: 'pending',
  });
  if (error) throw error;
}

export interface ProcessQueueResult {
  processed: number;
  verified: number;
  notFound: number;
  mismatch: number;
  failed: number;
  skippedNoApiKey: number;
  remainingBudgetToday: number;
}

/**
 * Processes pending rows up to the remaining daily budget (30 - lookups
 * already made today). Anything beyond budget stays `pending` — queued for
 * tomorrow, never dropped and never silently discarded. When GS1 isn't
 * configured yet, every pending row is marked `skipped_no_api_key`
 * (spending no budget) rather than left ambiguously pending forever, so an
 * admin view can distinguish "waiting its turn" from "nothing will happen
 * until credentials exist".
 */
export async function processGtinVerificationQueue(
  dailyLimit: number = FREE_TIER_DAILY_LIMIT
): Promise<ProcessQueueResult> {
  const result: ProcessQueueResult = {
    processed: 0,
    verified: 0,
    notFound: 0,
    mismatch: 0,
    failed: 0,
    skippedNoApiKey: 0,
    remainingBudgetToday: 0,
  };

  if (!isGs1Configured()) {
    const { data: pending, error } = await supabaseAdmin
      .from('gtin_verifications')
      .select('id')
      .eq('status', 'pending');
    if (error) throw error;
    for (const row of pending ?? []) {
      await supabaseAdmin
        .from('gtin_verifications')
        .update({ status: 'skipped_no_api_key', checked_at: new Date().toISOString() })
        .eq('id', row.id);
      result.skippedNoApiKey += 1;
    }
    return result;
  }

  const usedToday = await todaysLookupCount();
  let budget = Math.max(0, dailyLimit - usedToday);
  result.remainingBudgetToday = budget;
  if (budget === 0) return result;

  const { data: pending, error } = await supabaseAdmin
    .from('gtin_verifications')
    .select('id, gtin')
    .eq('status', 'pending')
    .order('requested_at', { ascending: true })
    .limit(budget);
  if (error) throw error;

  for (const row of pending ?? []) {
    if (budget <= 0) break;
    const outcome = await callGs1(row.gtin);
    await supabaseAdmin
      .from('gtin_verifications')
      .update({ status: outcome.status, gs1_response: outcome.response, checked_at: new Date().toISOString() })
      .eq('id', row.id);

    result.processed += 1;
    budget -= 1;
    if (outcome.status === 'verified') result.verified += 1;
    else if (outcome.status === 'not_found') result.notFound += 1;
    else if (outcome.status === 'mismatch') result.mismatch += 1;
    else if (outcome.status === 'failed') result.failed += 1;
  }

  result.remainingBudgetToday = budget;
  return result;
}
