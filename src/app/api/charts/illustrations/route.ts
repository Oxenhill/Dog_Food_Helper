import { NextResponse } from 'next/server';
import { getChartManifest } from '@/lib/chartIllustrationStorage';

/**
 * GET /api/charts/illustrations — public. Returns the current
 * bristol/bcs value -> illustration URL listing so
 * BristolChartSelector/BCSChartSelector can render an <img> for any value that
 * has one uploaded (via /admin/charts) and fall back to text-only for any that
 * don't yet — see src/lib/chartIllustrationStorage.ts.
 *
 * MUST BE DYNAMIC. This route takes no request parameters, so Next's App
 * Router prerenders it as a STATIC route at build time by default — which it
 * did, and that was a real production bug: the response was frozen to whatever
 * illustrations existed when the app was last built, so anything uploaded
 * afterwards never appeared until the next deployment. Observed 2026-07-26 —
 * newly uploaded BCS images returned an empty object from the running server
 * while the files were provably present in Storage.
 *
 * This reads mutable external state (a Storage bucket), so it can never be
 * prerendered. Uploads must show up immediately, without a redeploy.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export async function GET() {
  const manifest = await getChartManifest();
  return NextResponse.json(manifest, {
    status: 200,
    // Belt and braces: stop any CDN/proxy in front of this from re-freezing
    // what we just made dynamic.
    headers: { 'Cache-Control': 'no-store, must-revalidate' },
  });
}
