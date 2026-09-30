import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { requireAuthenticatedRole } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';

/**
 * GET /api/handyman/list
 *
 * Returns verified handyman accounts so a landlord can pick one to assign
 * to a maintenance ticket. Landlord/admin only — this is contact info
 * (name, phone), not something every visitor should be able to enumerate.
 */
export async function GET() {
  try {
    const db = await getServerDb();
    await requireAuthenticatedRole(db, ['landlord', 'admin']);

    const { data, error } = await db
      .from('users')
      .select('id, full_name, phone, services_offered, experience_years, is_verified')
      .eq('role', 'handyman')
      .order('full_name', { ascending: true });

    if (error) {
      console.error('GET /api/handyman/list: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ handymen: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
