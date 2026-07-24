import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { findDuplicateFood } from '@/lib/foodDuplicates';
import { ReviewStatus } from '@/lib/types';

const VALID_STATUSES: ReviewStatus[] = ['pending', 'approved', 'rejected'];

/**
 * GET /api/ingredients/review-queue?status=pending — admin listing.
 *
 * Not a named Part B action, but the admin review-queue page (Part B/spec
 * item 2) needs a read endpoint to populate itself from, same pattern as
 * Phase 2's `GET /api/baselines` companion. Admin-token gated, same stopgap
 * as the review/ingest endpoints.
 *
 * For each pending item, opportunistically attaches a `possible_duplicate`
 * field (via the same brand+name check used at approval time) so the admin
 * sees a duplicate warning while reviewing, not just after clicking Approve.
 */
export async function GET(request: NextRequest) {
  try {
    const adminToken = process.env.RESEARCH_INGEST_ADMIN_TOKEN;
    if (!adminToken) {
      return NextResponse.json(
        { error: 'RESEARCH_INGEST_ADMIN_TOKEN is not configured on the server.' },
        { status: 503 }
      );
    }
    if (request.headers.get('x-admin-token') !== adminToken) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const statusParam = request.nextUrl.searchParams.get('status') ?? 'pending';
    if (!VALID_STATUSES.includes(statusParam as ReviewStatus)) {
      return NextResponse.json(
        { error: `status must be one of: ${VALID_STATUSES.join(', ')}` },
        { status: 400 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('ingredient_review_queue')
      .select('*')
      .eq('status', statusParam)
      .order('created_at', { ascending: true });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    const items = await Promise.all(
      (data ?? []).map(async (item) => {
        if (statusParam !== 'pending' || !item.raw_ocr_json?.brand || !item.raw_ocr_json?.product_name) {
          return { ...item, possible_duplicate: null };
        }
        const duplicate = await findDuplicateFood(item.raw_ocr_json.brand, item.raw_ocr_json.product_name);
        return { ...item, possible_duplicate: duplicate };
      })
    );

    return NextResponse.json({ items }, { status: 200 });
  } catch (error) {
    console.error('review-queue GET error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
