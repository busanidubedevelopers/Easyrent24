import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { chargeDemoCard, isSafeReturnPath, paymentProvider, DEMO_MAX_ATTEMPTS } from '@backend/lib/demoGateway';
import { markPaymentComplete, markPaymentFailed } from '@backend/lib/paymentCompletion';
import { loadDemoPaymentForPayer } from '@/lib/demoPayment';

interface RouteParams {
  params: Promise<{ reference: string }>;
}

/**
 * POST /api/payments/demo/[reference]/charge
 *
 * Charges a card through EasyRent Pay. Only the demo test card approves;
 * every other card is declined. Approval settles the fee through the same
 * code path as a verified PayFast ITN. Card details are never stored or
 * logged — only the last four digits are kept on the payment record.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { reference } = await params;
  try {
    // Throws if someone pairs the demo gateway with live PayFast.
    if (paymentProvider() !== 'demo') {
      return NextResponse.json({ error: 'The demo gateway is switched off.' }, { status: 404 });
    }
    const profile = await getAuthenticatedProfile(await getServerDb());
    const payment = await loadDemoPaymentForPayer(reference, profile.id);
    if (!payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });

    const returnUrl = isSafeReturnPath(payment.return_url) ? payment.return_url : '/';
    if (payment.status === 'complete') {
      return NextResponse.json({ outcome: 'approved', return_url: returnUrl });
    }
    if (payment.status === 'cancelled') {
      return NextResponse.json({ error: 'This payment was cancelled. Please start again.' }, { status: 400 });
    }
    if (payment.attempts >= DEMO_MAX_ATTEMPTS) {
      return NextResponse.json({ error: 'Too many attempts. Please start the payment again.' }, { status: 429 });
    }

    const card = await request.json().catch(() => ({}));
    const result = chargeDemoCard(card);
    if (result.outcome === 'invalid') {
      return NextResponse.json({ outcome: 'invalid', errors: result.errors }, { status: 400 });
    }

    const admin = getAdminDb();
    const attempt = { attempts: payment.attempts + 1, card_last4: result.last4 };
    if (result.outcome === 'approved') {
      await markPaymentComplete(admin, payment, { ...attempt, failure_reason: null, pf_payment_id: `ERP-${Date.now()}` });
      return NextResponse.json({ outcome: 'approved', return_url: returnUrl });
    }

    await markPaymentFailed(admin, payment, { ...attempt, failure_reason: result.reason });
    return NextResponse.json({
      outcome: 'declined',
      reason: result.reason,
      attempts_left: Math.max(0, DEMO_MAX_ATTEMPTS - attempt.attempts),
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
