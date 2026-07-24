import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * Admin dashboard summary counts. Admin-gated server-side (requireAdmin —
 * verified session + user_profiles.is_admin). Used by the /admin home to show
 * an at-a-glance overview and route into each management surface. All counts
 * use head+exact so no row data is transferred. A null count means that count
 * query failed (the UI renders it as "—") — the dashboard still loads.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    // 404, not 403 — don't confirm the endpoint's existence to non-admins.
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const [
    foods,
    ingredients,
    users,
    admins,
    researchDocs,
    researchChunks,
    reviewPending,
    contraindications,
  ] = await Promise.all([
    supabaseAdmin.from('foods').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('food_ingredients').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('user_profiles').select('*', { count: 'exact', head: true }),
    supabaseAdmin
      .from('user_profiles')
      .select('*', { count: 'exact', head: true })
      .eq('is_admin', true),
    supabaseAdmin.from('research_documents').select('*', { count: 'exact', head: true }),
    supabaseAdmin.from('research_chunks').select('*', { count: 'exact', head: true }),
    supabaseAdmin
      .from('ingredient_review_queue')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'pending'),
    supabaseAdmin
      .from('condition_contraindications')
      .select('*', { count: 'exact', head: true }),
  ]);

  return NextResponse.json(
    {
      counts: {
        foods: foods.error ? null : foods.count ?? 0,
        food_ingredients: ingredients.error ? null : ingredients.count ?? 0,
        users: users.error ? null : users.count ?? 0,
        admins: admins.error ? null : admins.count ?? 0,
        research_documents: researchDocs.error ? null : researchDocs.count ?? 0,
        research_chunks: researchChunks.error ? null : researchChunks.count ?? 0,
        review_queue_pending: reviewPending.error ? null : reviewPending.count ?? 0,
        condition_contraindications: contraindications.error
          ? null
          : contraindications.count ?? 0,
      },
    },
    { status: 200 },
  );
}
