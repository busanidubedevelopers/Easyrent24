import { NextRequest, NextResponse } from 'next/server';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { getServerDb } from '@/lib/serverDb';

/**
 * GET /api/auth/me
 *
 * Returns the authenticated user's profile from the JWT cookie.
 * Used by the list-property page and other client components that
 * need to confirm role before showing landlord-only UI.
 */
export async function GET(_request: NextRequest) {
  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    return NextResponse.json({
      user: {
        id: profile.id,
        email: profile.email,
        user_metadata: {
          full_name: profile.full_name,
          role: profile.role,
        },
        role: profile.role,
      },
      profile,
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
