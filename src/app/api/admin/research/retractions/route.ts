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
      const reason = `Retraction reported by ${sourceNames.join(' and ')}`;

      // propagate_research_document_status_change raises on an
      // already-retracted document (it is a one-way transition, not an
      // idempotent field write) -- a document already marked retracted by an
      // earlier run just gets its checked_at refreshed, matching the
      // no-duplicate-alert guarantee this route has always made.
      let propagateError: { message: string } | null = null;
      if (document.retracted) {
        const { error: touchError } = await supabaseAdmin
          .from('research_documents')
          .update({ retraction_checked_at: check.checked_at })
          .eq('id', document.id);
        propagateError = touchError;
      } else {
        const { error } = await supabaseAdmin.rpc('propagate_research_document_status_change', {
          p_document_id: document.id,
          p_action: 'retract',
          p_replacement_document_id: null,
          p_actor_id: null,
          p_actor_type: 'system',
          p_reason: reason,
        });
        propagateError = error;
      }
      // Surfaced separately from the atomic propagation transaction: an
      // admin-visible operational alert, deduped by check_name, same as
      // every other system_alerts producer. Best-effort -- a failure here
      // must not be reported as a propagation failure.
      if (!propagateError) {
        const { data: existingAlert } = await supabaseAdmin
          .from('system_alerts')
          .select('id')
          .eq('check_name', `research_retraction:${document.id}`)
          .is('resolved_at', null)
          .maybeSingle();
        if (!existingAlert) {
          await supabaseAdmin.from('system_alerts').insert({
            check_name: `research_retraction:${document.id}`,
            message: `${document.title ?? document.id}: ${reason}`,
          });
        }
      }
      results.push({ document_id: document.id, title: document.title, check, error: propagateError?.message ?? null });
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
