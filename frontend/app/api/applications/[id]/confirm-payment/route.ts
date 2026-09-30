import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { isValidApplicationStatusTransition, type ApplicationStatus } from '@backend/lib/applications';
import { isValidUUID } from '@/lib/validation';
import { paymentProvider } from '@backend/lib/demoGateway';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/applications/[id]/confirm-payment
 *
 * Called by the payment-success return page right after PayFast redirects
 * back from a completed sandbox payment. PayFast's own webhook (ITN) is the
 * "real" way this would normally get confirmed — see
 * app/api/payments/payfast/notify/route.ts — but it can't reach localhost
 * during local development/demo (backend/docs/LOCAL_TESTING_NGROK.md). This
 * is the same documented workaround already used for escrow funding:
 * confirm off the client-side redirect instead.
 *
 * The application fee is mandatory — POST /api/applications/[id] refuses to
 * approve an application whose payment_status isn't 'paid', so this is the
 * route that actually gets it there for a local/demo run.
 *
 * Idempotent — re-confirming an already-paid application is a no-op, same
 * as the ITN webhook's own idempotency guarantee.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  // This trusts the browser's redirect, not a verified PayFast notification,
  // so it only exists in sandbox mode. Live payments are confirmed by the ITN.
  if ((process.env.PAYFAST_MODE || 'sandbox') !== 'sandbox') {
    return NextResponse.json({ error: 'Payments are confirmed by PayFast directly.' }, { status: 404 });
  }

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: application, error: fetchError } = await db
      .from('applications')
      .select('id, applicant_id, status, payment_status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`POST /api/applications/${id}/confirm-payment: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!application) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    if (application.applicant_id !== profile.id) {
      throw new ForbiddenError('You can only confirm payment on your own application.');
    }

    if (application.payment_status === 'paid') {
      return NextResponse.json({ application });
    }

    // EasyRent Pay settles payments itself when the card is approved; the
    // browser's return must never mark a declined payment as paid.
    if (paymentProvider() === 'demo') {
      return NextResponse.json({ error: 'The payment was not completed.' }, { status: 402 });
    }

    const { data: payment, error: paymentError } = await db
      .from('payments')
      .select('id, status')
      .eq('application_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (paymentError) {
      console.error(`POST /api/applications/${id}/confirm-payment: payment fetch error`, paymentError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!payment) {
      return NextResponse.json(
        { error: 'No payment was initiated for this application.' },
        { status: 400 }
      );
    }

    await db.from('payments').update({ status: 'complete' }).eq('id', payment.id);

    const updates: Record<string, unknown> = {
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
    };

    // Only auto-advance status if that transition is actually valid from
    // where the application currently is — mirrors the ITN webhook's own
    // caution about not force-moving an already-cancelled application.
    if (isValidApplicationStatusTransition(application.status as ApplicationStatus, 'reviewing')) {
      updates.status = 'reviewing';
    }

    const { data: updated, error: updateError } = await db
      .from('applications')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error(`POST /api/applications/${id}/confirm-payment: update error`, updateError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ application: updated });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
