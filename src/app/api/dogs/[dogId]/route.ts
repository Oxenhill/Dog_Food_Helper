import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { deriveLifeStage } from '@/lib/lifeStage';

export async function GET(
  request: NextRequest,
  { params }: { params: { dogId: string } }
) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('dogs')
      .select('*')
      .eq('id', params.dogId)
      .eq('owner_id', userId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Get dog error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { dogId: string } }
) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    const updates = await request.json();
    // Never allow direct updates to life_stage — it's system-derived
    delete updates.life_stage;

    // If date_of_birth or size_category are changing, re-derive life_stage
    // server-side so it doesn't go stale (fetch current values for whichever
    // field isn't part of this update).
    if ('date_of_birth' in updates || 'size_category' in updates) {
      const { data: current } = await supabaseAdmin
        .from('dogs')
        .select('date_of_birth, size_category')
        .eq('id', params.dogId)
        .eq('owner_id', userId)
        .single();

      const dateOfBirth = 'date_of_birth' in updates ? updates.date_of_birth : current?.date_of_birth;
      const sizeCategory = 'size_category' in updates ? updates.size_category : current?.size_category;
      updates.life_stage = await deriveLifeStage(dateOfBirth, sizeCategory);
    }

    const { data, error } = await supabaseAdmin
      .from('dogs')
      .update(updates)
      .eq('id', params.dogId)
      .eq('owner_id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: 'Dog profile updated',
        dog: data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update dog error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
