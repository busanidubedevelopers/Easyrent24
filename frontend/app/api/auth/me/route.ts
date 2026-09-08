import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';

/**
 * GET /api/auth/me
 *
 * Returns the currently authenticated user's profile. Any signed-in role
 * (tenant, landlord, handyman, admin) can call this — it's the simplest
 * possible proof that session cookies flow correctly from browser sign-in
 * all the way through to a server-side API route.
 *
 * 401 if not signed in.
 */
export async function GET() {
  try {
    const supabase = await getSupabaseServerClient();
    const profile = await getAuthenticatedProfile(supabase);
    return NextResponse.json({ profile });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
