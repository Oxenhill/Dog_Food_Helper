import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';

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

    const { dog_id, condition, source, diagnosed_date, notes } =
      await request.json();

    if (!dog_id || !condition || !source) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      );
    }

    // Verify dog belongs to user
    const { data: dog } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', dog_id)
      .eq('owner_id', userId)
      .single();

    if (!dog) {
      return NextResponse.json(
        { error: 'Dog not found' },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('dog_health_conditions')
      .insert({
        dog_id,
        condition,
        source,
        diagnosed_date,
        notes,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: 'Health condition added',
        condition: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Add health condition error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    const dogId = request.nextUrl.searchParams.get('dog_id');
    if (!dogId) {
      return NextResponse.json(
        { error: 'dog_id query parameter required' },
        { status: 400 }
      );
    }

    // Verify dog belongs to user
    const { data: dog } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', dogId)
      .eq('owner_id', userId)
      .single();

    if (!dog) {
      return NextResponse.json(
        { error: 'Dog not found' },
        { status: 404 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('dog_health_conditions')
      .select('*')
      .eq('dog_id', dogId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ conditions: data ?? [] }, { status: 200 });
  } catch (error) {
    console.error('List health conditions error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function DELETE(request: NextRequest) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    let id = request.nextUrl.searchParams.get('id');
    if (!id) {
      try {
        const body = await request.json();
        id = body?.id ?? null;
      } catch {
        // no body provided — fall through to the missing-id check below
      }
    }

    if (!id) {
      return NextResponse.json(
        { error: 'id is required (query parameter or request body)' },
        { status: 400 }
      );
    }

    // Verify the condition's dog belongs to the user before deleting.
    const { data: condition } = await supabaseAdmin
      .from('dog_health_conditions')
      .select('id, dog_id')
      .eq('id', id)
      .single();

    if (!condition) {
      return NextResponse.json(
        { error: 'Health condition not found' },
        { status: 404 }
      );
    }

    const { data: dog } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', condition.dog_id)
      .eq('owner_id', userId)
      .single();

    if (!dog) {
      return NextResponse.json(
        { error: 'Health condition not found' },
        { status: 404 }
      );
    }

    const { error } = await supabaseAdmin
      .from('dog_health_conditions')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { message: 'Health condition removed' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete health condition error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
