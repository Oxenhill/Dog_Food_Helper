import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * Not a named action in Part B's table, but dog_weight_logs is explicitly
 * in Phase 2 scope and needs a write path — added as a straightforward
 * extension of the same pattern rather than left unimplemented. Flagged in
 * BUILD_PROGRESS.md.
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const { dog_id, log_date, weight_kg } = await request.json();

    if (!dog_id || weight_kg === undefined) {
      return NextResponse.json({ error: 'dog_id and weight_kg are required' }, { status: 400 });
    }

    const { data: dog, error: dogError } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', dog_id)
      .eq('owner_id', userId)
      .single();

    if (dogError || !dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const logDateStr = log_date
      ? new Date(log_date).toISOString().split('T')[0]
      : new Date().toISOString().split('T')[0];

    const { data, error } = await supabaseAdmin
      .from('dog_weight_logs')
      .insert({ dog_id, log_date: logDateStr, weight_kg })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Keep the dog profile's own weight_kg roughly current for quick display elsewhere
    await supabaseAdmin
      .from('dogs')
      .update({ weight_kg, updated_at: new Date().toISOString() })
      .eq('id', dog_id);

    await supabaseAdmin
      .from('user_profiles')
      .update({ last_active_at: new Date().toISOString(), inactivity_warning_sent_at: null })
      .eq('id', userId);

    return NextResponse.json(
      {
        message: 'Weight logged',
        weight_log: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Log weight error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
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

    const { data, error } = await supabaseAdmin
      .from('dog_weight_logs')
      .select('*')
      .eq('dog_id', dogId)
      .order('log_date', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Get weight logs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
