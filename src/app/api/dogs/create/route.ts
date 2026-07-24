import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { deriveLifeStage } from '@/lib/lifeStage';

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
      date_of_birth,
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
