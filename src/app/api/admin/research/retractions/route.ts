import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { checkResearchRetraction } from '@/lib/researchRetractions';
import { supabaseAdmin } from '@/lib/supabase';

export const maxDuration = 300;

/**
 * Monthly-callable retraction watch. Safe to invoke manually: already-retracted
 * documents reuse the same unresolved-alert key and do not duplicate alerts.
 */
export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  let body: Record<string, unknown> = {};
  try {
    body = await request.json();
  } catch {
    // Defaults to all due documents, capped below.
  }
  const cap =
    typeof body.document_cap === 'number'
      ? Math.max(1, Math.min(Math.floor(body.document_cap), 100))
      : 50;

  const { data: documents, error } = await supabaseAdmin
    .from('research_documents')
    .select('id, doi, title, retracted, retraction_checked_at')
    .not('doi', 'is', null)
    .order('retraction_checked_at', { ascending: true, nullsFirst: true })
    .limit(cap);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const results = [];
  for (const document of documents ?? []) {
    const check = await checkResearchRetraction(document.doi);
    if (check.retracted) {
      const sourceNames = [
        check.europe_pmc.retracted ? 'Europe PMC' : null,
        check.crossref.retracted ? 'Crossref/Retraction Watch' : null,
      ].filter(Boolean);
      const { error: markError } = await supabaseAdmin.rpc(
        'mark_research_document_retracted',
        {
          p_document_id: document.id,
          p_checked_at: check.checked_at,
          p_source_message: `Retraction reported by ${sourceNames.join(' and ')}`,
        },
      );
      results.push({ document_id: document.id, title: document.title, check, error: markError?.message ?? null });
      continue;
    }

    if (check.europe_pmc.checked || check.crossref.checked) {
      const { error: updateError } = await supabaseAdmin
        .from('research_documents')
        .update({ retraction_checked_at: check.checked_at })
        .eq('id', document.id);
      results.push({
        document_id: document.id,
        title: document.title,
        check,
        error: updateError?.message ?? null,
      });
    } else {
      results.push({
        document_id: document.id,
        title: document.title,
        check,
        error: 'Neither retraction source could be checked',
      });
    }
  }

  return NextResponse.json({
    checked: results.length,
    retracted: results.filter((row) => row.check.retracted).length,
    results,
  });
}
