import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Admin dog picker for the decision-trace page. Admin-gated (requireAdmin) —
 * this is the one surface where an admin can look at ANY dog, not just their
 * own, so it stays scoped to this one read-only listing rather than
 * generalising dog access elsewhere.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const { data: dogs, error: dogsError } = await supabaseAdmin
    .from('dogs')
    .select('id, name, owner_id, life_stage')
    .order('name');
  if (dogsError) {
    return NextResponse.json({ error: dogsError.message }, { status: 500 });
  }

  const ownerIds = [...new Set((dogs ?? []).map((d) => d.owner_id).filter((id): id is string => Boolean(id)))];
  const nameByOwnerId = new Map<string, string | null>();
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabaseAdmin
      .from('user_profiles')
      .select('id, display_name')
      .in('id', ownerIds);
    for (const profile of profiles ?? []) {
      nameByOwnerId.set(profile.id as string, (profile.display_name as string | null) ?? null);
    }
  }

  const result = (dogs ?? []).map((dog) => ({
    id: dog.id as string,
    name: dog.name as string,
    life_stage: dog.life_stage as string | null,
    owner_display_name: dog.owner_id ? (nameByOwnerId.get(dog.owner_id as string) ?? null) : null,
  }));

  return NextResponse.json({ dogs: result }, { status: 200 });
}
