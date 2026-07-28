import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * The terms-classification review queue (FOOD_DISCOVERY_DESIGN.md sec5).
 * Approval candidates and novel/low-confidence clauses only — refusals from
 * terms_clause_patterns already auto-applied and never show up here. This is
 * the ONE place a domain reaches source_domain_allowlist with approved=true;
 * nothing else in the recon pipeline writes that column.
 *
 * GET  — the queue: recon_status = 'approval_candidate', or
 *        'reviewed_pending_owner' with no confident pattern match (a novel
 *        clause). Each row carries its terms finding and robots.txt
 *        directives together, per sec5.4.
 * POST { domain_id, action: 'approve' | 'refuse', note? }
 *   Writes through to source_domain_allowlist. Refuse also accepts a note
 *   for why (recorded there, same as every other domain review).
 */

interface DomainRow {
  id: string;
  manufacturer_target_id: string;
  domain: string;
  website_url: string | null;
  brand_name: string | null;
  attribution_confidence: string;
  locale_status: string;
  robots_txt_raw: string | null;
  robots_reviewed_at: string | null;
  terms_url: string | null;
  terms_excerpt: string | null;
  recon_status: string;
  recon_notes: string | null;
  classified_shape: string | null;
  classification_confidence: string | null;
  matched_pattern_id: string | null;
}

export async function GET(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const { data, error } = await supabaseAdmin
    .from('manufacturer_target_domains')
    .select('*')
    .or('recon_status.eq.approval_candidate,and(recon_status.eq.reviewed_pending_owner,classification_confidence.neq.high)')
    .order('domain', { ascending: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  const rows = (data ?? []) as DomainRow[];
  const patternIds = [...new Set(rows.map((r) => r.matched_pattern_id).filter((v): v is string => v !== null))];

  const { data: patterns } = patternIds.length
    ? await supabaseAdmin.from('terms_clause_patterns').select('id, shape, rationale, version').in('id', patternIds)
    : { data: [] };

  const patternById = new Map((patterns ?? []).map((p) => [p.id, p]));

  const items = rows.map((row) => ({
    ...row,
    matched_pattern: row.matched_pattern_id ? patternById.get(row.matched_pattern_id) ?? null : null,
  }));

  return NextResponse.json({ items }, { status: 200 });
}

export async function POST(request: NextRequest) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  let body: { domain_id?: unknown; action?: unknown; note?: unknown };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  const domainId = typeof body.domain_id === 'string' ? body.domain_id : '';
  const action = body.action === 'approve' || body.action === 'refuse' ? body.action : null;
  const note = typeof body.note === 'string' && body.note.trim() ? body.note.trim() : null;

  if (!domainId || !action) {
    return NextResponse.json({ error: 'Provide `domain_id` and `action` ("approve" or "refuse").' }, { status: 400 });
  }
  if (action === 'refuse' && !note) {
    return NextResponse.json({ error: 'A review note is required to refuse a domain.' }, { status: 400 });
  }

  const { data: existing, error: fetchError } = await supabaseAdmin
    .from('manufacturer_target_domains')
    .select('*')
    .eq('id', domainId)
    .maybeSingle();

  if (fetchError) return NextResponse.json({ error: fetchError.message }, { status: 500 });
  if (!existing) return NextResponse.json({ error: 'Not found.' }, { status: 404 });

  const row = existing as DomainRow;
  if (row.recon_status !== 'approval_candidate' && row.recon_status !== 'reviewed_pending_owner') {
    return NextResponse.json(
      { error: `This domain is at status "${row.recon_status}", not queued for review.` },
      { status: 409 }
    );
  }

  const approved = action === 'approve';
  const decisionNote = note ?? `Owner decision via review queue, ${new Date().toISOString().slice(0, 10)}: ${approved ? 'approved' : 'refused'}.`;

  const { error: allowlistError } = await supabaseAdmin.from('source_domain_allowlist').upsert(
    {
      domain: row.domain,
      approved,
      robots_txt_checked_at: new Date().toISOString(),
      tos_reviewed_at: new Date().toISOString(),
      notes: decisionNote,
    },
    { onConflict: 'domain' }
  );

  if (allowlistError) return NextResponse.json({ error: allowlistError.message }, { status: 500 });

  const { error: updateError } = await supabaseAdmin
    .from('manufacturer_target_domains')
    .update({
      recon_status: approved ? 'owner_approved' : 'owner_rejected',
      recon_notes: `${row.recon_notes ?? ''} || Review queue decision by ${admin.id}, ${new Date().toISOString()}: ${approved ? 'approved' : 'refused'}. ${decisionNote}`,
    })
    .eq('id', domainId);

  if (updateError) return NextResponse.json({ error: updateError.message }, { status: 500 });

  return NextResponse.json({ status: approved ? 'approved' : 'refused', domain: row.domain }, { status: 200 });
}
