import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/ingredients/submissions?dog_id= — owner-facing status list.
 *
 * Not a named Part B action; a natural read-side companion for the
 * optional "owner-facing status page" (spec item 5, `/dogs/[dogId]/
 * submissions`), same pattern as other GET companions added in earlier
 * phases. Auth: x-user-id header (same stopgap as the rest of the app).
 * Scoped to `submitted_by = userId`; `dog_id` further narrows it and is
 * ownership-checked.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const dogId = request.nextUrl.searchParams.get('dog_id');

    let query = supabaseAdmin
      .from('ingredient_review_queue')
      .select('*')
      .eq('submitted_by', userId)
      .order('created_at', { ascending: false });

    if (dogId) {
      const { data: dog, error: dogError } = await supabaseAdmin
        .from('dogs')
        .select('id')
        .eq('id', dogId)
        .eq('owner_id', userId)
        .maybeSingle();
      if (dogError || !dog) {
        return NextResponse.json({ error: 'dog_id does not exist or does not belong to this user' }, { status: 403 });
      }
      query = query.eq('dog_id', dogId);
    }

    const { data, error } = await query;
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ items: data ?? [] }, { status: 200 });
  } catch (error) {
    console.error('submissions GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
