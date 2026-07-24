import { supabase, supabaseAdmin } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { email, password, display_name } = await request.json();

    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email and password are required' },
        { status: 400 }
      );
    }

    // Sign up user
    const { data: authData, error: authError } = await supabase.auth.signUp({
      email,
      password,
    });

    if (authError) {
      return NextResponse.json({ error: authError.message }, { status: 400 });
    }

    if (!authData.user) {
      return NextResponse.json(
        { error: 'Failed to create user' },
        { status: 500 }
      );
    }

    // Create user profile via the service-role client, not the shared anon
    // `supabase` client above: user_profiles now has RLS enabled
    // (id = auth.uid()), and signUp() may not return an active session at
    // all (email confirmation enabled) — so there's no reliable auth.uid()
    // for this insert to satisfy. supabaseAdmin bypasses RLS, matching every
    // other table write in this codebase.
    //
    // Admin bootstrap: if ADMIN_EMAILS (comma-separated) is set and this
    // email matches (case-insensitive), the new profile is created as an
    // admin. This replaces needing a manual SQL UPDATE to grant the first
    // admin — see .env.example.
    const adminEmails = (process.env.ADMIN_EMAILS ?? '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);
    const isBootstrapAdmin = adminEmails.includes(String(email).toLowerCase());

    const { error: profileError } = await supabaseAdmin
      .from('user_profiles')
      .insert({
        id: authData.user.id,
        display_name: display_name || email,
        last_active_at: new Date().toISOString(),
        is_admin: isBootstrapAdmin,
      });

    if (profileError) {
      return NextResponse.json({ error: profileError.message }, { status: 500 });
    }

    return NextResponse.json(
      {
        message: 'Sign up successful',
        user: authData.user,
      },
      { status: 201 }
    );
  } catch (error) {
    console.error('Sign up error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
