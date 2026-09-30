import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { isValidInviteToken } from '@backend/lib/invites';
import { paymentProvider } from '@backend/lib/demoGateway';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * POST /api/invites/[token]/confirm-payment
 *
 * Sandbox-only stand-in for PayFast's ITN webhook, for local/demo runs where
 * PayFast can't reach localhost (same workaround as
 * /api/applications/[id]/confirm-payment). Called by the admin fee success
 * page after PayFast redirects back.
 *
 * It trusts the browser's redirect rather than a verified notification, so
 * it is refused outright unless PAYFAST_MODE is 'sandbox' — in live mode the
 * invite is only ever marked paid by the ITN handler. Idempotent.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  if ((process.env.PAYFAST_MODE || 'sandbox') !== 'sandbox') {
    return NextResponse.json({ error: 'Payments are confirmed by PayFast directly.' }, { status: 404 });
  }
  if (!isValidInviteToken(token)) {
    return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);
    const admin = getAdminDb();

    const { data: invite, error } = await admin
      .from('tenant_invites')
      .select('id, status, tenant_id')
      .eq('token', token)
      .maybeSingle();
    if (error) throw new Error(`invite fetch failed: ${error.message}`);
    if (!invite || invite.status === 'revoked') {
      return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });
    }
    if (invite.tenant_id !== profile.id) {
      throw new ForbiddenError('You can only confirm your own admin fee.');
    }
    if (invite.status === 'paid') {
      return NextResponse.json({ status: 'paid' });
    }

    // EasyRent Pay settles payments itself when the card is approved; the
    // browser's return must never mark a declined payment as paid.
    if (paymentProvider() === 'demo') {
      return NextResponse.json({ error: 'The payment was not completed.' }, { status: 402 });
    }

    const { data: payment, error: paymentError } = await admin
      .from('payments')
      .select('id')
      .eq('invite_id', invite.id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (paymentError) throw new Error(`payment fetch failed: ${paymentError.message}`);
    if (!payment) {
      return NextResponse.json({ error: 'No payment was started for this admin fee.' }, { status: 400 });
    }

    const now = new Date().toISOString();
    await admin.from('payments').update({ status: 'complete', updated_at: now }).eq('id', payment.id);
    await admin.from('tenant_invites').update({ status: 'paid', paid_at: now, updated_at: now }).eq('id', invite.id).eq('status', 'registered');

    return NextResponse.json({ status: 'paid' });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
