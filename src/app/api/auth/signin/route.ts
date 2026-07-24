import { supabase, supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Update last_active_at via supabaseAdmin (service role), not the shared
    // anon `supabase` client above — user_profiles now has RLS enabled
    // (id = auth.uid()) and that client is a module-level singleton shared
    // across concurrent requests on the server, so relying on its transient
    // post-signIn auth state for this write would be both unreliable and a
    // latent cross-request session bleed risk. supabaseAdmin bypasses RLS,
    // matching every other table write in this codebase.
    if (data.user) {
      await supabaseAdmin
        .from('user_profiles')
        .update({ last_active_at: new Date().toISOString() })
        .eq('id', data.user.id);
    }

    return NextResponse.json(
      {
        message: 'Sign in successful',
        user: data.user,
        session: data.session,
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('Sign in error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
