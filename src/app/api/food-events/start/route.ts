import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { FoodEventType } from '@/lib/types';
import { logTreatEvent } from '@/lib/foodEvents';

/**
 * POST /api/food-events/start (Part B)
 *
 * Treat occasions only. Whole diets are replaced atomically through /api/diets.
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
    if (event_type !== 'treat') {
      return NextResponse.json(
        { error: 'Main diet changes require the complete component set at /api/diets' },
        { status: 410 }
      );
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
    }

    const event = await logTreatEvent({
      dogId: dog_id,
      foodId: food_or_treat_id ?? null,
      freetext: food_or_treat_freetext ?? null,
      occurredAt: started_at ?? null,
    });
    return NextResponse.json(
      {
        message: 'Treat recorded',
        event_id: event.id,
        food_event: event,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Start food event error:', error);
    const message = error instanceof Error ? error.message : 'Internal server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
