import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * GET /api/contribute/known — the "already have these" list.
 *
 * Plain text, one `Brand — Product Name` per line, so a contributor's chat
 * session can fetch it directly and avoid re-submitting a food the catalogue
 * already holds.
 *
 * DELIBERATELY UNAUTHENTICATED, which is the interesting decision here. The
 * obvious design would put the contributor token on this endpoint too — but
 * this URL gets fetched by an AI chat session on the contributor's behalf,
 * which means the token would travel through a third-party fetcher and into a
 * chat transcript. The contents are brand and product names of publicly sold
 * dog food, i.e. a list anyone could rebuild from Google in an afternoon; it
 * exposes no user, dog, pricing, scoring or research data. Trading a
 * zero-value secret for keeping the real token out of transcripts is the right
 * way round.
 *
 * Response is text/plain rather than JSON on purpose: it is read by a language
 * model, and a flat list costs a fraction of the tokens of a JSON array of
 * objects, on a fetch the contributor pays for.
 */

// Cached for an hour: the catalogue changes slowly, contributors may fetch this
// repeatedly across a session, and it must not become a way to hammer the DB.
export const revalidate = 3600;

export async function GET() {
  const { data, error } = await supabaseAdmin
    .from('foods')
    .select('brand, name, is_treat')
    .order('brand')
    .order('name');

  if (error) {
    return new NextResponse('Could not load the food list. Try again shortly.', {
      status: 500,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    });
  }

  const rows = (data ?? []) as { brand: string; name: string; is_treat: boolean }[];
  const lines = rows.map(
    (r) => `${r.brand} — ${r.name}${r.is_treat ? ' [treat]' : ''}`
  );

  const body = [
    `Foods already in the Bowl database (${lines.length}). Do not submit any of these.`,
    'Anything not on this list is worth adding.',
    '',
    ...lines,
  ].join('\n');

  return new NextResponse(body, {
    status: 200,
    headers: {
      'content-type': 'text/plain; charset=utf-8',
      'cache-control': 'public, max-age=3600',
    },
  });
}
