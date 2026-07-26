import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { fetchFoodFull } from '@/lib/foodFull';

/**
 * GET /api/foods/[foodId] — owner-facing food detail.
 *
 * The owner's answer to "what is actually in this food". Distinct from
 * /api/admin/foods/[foodId], which is admin-gated and exists for review and
 * correction of the record; this one is read-only and available to any
 * signed-in owner.
 *
 * Foods are shared reference data, not per-owner rows, so there is no
 * ownership check here beyond requiring a verified session — but the session IS
 * required, so the catalogue isn't an anonymous endpoint.
 */
export async function GET(request: NextRequest, { params }: { params: { foodId: string } }) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const food = await fetchFoodFull(params.foodId);
    if (!food) {
      return NextResponse.json({ error: 'Food not found' }, { status: 404 });
    }

    return NextResponse.json(food, { status: 200 });
  } catch (error) {
    console.error('Get food detail error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
