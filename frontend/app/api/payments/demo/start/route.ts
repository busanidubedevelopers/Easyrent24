import { NextRequest, NextResponse } from 'next/server';
import { DEMO_REFERENCE_REGEX } from '@/lib/demoPayment';

/**
 * POST /api/payments/demo/start
 *
 * Entry point of EasyRent Pay, the demo gateway. The pay pages submit the
 * same hidden form they'd submit to PayFast; this sends the browser on to
 * the checkout page (303, so the follow-up is a GET).
 */
export async function POST(request: NextRequest) {
  const form = await request.formData().catch(() => null);
  const reference = String(form?.get('reference') ?? '');
  if (!DEMO_REFERENCE_REGEX.test(reference)) {
    return NextResponse.json({ error: 'Invalid payment reference.' }, { status: 400 });
  }
  return new NextResponse(null, { status: 303, headers: { Location: `/pay/${encodeURIComponent(reference)}` } });
}
