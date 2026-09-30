import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { isSafeReturnPath } from '@backend/lib/demoGateway';
import { loadDemoPaymentForPayer } from '@/lib/demoPayment';

interface RouteParams {
  params: Promise<{ reference: string }>;
}

/** POST /api/payments/demo/[reference]/cancel: the shopper backs out. */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { reference } = await params;
  try {
    const profile = await getAuthenticatedProfile(await getServerDb());
    const payment = await loadDemoPaymentForPayer(reference, profile.id);
    if (!payment) return NextResponse.json({ error: 'Payment not found.' }, { status: 404 });

    if (payment.status === 'pending' || payment.status === 'failed') {
      await getAdminDb()
        .from('payments')
        .update({ status: 'cancelled', updated_at: new Date().toISOString() })
        .eq('id', payment.id);
    }
    return NextResponse.json({ cancel_url: isSafeReturnPath(payment.cancel_url) ? payment.cancel_url : '/' });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
