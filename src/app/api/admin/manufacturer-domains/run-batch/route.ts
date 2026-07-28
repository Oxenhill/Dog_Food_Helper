import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';

/**
 * Manual trigger for the manufacturer-recon Edge Function (FOOD_DISCOVERY_DESIGN.md
 * sec3.2). Recon is finite (108 companies) and not on a cron — every batch can
 * produce blocked/unresolved/approval_candidate rows that need a human, so it
 * stays owner-triggered rather than scheduled. This route exists only so that
 * trigger is a button instead of an admin having to run curl by hand; it still
 * caps at 5 domains per call, same limit the Edge Function itself enforces
 * (16 domains in one call 502'd the gateway, 2026-07-28).
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    return NextResponse.json({ error: 'Supabase server env vars not configured.' }, { status: 500 });
  }

  const res = await fetch(`${supabaseUrl}/functions/v1/manufacturer-recon`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${serviceRoleKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ limit: 5 }),
  });

  const data = await res.json().catch(() => ({ error: 'Non-JSON response from recon function.' }));
  if (!res.ok) {
    return NextResponse.json({ error: data.error ?? `Edge Function returned ${res.status}` }, { status: 502 });
  }

  return NextResponse.json(data, { status: 200 });
}
