import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { FoodEventType } from '@/lib/types';

// Short digestive-settling default used for in_transition_until, matching the
// metric_minimum_lag_days value seeded for the digestive metrics (stool_score/
// stool_odor/gas_frequency/gas_odor = 10 days). Part B's own example text used
// "+9 days" loosely; 10 was chosen here to stay consistent with the seeded
// reference table rather than introduce a second, slightly different number.
// Flagged in BUILD_PROGRESS.md as a resolved assumption, not a silent guess.
const DEFAULT_TRANSITION_DAYS = 10;

/**
 * startFoodEvent (Part B)
 *
 * Input: dog_id, food reference (food_or_treat_id or food_or_treat_freetext),
 * event_type, started_at. Computes in_transition_until server-side — the
 * client cannot set this directly.
 *
 * If event_type is 'main_food', also updates the dog's current_food_id /
 * current_food_freetext, since current_food is the anchor used by baseline
 * logic and the lag-window calculation (architecture doc §4).
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const body = await request.json();
    const {
      dog_id,
      food_or_treat_id,
      food_or_treat_freetext,
      event_type,
      started_at,
    }: {
      dog_id: string;
      food_or_treat_id?: string;
      food_or_treat_freetext?: string;
      event_type: FoodEventType;
      started_at?: string;
    } = body;

    if (!dog_id || !event_type) {
      return NextResponse.json({ error: 'dog_id and event_type are required' }, { status: 400 });
    }
    if (!['main_food', 'treat'].includes(event_type)) {
      return NextResponse.json({ error: `Invalid event_type: ${event_type}` }, { status: 400 });
    }
    if (!food_or_treat_id && !food_or_treat_freetext) {
      return NextResponse.json(
        { error: 'food_or_treat_id or food_or_treat_freetext is required' },
        { status: 400 }
      );
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

    const startedAtDate = started_at ? new Date(started_at) : new Date();
    const inTransitionUntil = new Date(startedAtDate);
    inTransitionUntil.setDate(inTransitionUntil.getDate() + DEFAULT_TRANSITION_DAYS);

    const { data: event, error: eventError } = await supabaseAdmin
      .from('dog_food_events')
      .insert({
        dog_id,
        food_or_treat_id: food_or_treat_id ?? null,
        food_or_treat_freetext: food_or_treat_freetext ?? null,
        event_type,
        started_at: startedAtDate.toISOString(),
        in_transition_until: inTransitionUntil.toISOString(),
      })
      .select()
      .single();

    if (eventError) {
      return NextResponse.json({ error: eventError.message }, { status: 500 });
    }

    if (event_type === 'main_food') {
      await supabaseAdmin
        .from('dogs')
        .update({
          current_food_id: food_or_treat_id ?? null,
          current_food_freetext: food_or_treat_freetext ?? null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', dog_id);
    }

    return NextResponse.json(
      {
        message: 'Food event started',
        event_id: event.id,
        food_event: event,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Start food event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
