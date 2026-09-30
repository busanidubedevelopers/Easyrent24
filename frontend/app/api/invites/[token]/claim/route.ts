import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { UnauthorizedError, getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { claimBlocker, isValidInviteToken, type TenantInvite } from '@backend/lib/invites';
import { loadProperty } from '@backend/lib/applicationAccess';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * POST /api/invites/[token]/claim
 *
 * Links a freshly registered tenant account to the invite it signed up
 * with. The signed-in user's email must match the email the landlord/agent
 * invited, so a forwarded link can't be used by someone else. Safe to call
 * again by the same user (returns the invite unchanged).
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  if (!isValidInviteToken(token)) {
    return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);
    const { data: userData } = await db.auth.getUser();
    if (!userData?.user) throw new UnauthorizedError();

    if (profile.role !== 'tenant') {
      return NextResponse.json({ error: 'Only tenant accounts can register with an invite.' }, { status: 403 });
    }

    const admin = getAdminDb();
    const { data: invite, error: fetchError } = await admin
      .from('tenant_invites')
      .select('id, token, inviter_id, property_id, invitee_name, invitee_email, admin_fee_amount, status, tenant_id, expires_at')
      .eq('token', token)
      .maybeSingle();

    if (fetchError) {
      console.error('POST /api/invites/[token]/claim: DB fetch error', fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!invite) {
      return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });
    }

    const blocker = claimBlocker(invite as TenantInvite, { id: profile.id, email: userData.user.email });
    if (blocker) {
      return NextResponse.json({ error: blocker }, { status: 409 });
    }

    if (!invite.tenant_id) {
      // Conditional on tenant_id still being null, so two accounts racing
      // for the same invite can't both win.
      const { data: claimed, error: updateError } = await admin
        .from('tenant_invites')
        .update({ tenant_id: profile.id, status: 'registered', registered_at: new Date().toISOString() })
        .eq('id', invite.id)
        .is('tenant_id', null)
        .select('id');

      if (updateError) {
        console.error('POST /api/invites/[token]/claim: DB update error', updateError);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }
      if (!claimed || claimed.length === 0) {
        return NextResponse.json({ error: 'This invite has already been used.' }, { status: 409 });
      }
    }

    return NextResponse.json({
      invite: {
        status: invite.tenant_id ? invite.status : 'registered',
        admin_fee_amount: Number(invite.admin_fee_amount),
        property_id: invite.property_id,
        property: await loadProperty(admin, invite.property_id).then((p) => (p ? { title: p.title, address: p.address } : null)),
      },
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
