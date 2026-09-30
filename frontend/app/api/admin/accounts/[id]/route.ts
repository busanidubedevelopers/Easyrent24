import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, requireRole } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { query } from '@backend/lib/db';
import { sendEmail, accountDecisionEmail } from '@backend/lib/email';
import { isValidUUID } from '@/lib/validation';
import { appOrigin } from '@/lib/appUrl';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/admin/accounts/[id]  { action: 'approve' | 'reject', reason? }
 *
 * The super admin approves or rejects a landlord/agent account. Approval
 * lets them sign in; rejection keeps them out, with the reason shown when
 * they try. A decision can be reversed later (e.g. approve after a rejection).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const profile = await getAuthenticatedProfile(await getServerDb());
    requireRole(profile, ['admin']);

    const body = await request.json().catch(() => ({}));
    const action = body.action;
    const reason = typeof body.reason === 'string' ? body.reason.trim().slice(0, 500) : '';
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ error: 'Action must be approve or reject.' }, { status: 400 });
    }
    if (action === 'reject' && !reason) {
      return NextResponse.json({ error: 'Give a reason for rejecting the account.' }, { status: 400 });
    }

    const result = await query(
      `UPDATE public.users
          SET approval_status = $2,
              approved_at = CASE WHEN $2 = 'approved' THEN now() ELSE NULL END,
              approved_by = $3,
              rejection_reason = CASE WHEN $2 = 'rejected' THEN $4 ELSE NULL END,
              is_verified = ($2 = 'approved'),
              updated_at = now()
        WHERE id = $1 AND role = 'landlord'
        RETURNING id, email, full_name, account_type, approval_status, approved_at, rejection_reason`,
      [id, action === 'approve' ? 'approved' : 'rejected', profile.id, reason || null]
    );
    const account = result.rows[0];
    if (!account) {
      return NextResponse.json({ error: 'Landlord or agent account not found.' }, { status: 404 });
    }

    const emailed = await sendEmail(
      accountDecisionEmail({
        to: account.email,
        name: account.full_name || account.email,
        approved: account.approval_status === 'approved',
        reason: account.rejection_reason,
        signInUrl: `${appOrigin(request)}/signin`,
      })
    );

    return NextResponse.json({ account, emailed });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
