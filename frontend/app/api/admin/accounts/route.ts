import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, requireRole } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { query } from '@backend/lib/db';

const STATUSES = ['pending', 'approved', 'rejected'] as const;

/**
 * GET /api/admin/accounts?status=pending
 *
 * Landlord and agent accounts for the super admin to approve or reject,
 * newest first, with a count per status for the tabs.
 */
export async function GET(request: NextRequest) {
  try {
    const profile = await getAuthenticatedProfile(await getServerDb());
    requireRole(profile, ['admin']);

    const requested = request.nextUrl.searchParams.get('status') ?? 'pending';
    const status = (STATUSES as readonly string[]).includes(requested) ? requested : 'pending';

    const [accounts, counts] = await Promise.all([
      query(
        `SELECT u.id, u.email, u.full_name, u.phone, u.account_type, u.approval_status, u.created_at, u.approved_at,
                u.rejection_reason, a.full_name AS approved_by_name,
                (SELECT count(*)::int FROM public.properties p WHERE p.landlord_id = u.id) AS property_count
           FROM public.users u
           LEFT JOIN public.users a ON a.id = u.approved_by
          WHERE u.role = 'landlord' AND u.approval_status = $1
          ORDER BY u.created_at DESC
          LIMIT 200`,
        [status]
      ),
      query(
        `SELECT approval_status, count(*)::int AS n FROM public.users WHERE role = 'landlord' GROUP BY approval_status`
      ),
    ]);

    return NextResponse.json({
      status,
      accounts: accounts.rows,
      counts: Object.fromEntries(STATUSES.map((s) => [s, counts.rows.find((r) => r.approval_status === s)?.n ?? 0])),
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
