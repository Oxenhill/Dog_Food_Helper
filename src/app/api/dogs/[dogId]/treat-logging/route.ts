import { NextRequest, NextResponse } from 'next/server';
import { requireUser } from '@/lib/serverAuth';
import { supabaseAdmin } from '@/lib/supabase';

/**
 * POST /api/dogs/[dogId]/treat-logging — the per-dog treat-logging preference.
 *
 * Treat logging is opt-in and stays off by default. Most owners will not log
 * every treat, and a half-kept treat log is worse than none, because it
 * produces confident-looking correlations from partial data. The correlation
 * engine reads this flag and states which way it was set rather than silently
 * assuming no treats were given.
 *
 * A dedicated endpoint rather than the generic dog PUT so the dismissal
 * timestamp is set server-side — a client-supplied "when I dismissed this"
 * is not something to take on trust.
 *
 * Body: { enabled?: boolean, dismiss_prompt?: boolean }
 */
export async function POST(request: NextRequest, { params }: { params: { dogId: string } }) {
  try {
    const user = await requireUser(request);
    if (!user) {
      return NextResponse.json({ error: 'Authentication required' }, { status: 401 });
    }

    const { enabled, dismiss_prompt } = await request.json();

    if (enabled === undefined && dismiss_prompt === undefined) {
      return NextResponse.json(
        { error: 'enabled or dismiss_prompt is required' },
        { status: 400 }
      );
    }
    if (enabled !== undefined && typeof enabled !== 'boolean') {
      return NextResponse.json({ error: 'enabled must be a boolean' }, { status: 400 });
    }

    const { data: dog, error: dogError } = await supabaseAdmin
      .from('dogs')
      .select('id')
      .eq('id', params.dogId)
      .eq('owner_id', user.id)
      .single();

    if (dogError || !dog) {
      return NextResponse.json({ error: 'Dog not found' }, { status: 404 });
    }

    const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (enabled !== undefined) {
      updates.treat_logging_enabled = enabled;
      // Turning it on answers the prompt, so it should never fire again.
      if (enabled) updates.treat_logging_prompt_dismissed_at = new Date().toISOString();
    }
    if (dismiss_prompt) {
      updates.treat_logging_prompt_dismissed_at = new Date().toISOString();
    }

    const { data, error } = await supabaseAdmin
      .from('dogs')
      .update(updates)
      .eq('id', params.dogId)
      .eq('owner_id', user.id)
      .select('id, treat_logging_enabled, treat_logging_prompt_dismissed_at')
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: 'Treat logging preference updated',
        treat_logging_enabled: data.treat_logging_enabled,
        treat_logging_prompt_dismissed: data.treat_logging_prompt_dismissed_at != null,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Treat logging preference error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
