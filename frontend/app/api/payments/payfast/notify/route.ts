import { NextRequest, NextResponse } from 'next/server';
import { getAdminDb } from '@backend/lib/adminDb';
import { verifySignature, amountsMatch, validateWithPayfast, isPayfastSource, type PayfastMode } from '@backend/lib/payfast';
import { markPaymentComplete, markPaymentFailed } from '@backend/lib/paymentCompletion';
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
 *   0. Source IP check (PayFast's subnets or current ITN host addresses)
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
  // Behind Cloudflare (tunnel/proxy) CF-Connecting-IP is the real client and
  // can't be spoofed; the first X-Forwarded-For entry can be set by the caller.
  const sourceIp =
    request.headers.get('cf-connecting-ip') || request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for');
  if (process.env.NODE_ENV === 'production' && !(await isPayfastSource(sourceIp))) {
    logger.warn('PayFast ITN: rejected unauthorized IP', { ip: sourceIp });
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

  const admin = getAdminDb();

  const { data: payment, error: fetchError } = await admin
    .from('payments')
    .select('id, application_id, invite_id, amount_gross, status')
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
    // raw_itn_payload is jsonb — this client binds params via node-postgres
    // directly (no Supabase/PostgREST layer to auto-serialize), so a plain
    // object must be stringified or Postgres rejects it as invalid JSON.
    await admin.from('payments').update({ status: 'failed', raw_itn_payload: JSON.stringify(fieldsObject) }).eq('id', payment.id);
    return NextResponse.json({ error: 'Amount mismatch.' }, { status: 400 });
  }

  const payfastStatus = fieldsObject.payment_status; // PayFast sends 'COMPLETE', 'FAILED', etc.
  const newStatus = payfastStatus === 'COMPLETE' ? 'complete' : 'failed';

  const itnFields = { pf_payment_id: fieldsObject.pf_payment_id ?? null, raw_itn_payload: JSON.stringify(fieldsObject) };
  if (newStatus === 'complete') {
    await markPaymentComplete(admin, payment, itnFields);
  } else {
    // A failed registration fee leaves the invite 'registered' so the tenant can try again.
    await markPaymentFailed(admin, payment, itnFields);
  }

  return NextResponse.json({ received: true });
}
