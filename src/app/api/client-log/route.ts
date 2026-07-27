import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

export const runtime = 'nodejs';

/**
 * POST /api/client-log — a tiny, unauthenticated sink for client-side
 * diagnostics that a phone's browser console won't show us (Android, no
 * attached debugger). Deliberately:
 *   - unauthenticated: the failures worth reporting can happen before
 *     sign-in ever completes (a network failure, a bad response parse);
 *   - text-only and hard-capped small, so this endpoint can never hit the
 *     same request-size ceiling it may exist to help diagnose;
 *   - rate-limited on a shared hourly count (no IP capture — this is a
 *     debug channel, not a security log, and IP is data we don't need to
 *     hold for that).
 */

const MAX_CONTENT_LENGTH = 10_000; // bytes — this payload is never an image
const MAX_PER_HOUR = 200;
const MAX_STRING = 2000;
const MAX_CONTEXT_STRING = 500;

function clip(value: unknown, max = MAX_STRING): string | null {
  if (typeof value !== 'string') return null;
  return value.length > max ? value.slice(0, max) : value;
}

/** Shallow, primitives-only — silently drops arrays/nested objects/functions rather than erroring, so a caller never has a reason to inline something large. */
function sanitizeContext(raw: unknown): Record<string, string | number | boolean | null> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const out: Record<string, string | number | boolean | null> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    const safeKey = key.slice(0, 60);
    if (typeof value === 'string') out[safeKey] = clip(value, MAX_CONTEXT_STRING) ?? '';
    else if (typeof value === 'number' || typeof value === 'boolean' || value === null) {
      out[safeKey] = value;
    }
  }
  return out;
}

export async function POST(request: NextRequest) {
  const contentLength = Number(request.headers.get('content-length') ?? '0');
  if (contentLength > MAX_CONTENT_LENGTH) {
    return NextResponse.json({ error: 'Payload too large for this endpoint.' }, { status: 413 });
  }

  let body: Record<string, unknown>;
  try {
    body = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json({ ok: false }, { status: 400 });
  }

  const event = clip(body.event, 200);
  if (!event) {
    return NextResponse.json({ error: 'event is required' }, { status: 400 });
  }

  const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error: countError } = await supabaseAdmin
    .from('client_error_logs')
    .select('id', { count: 'exact', head: true })
    .gte('created_at', oneHourAgo);

  // A caller hitting this cap is either a bug loop or abuse; either way it
  // gets a quiet 202 rather than a failure path it would have to handle.
  if (!countError && (count ?? 0) >= MAX_PER_HOUR) {
    return NextResponse.json({ ok: true }, { status: 202 });
  }

  await supabaseAdmin.from('client_error_logs').insert({
    event,
    status: typeof body.status === 'number' ? body.status : null,
    bytes: typeof body.bytes === 'number' ? body.bytes : null,
    message: clip(body.message),
    context: sanitizeContext(body.context),
    user_agent: clip(request.headers.get('user-agent'), 300),
  });

  return NextResponse.json({ ok: true }, { status: 200 });
}
