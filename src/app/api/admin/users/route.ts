import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Admin user list. Admin-gated server-side (requireAdmin — verified session +
 * user_profiles.is_admin). user_profiles has no email column — email lives in
 * auth.users, so we fetch it separately via supabaseAdmin.auth.admin.listUsers()
 * and map onto each profile by id. Default listUsers page (first 50, Supabase's
 * default) is accepted as sufficient for this admin surface's expected scale;
 * a profile whose auth user isn't found in that page renders email as null
 * rather than failing the whole list.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    // 404, not 403 — don't confirm the endpoint's existence to non-admins.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: profiles, error: profilesError } = await supabaseAdmin
    .from('user_profiles')
    .select('id, display_name, is_admin, last_active_at, created_at')
    .order('created_at', { ascending: false });

  if (profilesError) {
    return NextResponse.json({ error: profilesError.message }, { status: 500 });
  }

  const { data: authList, error: authError } = await supabaseAdmin.auth.admin.listUsers();
  const emailById = new Map<string, string | null>();
  if (!authError && authList?.users) {
    for (const u of authList.users) emailById.set(u.id, u.email ?? null);
  }

  const users = (profiles ?? []).map((p) => ({
    ...p,
    email: emailById.get(p.id) ?? null,
  }));

  return NextResponse.json({ users }, { status: 200 });
}
