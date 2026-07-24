import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { requireAdmin } from '@/lib/serverAdminAuth';

const BUCKET = 'ingredient-photos';

/**
 * GET /api/ingredients/photo-url?path=... — admin-only, generates a short-
 * lived signed URL so the review-queue admin page can display the original
 * photo without the storage bucket being public (see
 * src/lib/ingredientPhotoStorage.ts — bucket is private by design). Not a
 * named Part B action; a small companion needed for spec item 2's "display
 * extracted ingredients + suggested food record" to actually let a reviewer
 * see the source photo, not just the OCR text. Gated by requireAdmin() — see
 * that file for the real Supabase-session + user_profiles.is_admin check.
 */
export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const path = request.nextUrl.searchParams.get('path');
  if (!path) {
    return NextResponse.json({ error: 'path query param is required' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin.storage.from(BUCKET).createSignedUrl(path, 60);
  if (error || !data) {
    return NextResponse.json({ error: error?.message ?? 'Failed to sign URL' }, { status: 500 });
  }

  return NextResponse.json({ url: data.signedUrl }, { status: 200 });
}
