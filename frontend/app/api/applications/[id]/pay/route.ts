import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { getSupabaseAdmin } from '@backend/lib/supabaseAdmin';
import { toErrorResponse } from '@backend/lib/apiError';
import { buildPaymentRequest, PAYFAST_URLS, type PayfastMode } from '@backend/lib/payfast';
import { isValidUUID } from '@/lib/validation';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/applications/[id]/pay
 *
 * Initiates payment of the application fee. Returns the PayFast process URL
 * plus a set of signed form fields — the frontend is expected to render a
 * hidden form with these fields and auto-submit it (a plain GET redirect
 * with query params is NOT how PayFast's flow works; it requires a POST).
 *
 * Only the applicant themselves can pay for their own application. Fails
 * clearly if the application fee has already been paid, rather than
 * silently letting someone pay twice.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const profile = await getAuthenticatedProfile(supabase);

    const rateLimit = await checkRateLimit(profile.id, 'PAYMENTS');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Payment request rate limit exceeded. Please wait a moment.' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const { data: application, error: fetchError } = await supabase
      .from('applications')
      .select('id, applicant_id, application_fee_amount, payment_status, first_name, last_name')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`POST /api/applications/${id}/pay: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!application) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    if (application.applicant_id !== profile.id) {
      throw new ForbiddenError('You can only pay for your own application.');
    }
    if (application.payment_status === 'paid') {
      return NextResponse.json({ error: 'This application fee has already been paid.' }, { status: 400 });
    }

    const merchantId = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    const passphrase = process.env.PAYFAST_PASSPHRASE;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const mode = (process.env.PAYFAST_MODE as PayfastMode) || 'sandbox';

    if (!merchantId || !merchantKey || !appUrl) {
      console.error('POST /api/applications/[id]/pay: PayFast env vars not configured.');
      return NextResponse.json(
        { error: 'Payments are not configured yet. Please try again later.' },
        { status: 503 }
      );
    }

    const amount = Number(application.application_fee_amount);
    const mPaymentId = `APP-${application.id}-${Date.now()}`;

    // Use the admin client for writing the payment record — an applicant
    // has no INSERT policy on `payments` at all (migration 005, deliberately),
    // so this MUST go through the service-role client, not the user's own.
    const admin = getSupabaseAdmin();
    const { error: insertError } = await admin.from('payments').insert([
      {
        application_id: application.id,
        m_payment_id: mPaymentId,
        amount_gross: amount,
        status: 'pending',
      },
    ]);

    if (insertError) {
      console.error(`POST /api/applications/${id}/pay: DB insert error`, insertError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    await supabase.from('applications').update({ payment_status: 'pending' }).eq('id', id);

    const fields = buildPaymentRequest({
      merchantId,
      merchantKey,
      passphrase,
      returnUrl: `${appUrl}/apply/payment-success?application_id=${id}`,
      cancelUrl: `${appUrl}/apply/payment-cancelled?application_id=${id}`,
      notifyUrl: `${appUrl}/api/payments/payfast/notify`,
      mPaymentId,
      amount,
      itemName: 'EasyRent24 Application Fee',
      itemDescription: `Application fee for ${application.first_name} ${application.last_name}`,
      nameFirst: application.first_name,
      nameLast: application.last_name,
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
