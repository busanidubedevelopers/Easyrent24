import { getAdminDb } from '@backend/lib/adminDb';
import type { PaymentRow } from '@backend/lib/paymentCompletion';

// Shared lookup for the EasyRent Pay (demo gateway) routes.

export const DEMO_REFERENCE_REGEX = /^(APP|INV)-[0-9a-f-]{36}-\d{10,16}$/i;

export interface DemoPayment extends PaymentRow {
  m_payment_id: string;
  amount_gross: string | number;
  status: 'pending' | 'complete' | 'failed' | 'cancelled';
  item_name: string | null;
  return_url: string | null;
  cancel_url: string | null;
  attempts: number;
  failure_reason: string | null;
  card_last4: string | null;
}

/**
 * Loads a demo payment for the signed-in payer. Returns null for anyone
 * else, or for a reference that doesn't exist or isn't a demo payment, so
 * routes answer 404 without revealing which.
 */
export async function loadDemoPaymentForPayer(reference: string, profileId: string): Promise<DemoPayment | null> {
  if (!DEMO_REFERENCE_REGEX.test(reference)) return null;
  const admin = getAdminDb();
  const { data: payment, error } = await admin
    .from('payments')
    .select('id, application_id, invite_id, m_payment_id, amount_gross, status, provider, item_name, return_url, cancel_url, attempts, failure_reason, card_last4')
    .eq('m_payment_id', reference)
    .maybeSingle();
  if (error) throw new Error(`payment fetch failed: ${error.message}`);
  if (!payment || payment.provider !== 'demo') return null;

  let payerId: string | null = null;
  if (payment.application_id) {
    const { data } = await admin.from('applications').select('applicant_id').eq('id', payment.application_id).maybeSingle();
    payerId = data?.applicant_id ?? null;
  } else if (payment.invite_id) {
    const { data } = await admin.from('tenant_invites').select('tenant_id').eq('id', payment.invite_id).maybeSingle();
    payerId = data?.tenant_id ?? null;
  }
  if (payerId !== profileId) return null;

  return payment as DemoPayment;
}
