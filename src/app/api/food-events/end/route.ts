import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { endFoodEvent } from '@/lib/foodEvents';

/**
 * endFoodEvent (Part B)
 *
 * Input: dog_id, event_id, ended_at (optional, defaults to now).
 */
export async function POST(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const { dog_id, event_id, ended_at } = await request.json();

    if (!dog_id || !event_id) {
      return NextResponse.json({ error: 'dog_id and event_id are required' }, { status: 400 });
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

    const event = await endFoodEvent(dog_id, event_id, ended_at ?? null);

    if (!event) {
      return NextResponse.json({ error: 'Food event not found' }, { status: 404 });
    }

    return NextResponse.json(
      {
        message: 'Food event ended',
        food_event: event,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('End food event error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
