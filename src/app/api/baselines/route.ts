import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

/**
 * Fetch a dog's current (most recent) baseline plus the log entries logged
 * at establishment — used by the UI to know whether a baseline already
 * exists before showing the establishment flow vs. the quick-log flow.
 */
export async function GET(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const dogId = request.nextUrl.searchParams.get('dog_id');
    if (!dogId) {
      return NextResponse.json({ error: 'dog_id query param is required' }, { status: 400 });
    }

    const { data: dog } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', dogId)
      .eq('owner_id', userId)
      .single();

    if (!dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const { data: baseline, error: baselineError } = await supabaseAdmin
      .from('dog_baselines')
      .select('*')
      .eq('dog_id', dogId)
      .order('established_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (baselineError) {
      return NextResponse.json({ error: baselineError.message }, { status: 500 });
    }

    if (!baseline) {
      return NextResponse.json({ baseline: null, entries: [] }, { status: 200 });
    }

    const logDate = new Date(baseline.established_at).toISOString().split('T')[0];
    const [{ data: entries, error: entriesError }, { data: stoolBaseline, error: stoolError }] =
      await Promise.all([
        supabaseAdmin
          .from('dog_log_entries')
          .select('*')
          .eq('dog_id', dogId)
          .eq('log_date', logDate),
        supabaseAdmin
          .from('dog_stool_baselines')
          .select('*')
          .eq('dog_baseline_id', baseline.id)
          .maybeSingle(),
      ]);

    if (entriesError) {
      return NextResponse.json({ error: entriesError.message }, { status: 500 });
    }
    if (stoolError) {
      return NextResponse.json({ error: stoolError.message }, { status: 500 });
    }

    return NextResponse.json({ baseline, stool_baseline: stoolBaseline, entries }, { status: 200 });
  } catch (error) {
    console.error('Get baseline error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
