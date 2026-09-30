import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@backend/lib/adminDb';
import { isInviteExpired, isValidInviteToken } from '@backend/lib/invites';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';
import { loadProperty, loadUsers } from '@backend/lib/applicationAccess';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * GET /api/invites/[token]
 *
 * Public preview of an invite, for the signup page: who it's for, which
 * property, and the admin fee. Unauthenticated by design — the tenant has
 * no account yet — so it reads through the service-role client and returns
 * only what the link holder needs to see. Rate limited per IP to make token
 * guessing pointless on top of the token's 256 bits.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  if (!isValidInviteToken(token)) {
    return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });
  }

  const ip = (request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip') || 'unknown').split(',')[0].trim();
  const rateLimit = await checkRateLimit(`invite-preview:${ip}`, 'READS');
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please slow down.' },
      { status: 429, headers: getRateLimitHeaders(rateLimit) }
    );
  }

  const admin = getAdminDb();
  const { data: invite, error } = await admin
    .from('tenant_invites')
    .select('inviter_id, property_id, invitee_name, invitee_email, admin_fee_amount, status, expires_at')
    .eq('token', token)
    .maybeSingle();

  if (error) {
    console.error('GET /api/invites/[token]: DB error', error);
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  if (!invite || invite.status === 'revoked') {
    return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });
  }

  const [propertyRow, users] = await Promise.all([loadProperty(admin, invite.property_id), loadUsers(admin, [invite.inviter_id])]);
  const property = propertyRow ? { title: propertyRow.title, address: propertyRow.address } : null;
  const inviter = users.get(invite.inviter_id) ?? null;

  return NextResponse.json({
    invite: {
      invitee_name: invite.invitee_name,
      invitee_email: invite.invitee_email,
      admin_fee_amount: Number(invite.admin_fee_amount),
      status: invite.status,
      expired: invite.status === 'pending' && isInviteExpired(invite),
      property,
      inviter_name: inviter?.full_name ?? null,
    },
  });
}
