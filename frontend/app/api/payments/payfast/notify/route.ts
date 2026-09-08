import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseAdmin } from '@backend/lib/supabaseAdmin';
import { verifySignature, amountsMatch, validateWithPayfast, isPayfastIp, type PayfastMode } from '@backend/lib/payfast';
import { isValidApplicationStatusTransition, type ApplicationStatus } from '@backend/lib/applications';
import { logger } from '@backend/lib/security/logger';

/**
 * POST /api/payments/payfast/notify
 *
 * PayFast's ITN (Instant Transaction Notification) webhook. This is the ONE
 * route in this entire project that must accept unauthenticated requests by
 * design — PayFast's servers call this directly, with no user session and
 * no way to attach our auth cookies. Every other route in this codebase
 * requires a signed-in user; this one instead must independently prove the
 * request really came from PayFast, using three separate checks:
 *
 *   0. IP whitelisting (validates request originates from PayFast subnets)
 *   1. Signature verification (was the data tampered with in transit?)
 *   2. Server-to-server validation callback (did this genuinely originate
 *      from PayFast's servers, not just something that knows our passphrase?)
 *   3. Amount matching (does the paid amount match what we expected for
 *      this specific payment record, not just "a" valid PayFast payment?)
 *
 * All checks must pass before an application's status changes. Idempotent
 * by design — PayFast may resend the same notification, and reprocessing
 * an already-'complete' payment is a safe no-op, not a duplicate action.
 */
export async function POST(request: NextRequest) {
  // --- Check 0: PayFast IP Whitelist (production enforcement) ---
  const forwardedFor = request.headers.get('x-forwarded-for') || request.headers.get('x-real-ip');
  if (process.env.NODE_ENV === 'production' && !isPayfastIp(forwardedFor)) {
    logger.warn('PayFast ITN: rejected unauthorized IP', { ip: forwardedFor });
    return NextResponse.json({ error: 'Unauthorized IP.' }, { status: 403 });
  }

  const rawBody = await request.text();
  const params = new URLSearchParams(rawBody);
  const entries = Array.from(params.entries());
  const fieldsObject = Object.fromEntries(entries);

  const passphrase = process.env.PAYFAST_PASSPHRASE;
  const mode = (process.env.PAYFAST_MODE as PayfastMode) || 'sandbox';

  // --- Check 1: signature ---
  const signatureValid = verifySignature(entries, fieldsObject.signature, passphrase);
  if (!signatureValid) {
    logger.error('PayFast ITN: invalid signature', undefined, { mPaymentId: fieldsObject.m_payment_id });
    return NextResponse.json({ error: 'Invalid signature.' }, { status: 400 });
  }

  // --- Check 2: server-to-server validation with PayFast ---
  // See the NOTE on validateWithPayfast — this call cannot be exercised in
  // a network-sandboxed environment and must be confirmed against a real
  // sandbox account before this goes live.
  const serverValidated = await validateWithPayfast(rawBody, mode);
  if (!serverValidated) {
    logger.error('PayFast ITN: server-to-server validation failed', undefined, { mPaymentId: fieldsObject.m_payment_id });
    return NextResponse.json({ error: 'Could not validate with PayFast.' }, { status: 400 });
  }

  const mPaymentId = fieldsObject.m_payment_id;
  if (!mPaymentId) {
    return NextResponse.json({ error: 'Missing m_payment_id.' }, { status: 400 });
  }

  const admin = getSupabaseAdmin();

  const { data: payment, error: fetchError } = await admin
    .from('payments')
    .select('id, application_id, amount_gross, status')
    .eq('m_payment_id', mPaymentId)
    .maybeSingle();

  if (fetchError) {
    console.error('PayFast ITN: DB error fetching payment record', { mPaymentId, error: fetchError.message });
    return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
  }
  if (!payment) {
    // We never created a payment record for this m_payment_id — either a
    // stale/forged notification, or something went wrong when initiating
    // payment. Either way, there's nothing safe to update.
    console.error('PayFast ITN: no matching payment record', { mPaymentId });
    return NextResponse.json({ error: 'Unknown payment reference.' }, { status: 404 });
  }

  // --- Idempotency: already processed, nothing more to do ---
  if (payment.status === 'complete') {
    return NextResponse.json({ received: true, alreadyProcessed: true });
  }

  // --- Check 3: amount matching ---
  const paidAmount = fieldsObject.amount_gross;
  if (!paidAmount || !amountsMatch(Number(payment.amount_gross), paidAmount)) {
    // Log only the payment ID, not the amounts — amounts are PII when tied to an identity.
    console.error('PayFast ITN: amount mismatch', { mPaymentId });
    await admin.from('payments').update({ status: 'failed', raw_itn_payload: fieldsObject }).eq('id', payment.id);
    return NextResponse.json({ error: 'Amount mismatch.' }, { status: 400 });
  }

  const payfastStatus = fieldsObject.payment_status; // PayFast sends 'COMPLETE', 'FAILED', etc.
  const newStatus = payfastStatus === 'COMPLETE' ? 'complete' : 'failed';

  await admin
    .from('payments')
    .update({
      status: newStatus,
      pf_payment_id: fieldsObject.pf_payment_id ?? null,
      raw_itn_payload: fieldsObject,
    })
    .eq('id', payment.id);

  if (newStatus === 'complete' && payment.application_id) {
    const { data: application } = await admin
      .from('applications')
      .select('status')
      .eq('id', payment.application_id)
      .maybeSingle();

    const updates: Record<string, unknown> = {
      payment_status: 'paid',
      paid_at: new Date().toISOString(),
    };

    // Only auto-advance the application status if that transition is
    // actually valid from its current state — e.g. don't try to move an
    // already-cancelled application to 'reviewing' just because a stale
    // payment notification arrived after the fact.
    if (application && isValidApplicationStatusTransition(application.status as ApplicationStatus, 'reviewing')) {
      updates.status = 'reviewing';
    }

    await admin.from('applications').update(updates).eq('id', payment.application_id);
  } else if (newStatus === 'failed' && payment.application_id) {
    await admin.from('applications').update({ payment_status: 'failed' }).eq('id', payment.application_id);
  }

  return NextResponse.json({ received: true });
}
