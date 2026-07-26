import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import { getOpenMainFoodEvent, listFoodEvents } from '@/lib/foodEvents';
import { evaluateTreatLoggingSuggestion } from '@/lib/treatLoggingPrompt';

/**
 * GET /api/food-events?dog_id=… — a dog's feeding history.
 *
 * Returns the currently open main food, the full main-food history (so the UI
 * can show what has been tried and for how long), and recent treat occasions.
 */
export async function GET(request: NextRequest) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const dogId = request.nextUrl.searchParams.get('dog_id');
    if (!dogId) {
      return NextResponse.json({ error: 'dog_id is required' }, { status: 400 });
    }

    const { data: dog, error: dogError } = await supabaseAdmin
      .from('dogs')
      .select('id, treat_logging_enabled, treat_logging_prompt_dismissed_at')
      .eq('id', dogId)
      .eq('owner_id', user.id)
      .single();

    if (dogError || !dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const [{ mainFood, treats }, current, treatSuggestion] = await Promise.all([
      listFoodEvents(dogId),
      getOpenMainFoodEvent(dogId),
      evaluateTreatLoggingSuggestion(
        dogId,
        dog.treat_logging_enabled,
        dog.treat_logging_prompt_dismissed_at != null
      ),
    ]);

    // The open event carries `in_transition_until`; the UI uses it to say
    // "still settling" rather than presenting early logs as clean evidence.
    const inTransition =
      current?.in_transition_until != null && new Date(current.in_transition_until) > new Date();

    return NextResponse.json(
      {
        current_main_food: mainFood.find((e) => e.id === current?.id) ?? null,
        in_transition: inTransition,
        main_food_history: mainFood,
        treats,
        treat_logging_enabled: dog.treat_logging_enabled,
        treat_logging_prompt_dismissed: dog.treat_logging_prompt_dismissed_at != null,
        // Conditional nudge, not a nag — see src/lib/treatLoggingPrompt.ts.
        treat_logging_suggestion: treatSuggestion,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('List food events error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
