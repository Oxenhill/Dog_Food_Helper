import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { ageToApproxDob, deriveLifeStage } from '@/lib/lifeStage';
import { startMainFoodEvent } from '@/lib/foodEvents';

export async function POST(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    const {
      name,
      breed,
      date_of_birth: date_of_birth_input,
      age_years,
      age_months,
      weight_kg,
      size_category,
      lifestyle_role = 'pet',
      work_type = 'none',
      daily_exercise_hours,
      current_food_id,
      current_food_freetext,
      monthly_food_budget,
    } = await request.json();

    if (!name) {
      return NextResponse.json(
        { error: 'Dog name is required' },
        { status: 400 }
      );
    }

    // Owners enter an approximate age (years + months) rather than a date of
    // birth — convert that to date_of_birth here so deriveLifeStage() and the
    // rest of the schema keep working unchanged. Falls back to an explicit
    // date_of_birth for callers that still send one and no age fields.
    const date_of_birth =
      age_years !== undefined || age_months !== undefined
        ? ageToApproxDob(Number(age_years) || 0, Number(age_months) || 0)
        : date_of_birth_input;

    // life_stage is system-derived (Part C item 1) — computed server-side here
    // rather than left null, since Phase 3's recommendation scoring needs it.
    const life_stage = await deriveLifeStage(date_of_birth, size_category);

    const { data, error } = await supabaseAdmin
      .from('dogs')
      .insert({
        owner_id: userId,
        name,
        breed,
        date_of_birth,
        weight_kg,
        size_category,
        lifestyle_role,
        work_type,
        daily_exercise_hours,
        life_stage,
        current_food_id,
        current_food_freetext,
        monthly_food_budget,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Open a main_food event immediately, so the dog's very first logs are
    // attributable. Without this, `dogs.current_food_id` would be set but
    // `dog_food_events` would still be empty, every log's `food_id_active`
    // would be null, and the correlation engine would have nothing to work
    // with — the exact gap that left the whole subsystem inert.
    //
    // Failure here is non-fatal: the profile exists and the owner can set the
    // food from the dog's page. Losing the profile over it would be worse.
    if (current_food_id || current_food_freetext) {
      try {
        await startMainFoodEvent({
          dogId: data.id,
          foodId: current_food_id ?? null,
          freetext: current_food_freetext ?? null,
          // This is the food the dog is ALREADY on, not a switch being phased
          // in, so there is no transition period to discount.
          transitionDays: 0,
        });
      } catch (eventError) {
        console.error(`Dog ${data.id} created but its food event was not opened`, eventError);
      }
    }

    return NextResponse.json(
      {
        message: 'Dog profile created',
        dog: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Create dog error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
