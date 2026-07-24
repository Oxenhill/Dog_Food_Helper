import { supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { deriveLifeStage } from '@/lib/lifeStage';

export async function GET(
  request: NextRequest,
  { params }: { params: { dogId: string } }
) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    const { data, error } = await supabaseAdmin
      .from('dogs')
      .select('*')
      .eq('id', params.dogId)
      .eq('owner_id', userId)
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 404 });
    }

    return NextResponse.json(data, { status: 200 });
  } catch (error) {
    console.error('Get dog error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  { params }: { params: { dogId: string } }
) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    const updates = await request.json();
    // Never allow direct updates to life_stage — it's system-derived
    delete updates.life_stage;

    // If date_of_birth or size_category are changing, re-derive life_stage
    // server-side so it doesn't go stale (fetch current values for whichever
    // field isn't part of this update).
    if ('date_of_birth' in updates || 'size_category' in updates) {
      const { data: current } = await supabaseAdmin
        .from('dogs')
        .select('date_of_birth, size_category')
        .eq('id', params.dogId)
        .eq('owner_id', userId)
        .single();

      const dateOfBirth = 'date_of_birth' in updates ? updates.date_of_birth : current?.date_of_birth;
      const sizeCategory = 'size_category' in updates ? updates.size_category : current?.size_category;
      updates.life_stage = await deriveLifeStage(dateOfBirth, sizeCategory);
    }

    const { data, error } = await supabaseAdmin
      .from('dogs')
      .update(updates)
      .eq('id', params.dogId)
      .eq('owner_id', userId)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: 'Dog profile updated',
        dog: data,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Update dog error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/dogs/[dogId] — removes a single dog from the owner's account.
 *
 * Anonymise, not hard-erase: this sets `owner_id = null` on the dog row
 * rather than deleting it, matching the app's documented data-deletion model
 * (architecture doc §10 / CLAUDE.md principle #5 — "Anonymise (nullable
 * owner_id) dog records so they keep contributing to research/pooled
 * signals"). It's the exact same mechanism src/lib/accountLifecycle.ts's
 * deleteAccount() uses for every dog owned by a user whose whole account is
 * being deleted; this route just scopes it to one dog instead of all of a
 * user's dogs, leaving every other column (health/food/log history) intact.
 *
 * Flag for the orchestrator: deleteAccount() (whole-account deletion) always
 * anonymises dogs — it never hard-erases them, because the account owner is
 * also being hard-deleted at the same time and the dog's history is
 * genuinely orphaned/anonymous at that point. A single-dog removal here is a
 * different situation: the owner's account stays active, so this endpoint
 * is intentionally choosing "anonymise" over "hard-erase" for consistency
 * with that existing semantics rather than because it's obviously the right
 * choice for a *voluntary single-dog removal while the account persists*.
 * Whether that's the correct behaviour (vs. hard-deleting a dog the owner
 * explicitly asked to remove, or offering the owner a choice) is a
 * GDPR/product decision this task does not have the authority to make — it
 * should be confirmed with the owner rather than silently assumed.
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: { dogId: string } }
) {
  try {
    const authedUser = await requireUser(request);
    const userId = authedUser?.id;
    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    const { data: existing, error: lookupError } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', params.dogId)
      .eq('owner_id', userId)
      .single();

    if (lookupError || !existing) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const { error: updateError } = await supabaseAdmin
      .from('dogs')
      .update({ owner_id: null })
      .eq('id', params.dogId)
      .eq('owner_id', userId);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ message: 'Dog removed' }, { status: 200 });
  } catch (error) {
    console.error('Delete dog error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
