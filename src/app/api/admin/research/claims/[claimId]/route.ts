import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';
import {
  ResearchClaimDirection,
  ResearchClaimSubjectType,
} from '@/lib/types';

type RouteParams = { params: Promise<{ claimId: string }> };
type ReviewAction = 'approve' | 'reject' | 'edit_and_approve';

const SUBJECT_TYPES: ResearchClaimSubjectType[] = [
  'ingredient',
  'nutrient',
  'ingredient_class',
  'processing_method',
  'biome_marker',
];
const DIRECTIONS: ResearchClaimDirection[] = [
  'supports',
  'cautions_against',
  'neutral',
  'insufficient_evidence',
];
const LIFE_STAGES = ['growth', 'adult', 'senior', 'all_life_stages'] as const;

function optionalText(value: unknown, field: string): string | null {
  if (value === null || value === undefined || value === '') return null;
  if (typeof value !== 'string') throw new Error(`${field} must be text or null`);
  return value.trim();
}

/**
 * Explicit human review only. No path here auto-activates a claim based on its
 * grade. The database trigger independently re-checks literal quote provenance.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const admin = await requireAdmin(request);
  if (!admin) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { claimId } = await params;
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const action = body.action as ReviewAction | undefined;
  if (!action || !['approve', 'reject', 'edit_and_approve'].includes(action)) {
    return NextResponse.json(
      { error: 'action must be approve, reject, or edit_and_approve' },
      { status: 400 },
    );
  }

  const now = new Date().toISOString();
  const update: Record<string, unknown> = {
    reviewed_by: admin.id,
    reviewed_at: now,
  };

  try {
    if (action === 'reject') {
      const note = optionalText(body.review_note, 'review_note');
      if (!note) {
        return NextResponse.json(
          { error: 'A review note is required when rejecting a claim' },
          { status: 400 },
        );
      }
      update.status = 'rejected';
      update.review_note = note;
    } else {
      update.status = 'active';
      update.review_note = optionalText(body.review_note, 'review_note');
    }

    if (action === 'edit_and_approve') {
      const effectSummary = optionalText(body.effect_summary, 'effect_summary');
      const supportingQuote = optionalText(body.supporting_quote, 'supporting_quote');
      const subjectValue = optionalText(body.subject_value, 'subject_value');
      if (!effectSummary || !supportingQuote || !subjectValue) {
        return NextResponse.json(
          { error: 'effect_summary, supporting_quote, and subject_value are required' },
          { status: 400 },
        );
      }

      if (
        typeof body.subject_type !== 'string'
        || !SUBJECT_TYPES.includes(body.subject_type as ResearchClaimSubjectType)
      ) {
        return NextResponse.json({ error: 'Invalid subject_type' }, { status: 400 });
      }
      if (
        typeof body.direction !== 'string'
        || !DIRECTIONS.includes(body.direction as ResearchClaimDirection)
      ) {
        return NextResponse.json({ error: 'Invalid direction' }, { status: 400 });
      }

      const lifeStage = optionalText(body.applies_to_life_stage, 'applies_to_life_stage');
      if (lifeStage && !LIFE_STAGES.includes(lifeStage as (typeof LIFE_STAGES)[number])) {
        return NextResponse.json({ error: 'Invalid applies_to_life_stage' }, { status: 400 });
      }

      Object.assign(update, {
        effect_summary: effectSummary,
        supporting_quote: supportingQuote,
        subject_type: body.subject_type,
        subject_value: subjectValue,
        applies_to_condition: optionalText(body.applies_to_condition, 'applies_to_condition'),
        applies_to_life_stage: lifeStage,
        direction: body.direction,
      });
    }
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Invalid review fields' },
      { status: 400 },
    );
  }

  const { data, error } = await supabaseAdmin
    .from('research_claims')
    .update(update)
    .eq('id', claimId)
    .select()
    .maybeSingle();

  if (error) {
    const literalQuoteFailure = error.message.includes('literal substring');
    return NextResponse.json(
      {
        error: literalQuoteFailure
          ? 'The supporting quote is not a literal substring of its source chunk. The claim was not saved.'
          : error.message,
      },
      { status: literalQuoteFailure ? 400 : 500 },
    );
  }
  if (!data) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({ claim: data });
}
