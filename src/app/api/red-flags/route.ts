import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { RedFlagType } from '@/lib/types';

const VALID_FLAG_TYPES: RedFlagType[] = [
  'blood_in_stool',
  'repeated_vomiting',
  'severe_lethargy',
  'other_urgent',
];

/**
 * logRedFlagEvent (Part B)
 *
 * Kept entirely separate from routine wellness logging (architecture doc §9).
 * The "contact your vet" UI response must be triggered immediately
 * client-side on selection — this endpoint just persists the record, it is
 * not what the urgent UI waits on.
 */
export async function POST(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const { dog_id, flag_type, notes } = await request.json();

    if (!dog_id || !flag_type) {
      return NextResponse.json({ error: 'dog_id and flag_type are required' }, { status: 400 });
    }
    if (!VALID_FLAG_TYPES.includes(flag_type)) {
      return NextResponse.json({ error: `Invalid flag_type: ${flag_type}` }, { status: 400 });
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

    const { data, error } = await supabaseAdmin
      .from('dog_red_flag_events')
      .insert({
        dog_id,
        flag_type,
        notes: notes ?? null,
        logged_at: new Date().toISOString(),
        acknowledged: false,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    await supabaseAdmin
      .from('user_profiles')
      .update({ last_active_at: new Date().toISOString(), inactivity_warning_sent_at: null })
      .eq('id', userId);

    return NextResponse.json(
      {
        message: 'Red flag event logged',
        flag_id: data.id,
        red_flag_event: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Log red flag error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/**
 * Acknowledge a red-flag prompt (owner dismissed the "contact your vet" UI).
 */
export async function PATCH(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const { flag_id, dog_id } = await request.json();
    if (!flag_id || !dog_id) {
      return NextResponse.json({ error: 'flag_id and dog_id are required' }, { status: 400 });
    }

    const { data: dog } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', dog_id)
      .eq('owner_id', userId)
      .single();

    if (!dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const { data, error } = await supabaseAdmin
      .from('dog_red_flag_events')
      .update({ acknowledged: true })
      .eq('id', flag_id)
      .eq('dog_id', dog_id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Acknowledged', red_flag_event: data }, { status: 200 });
  } catch (error) {
    console.error('Acknowledge red flag error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
