import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * PATCH /api/admin/users/[userId] — grant or revoke admin status.
 * Admin-gated (requireAdmin). Only `is_admin` is ever written; any other body
 * field is ignored. Fail-closed self-lockout guard: an admin may not change
 * their OWN admin status via this route (checked before any DB write), so a
 * lone admin can never accidentally strip their own access.
 */
type RouteParams = { params: Promise<{ userId: string }> };

export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) {
    // 404, not 403 — don't confirm the endpoint's existence to non-admins.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { userId } = await params;

  if (admin.id === userId) {
    return NextResponse.json(
      { error: "You can't change your own admin status." },
      { status: 400 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const isAdmin = (body as { is_admin?: unknown } | null)?.is_admin;
  if (typeof isAdmin !== 'boolean') {
    return NextResponse.json({ error: 'is_admin must be a boolean' }, { status: 400 });
  }

  const { data: updated, error } = await supabaseAdmin
    .from('user_profiles')
    .update({ is_admin: isAdmin })
    .eq('id', userId)
    .select('id, display_name, is_admin, last_active_at, created_at')
    .maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!updated) {
    return NextResponse.json({ error: 'User not found' }, { status: 404 });
  }

  return NextResponse.json({ user: updated }, { status: 200 });
}
