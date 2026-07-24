import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

/**
 * List the signed-in owner's dog profiles. Companion GET to the existing
 * POST /api/dogs/create — needed by the new /dogs list page so a returning
 * owner can see and reach their existing dogs, not just create new ones.
 */
export async function GET(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'User ID required' }, { status: 401 });
    }

    const { data, error } = await supabaseAdmin
      .from('dogs')
      .select('*')
      .eq('owner_id', userId)
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ dogs: data ?? [] }, { status: 200 });
  } catch (error) {
    console.error('List dogs error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
