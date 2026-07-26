import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { FoodEventType } from '@/lib/types';
import { DEFAULT_TRANSITION_DAYS, logTreatEvent, startMainFoodEvent } from '@/lib/foodEvents';

/**
 * POST /api/food-events/start (Part B)
 *
 * Two distinct jobs behind one documented endpoint, keyed on event_type:
 *
 *   main_food — "what is your dog eating now?" and "I've changed foods" are
 *     the same operation. Starting a main food CLOSES whatever was open, in
 *     one call, so the client cannot half-complete a switch by making the two
 *     calls separately and having the second fail.
 *
 *   treat — a discrete occasion on a date, not a period. No transition, no
 *     end, and it does not change what the dog is being fed.
 *
 * `in_transition_until` is always computed server-side from `transition_days`;
 * the client never sets the timestamp directly.
 */
export async function POST(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
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
      transition_days,
    }: {
      dog_id: string;
      food_or_treat_id?: string;
      food_or_treat_freetext?: string;
      event_type: FoodEventType;
      started_at?: string;
      transition_days?: number;
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

    // Validate the catalogue reference before writing. The FK would catch a
    // nonexistent id, but a 404 with a clear message beats a constraint error,
    // and only a lookup can enforce the meal/treat separation.
    if (food_or_treat_id) {
      const { data: food, error: foodError } = await supabaseAdmin
        .from('foods')
        .select('id, brand, name, is_treat')
        .eq('id', food_or_treat_id)
        .maybeSingle();

      if (foodError) {
        return NextResponse.json({ error: foodError.message }, { status: 500 });
      }
      if (!food) {
        return NextResponse.json({ error: 'Food not found' }, { status: 404 });
      }
      // A chew must never be recorded as dinner — the same separation
      // hardFilter.ts applies when building the recommendation candidate set.
      if (event_type === 'main_food' && food.is_treat) {
        return NextResponse.json(
          {
            error: `${food.brand} ${food.name} is recorded as a treat, so it can't be set as a main food. Log it as a treat instead.`,
          },
          { status: 400 }
        );
      }
    }

    if (event_type === 'treat') {
      const event = await logTreatEvent({
        dogId: dog_id,
        foodId: food_or_treat_id ?? null,
        freetext: food_or_treat_freetext ?? null,
        occurredAt: started_at ?? null,
      });
      return NextResponse.json(
        { message: 'Treat recorded', event_id: event.id, food_event: event },
        { status: 201 }
      );
    }

    const { event, previousEvent } = await startMainFoodEvent({
      dogId: dog_id,
      foodId: food_or_treat_id ?? null,
      freetext: food_or_treat_freetext ?? null,
      startedAt: started_at ?? null,
      transitionDays: transition_days ?? DEFAULT_TRANSITION_DAYS,
    });

    return NextResponse.json(
      {
        message: previousEvent ? 'Food change recorded' : 'Current food recorded',
        event_id: event.id,
        food_event: event,
        // Non-null means this was a switch, and the analysis engine now has a
        // switch point to work with.
        previous_event: previousEvent,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Start food event error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
