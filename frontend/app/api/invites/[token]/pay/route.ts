import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { buildPaymentRequest, PAYFAST_URLS, type PayfastMode } from '@backend/lib/payfast';
import { isValidInviteToken } from '@backend/lib/invites';
import { loadProperty } from '@backend/lib/applicationAccess';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';
import { browserReturnBase } from '@/lib/appUrl';
import { paymentProvider } from '@backend/lib/demoGateway';
import { TENANT_FEE_ZAR } from '@backend/lib/applications';

interface RouteParams {
  params: Promise<{ token: string }>;
}

/**
 * POST /api/invites/[token]/pay
 *
 * Initiates payment of the registration admin fee set by the landlord/agent
 * on this invite. Same shape as /api/applications/[id]/pay: returns the
 * PayFast process URL plus signed fields for the frontend to POST.
 *
 * Only the tenant who claimed the invite can pay it, and the amount always
 * comes from the invite row — never from the request.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { token } = await params;

  if (!isValidInviteToken(token)) {
    return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const rateLimit = await checkRateLimit(profile.id, 'PAYMENTS');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Payment request rate limit exceeded. Please wait a moment.' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const admin = getAdminDb();
    const { data: invite, error: fetchError } = await admin
      .from('tenant_invites')
      .select('id, property_id, invitee_name, invitee_email, admin_fee_amount, status, tenant_id')
      .eq('token', token)
      .maybeSingle();

    if (fetchError) {
      console.error('POST /api/invites/[token]/pay: DB fetch error', fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!invite || invite.status === 'revoked') {
      return NextResponse.json({ error: 'Invalid invite link.' }, { status: 404 });
    }
    if (invite.tenant_id !== profile.id) {
      throw new ForbiddenError('You can only pay the admin fee for your own registration.');
    }
    if (invite.status === 'paid') {
      return NextResponse.json({ error: 'The admin fee has already been paid.' }, { status: 400 });
    }

    // Every tenant pays the same fee, whatever an older invite row says.
    const amount = TENANT_FEE_ZAR;
    const mPaymentId = `INV-${invite.id}-${Date.now()}`;

    // Demo mode: our own in-app gateway (EasyRent Pay) instead of PayFast.
    if (paymentProvider() === 'demo') {
      const { error: demoInsertError } = await admin.from('payments').insert([
        {
          invite_id: invite.id,
          m_payment_id: mPaymentId,
          amount_gross: amount,
          status: 'pending',
          provider: 'demo',
          item_name: `EasyRent24 Admin Fee - ${invite.invitee_name}`,
          return_url: `/register/payment-success?invite=${token}`,
          cancel_url: `/register/pay?invite=${token}&cancelled=1`,
        },
      ]);
      if (demoInsertError) {
        console.error('POST /api/invites/[token]/pay: DB insert error', demoInsertError);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }
      return NextResponse.json({ processUrl: '/api/payments/demo/start', fields: { reference: mPaymentId } });
    }

    const merchantId = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    const passphrase = process.env.PAYFAST_PASSPHRASE;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const mode = (process.env.PAYFAST_MODE as PayfastMode) || 'sandbox';

    if (!merchantId || !merchantKey || !appUrl) {
      console.error('POST /api/invites/[token]/pay: PayFast env vars not configured.');
      return NextResponse.json(
        { error: 'Payments are not configured yet. Please try again later.' },
        { status: 503 }
      );
    }


    const { error: insertError } = await admin.from('payments').insert([
      {
        invite_id: invite.id,
        m_payment_id: mPaymentId,
        amount_gross: amount,
        status: 'pending',
      },
    ]);

    if (insertError) {
      console.error('POST /api/invites/[token]/pay: DB insert error', insertError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const [firstName, ...rest] = invite.invitee_name.trim().split(/\s+/);
    const property = await loadProperty(admin, invite.property_id);

    const fields = buildPaymentRequest({
      merchantId,
      merchantKey,
      passphrase,
      returnUrl: `${browserReturnBase(appUrl)}/register/payment-success?invite=${token}`,
      cancelUrl: `${browserReturnBase(appUrl)}/register/pay?invite=${token}&cancelled=1`,
      notifyUrl: `${appUrl}/api/payments/payfast/notify`,
      mPaymentId,
      amount,
      itemName: 'EasyRent24 Admin Fee',
      itemDescription: property ? `Tenant registration admin fee - ${property.title}` : 'Tenant registration admin fee',
      nameFirst: firstName,
      nameLast: rest.join(' ') || undefined,
      emailAddress: invite.invitee_email,
    });

    return NextResponse.json({
      processUrl: PAYFAST_URLS[mode].process,
      fields,
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
