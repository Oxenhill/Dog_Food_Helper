import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { deriveDailyStoolSummaries } from '@/lib/stoolEventAggregation';
import { getMonitoringWindowAt } from '@/lib/stoolEvents';

const FLAG_NAMES = ['mucus', 'blood', 'urgency', 'straining', 'undigested_food'] as const;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function ownedDog(dogId: string, userId: string) {
  const { data, error } = await supabaseAdmin
    .from('dogs')
    .select('id')
    .eq('id', dogId)
    .eq('owner_id', userId)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user?.id) return NextResponse.json({ error: 'User ID required' }, { status: 401 });

    const dogId = request.nextUrl.searchParams.get('dog_id');
    if (!dogId) {
      return NextResponse.json({ error: 'dog_id query param is required' }, { status: 400 });
    }
    if (!(await ownedDog(dogId, user.id))) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const from = request.nextUrl.searchParams.get('from');
    const to = request.nextUrl.searchParams.get('to');
    if ((from && !DATE_PATTERN.test(from)) || (to && !DATE_PATTERN.test(to))) {
      return NextResponse.json({ error: 'from and to must be YYYY-MM-DD dates' }, { status: 400 });
    }

    let query = supabaseAdmin
      .from('dog_stool_events')
      .select('*')
      .eq('dog_id', dogId)
      .order('occurred_on', { ascending: false })
      .order('occurred_at', { ascending: false, nullsFirst: false });
    if (from) query = query.gte('occurred_on', from);
    if (to) query = query.lte('occurred_on', to);

    const [{ data: events, error }, { data: window, error: windowError }] = await Promise.all([
      query,
      supabaseAdmin
        .from('dog_stool_monitoring_windows')
        .select('*')
        .eq('dog_id', dogId)
        .is('closed_at', null)
        .maybeSingle(),
    ]);
    if (error) throw error;
    if (windowError) throw windowError;

    return NextResponse.json({
      events: events ?? [],
      daily_summaries: deriveDailyStoolSummaries(events ?? []),
      monitoring_window: window,
    });
  } catch (error) {
    console.error('List stool events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user?.id) return NextResponse.json({ error: 'User ID required' }, { status: 401 });

    const body = await request.json();
    const { dog_id, occurred_on, occurred_at, score, note } = body;

    if (!dog_id || !DATE_PATTERN.test(occurred_on ?? '')) {
      return NextResponse.json(
        { error: 'dog_id and owner-local occurred_on date are required' },
        { status: 400 }
      );
    }
    if (!Number.isInteger(score) || score < 1 || score > 7) {
      return NextResponse.json({ error: 'score must be an integer from 1 to 7' }, { status: 400 });
    }
    const occurredAtDate = new Date(occurred_at);
    if (!occurred_at || Number.isNaN(occurredAtDate.getTime())) {
      return NextResponse.json({ error: 'A captured occurrence time is required' }, { status: 400 });
    }
    if (!(await ownedDog(dog_id, user.id))) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const monitoringWindow = await getMonitoringWindowAt(dog_id, occurredAtDate.toISOString());
    if (!monitoringWindow) {
      return NextResponse.json(
        {
          error:
            'No food-change monitoring window is open. Record the food change before logging monitored stool events.',
        },
        { status: 409 }
      );
    }
    const row: Record<string, unknown> = {
      dog_id,
      occurred_on,
      occurred_at: occurredAtDate.toISOString(),
      time_of_day_captured: true,
      score,
      note: typeof note === 'string' && note.trim() ? note.trim() : null,
      monitoring_window_id: monitoringWindow.id,
    };
    for (const flag of FLAG_NAMES) row[flag] = body[flag] === true ? true : null;

    const { data, error } = await supabaseAdmin
      .from('dog_stool_events')
      .insert(row)
      .select()
      .single();
    if (error) throw error;

    await supabaseAdmin
      .from('user_profiles')
      .update({ last_active_at: new Date().toISOString(), inactivity_warning_sent_at: null })
      .eq('id', user.id);

    return NextResponse.json(
      {
        message: 'Stool event recorded',
        stool_event: data,
        monitoring_window: monitoringWindow,
        blood_flagged: body.blood === true,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Record stool event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
