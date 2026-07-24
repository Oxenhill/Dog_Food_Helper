import { NextRequest, NextResponse } from 'next/server';
import { getSessionUser } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Returns the authenticated user's identity and server-derived admin flag.
 * The client uses this for role-aware post-login routing (admin -> /admin,
 * owner -> /dogs) and to decide whether to show admin navigation. is_admin is
 * ALWAYS derived here from user_profiles via the service-role client — never
 * trusted from any client-supplied field.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser(request);
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  const { data: profile } = await supabaseAdmin
    .from('user_profiles')
    .select('is_admin, display_name')
    .eq('id', user.id)
    .maybeSingle();

  return NextResponse.json(
    {
      user: { id: user.id, email: user.email },
      is_admin: profile?.is_admin === true,
      display_name: profile?.display_name ?? null,
    },
    { status: 200 },
  );
}
