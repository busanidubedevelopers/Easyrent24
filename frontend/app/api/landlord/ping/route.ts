import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { requireAuthenticatedRole } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';

/**
 * GET /api/landlord/ping
 *
 * Demonstrates a role-gated route: only 'landlord' or 'admin' profiles can
 * call this successfully.
 *
 * 401 if not signed in at all.
 * 403 if signed in but role is 'tenant' or 'handyman'.
 */
export async function GET() {
  try {
    const db = await getServerDb();
    const profile = await requireAuthenticatedRole(db, ['landlord', 'admin']);
    return NextResponse.json({ message: `Hello landlord ${profile.full_name ?? profile.id}` });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
