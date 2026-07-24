import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
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
