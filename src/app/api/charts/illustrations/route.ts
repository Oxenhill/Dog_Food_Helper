import { NextResponse } from 'next/server';
import { getChartManifest } from '@/lib/chartIllustrationStorage';

/**
 * GET /api/charts/illustrations — public. Returns the current
 * bristol/bcs value -> illustration URL manifest so
 * BristolChartSelector/BCSChartSelector can render an <img> for any value
 * that has one uploaded (via /admin/charts) and fall back to text-only for
 * any that don't yet — see src/lib/chartIllustrationStorage.ts.
 */
export async function GET() {
  const manifest = await getChartManifest();
  return NextResponse.json(manifest, { status: 200 });
}
