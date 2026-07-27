import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Unresolved system_alerts rows — written by the daily
 * run_scheduled_assertions() cron wrapper (supabase/migrations/
 * 20260727130000_add_system_alerts_and_assertion_wrapper.sql) when a data-
 * integrity or catalogue-boundary assertion fails. Surfaced here, not just
 * in cron.job_run_details, because nothing was reading that table: an alarm
 * nobody looks at isn't an alarm.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error } = await supabaseAdmin
    .from('system_alerts')
    .select('id, check_name, message, detected_at')
    .is('resolved_at', null)
    .order('detected_at', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ alerts: data ?? [] }, { status: 200 });
}
