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

    const {
      dog_id,
      restriction_type,
      substance,
      source,
      confidence,
      test_document_ref,
    } = await request.json();

    if (!dog_id || !restriction_type || !substance || !source) {
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
      .from('dog_restrictions')
      .insert({
        dog_id,
        restriction_type,
        substance,
        source,
        confidence,
        test_document_ref,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: 'Restriction added',
        restriction: data,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Add restriction error:', error);
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
      .from('dog_restrictions')
      .select('*')
      .eq('dog_id', dogId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ restrictions: data ?? [] }, { status: 200 });
  } catch (error) {
    console.error('List restrictions error:', error);
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

    // Verify the restriction's dog belongs to the user before deleting.
    const { data: restriction } = await supabaseAdmin
      .from('dog_restrictions')
      .select('id, dog_id')
      .eq('id', id)
      .single();

    if (!restriction) {
      return NextResponse.json(
        { error: 'Restriction not found' },
        { status: 404 }
      );
    }

    const { data: dog } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', restriction.dog_id)
      .eq('owner_id', userId)
      .single();

    if (!dog) {
      return NextResponse.json(
        { error: 'Restriction not found' },
        { status: 404 }
      );
    }

    const { error } = await supabaseAdmin
      .from('dog_restrictions')
      .delete()
      .eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      { message: 'Restriction removed' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Delete restriction error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
