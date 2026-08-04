import { supabase } from '@/lib/supabase';
import { NextRequest, NextResponse } from 'next/server';

// Resolves the public origin the same way src/app/contribute/page.tsx does,
// so the recovery link Supabase emails points at the actual deployment
// rather than an internal/preview host. NEXT_PUBLIC_SITE_URL, if set, wins.
function baseUrlFromRequest(request: NextRequest): string {
  const explicit = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicit) return explicit.replace(/\/$/, '');
  const host =
    request.headers.get('x-forwarded-host') ?? request.headers.get('host') ?? 'localhost:3000';
  const proto =
    request.headers.get('x-forwarded-proto') ?? (host.startsWith('localhost') ? 'http' : 'https');
  return `${proto}://${host}`;
}

export async function POST(request: NextRequest) {
  try {
    const { email } = await request.json();

    if (!email) {
      return NextResponse.json({ error: 'Email is required' }, { status: 400 });
    }

    const redirectTo = `${baseUrlFromRequest(request)}/reset-password`;
    const { error } = await supabase.auth.resetPasswordForEmail(email, { redirectTo });

    // Supabase's resetPasswordForEmail doesn't reveal whether the account
    // exists, so a generic message here is correct, not just cautious.
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json(
      { message: 'If an account exists for that email, a reset link has been sent.' },
      { status: 200 }
    );
  } catch (error) {
    console.error('Forgot password error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
