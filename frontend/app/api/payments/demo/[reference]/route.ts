import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { DEMO_MAX_ATTEMPTS, isSafeReturnPath } from '@backend/lib/demoGateway';
import { loadDemoPaymentForPayer } from '@/lib/demoPayment';

interface RouteParams {
  params: Promise<{ reference: string }>;
}

/** GET /api/payments/demo/[reference]: what the checkout page shows. */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { reference } = await params;
  try {
    const profile = await getAuthenticatedProfile(await getServerDb());
    const payment = await loadDemoPaymentForPayer(reference, profile.id);
    if (!payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });

    return NextResponse.json({
      reference: payment.m_payment_id,
      item_name: payment.item_name,
      amount: Number(payment.amount_gross),
      status: payment.status,
      failure_reason: payment.failure_reason,
      card_last4: payment.card_last4,
      attempts_left: Math.max(0, DEMO_MAX_ATTEMPTS - payment.attempts),
      return_url: payment.status === 'complete' && isSafeReturnPath(payment.return_url) ? payment.return_url : null,
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
