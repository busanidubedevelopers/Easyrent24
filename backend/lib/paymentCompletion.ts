import type { DbClient } from './applicationAccess';
import { isValidApplicationStatusTransition, type ApplicationStatus } from './applications';

// What happens when a payment succeeds, in one place — shared by PayFast's
// ITN webhook and the built-in demo gateway, so a demo payment has exactly
// the same effect as a real one.

export interface PaymentRow {
  id: string;
  application_id: string | null;
  invite_id: string | null;
}

/** Marks the payment complete and settles what it paid for. Idempotent. */
export async function markPaymentComplete(
  db: DbClient,
  payment: PaymentRow,
  extra: Record<string, unknown> = {}
): Promise<void> {
  const now = new Date().toISOString();
  await db.from('payments').update({ status: 'complete', updated_at: now, ...extra }).eq('id', payment.id);

  if (payment.application_id) {
    const { data: application } = await db.from('applications').select('status').eq('id', payment.application_id).maybeSingle();
    const updates: Record<string, unknown> = { payment_status: 'paid', paid_at: now };
    // Only move to 'reviewing' where that transition is valid — a late
    // payment must not revive a cancelled application.
    if (application && isValidApplicationStatusTransition(application.status as ApplicationStatus, 'reviewing')) {
      updates.status = 'reviewing';
    }
    await db.from('applications').update(updates).eq('id', payment.application_id);
  }

  if (payment.invite_id) {
    await db
      .from('tenant_invites')
      .update({ status: 'paid', paid_at: now, updated_at: now })
      .eq('id', payment.invite_id)
      .neq('status', 'revoked');
  }
}

/** Records a failed payment; the application is flagged, an invite stays payable. */
export async function markPaymentFailed(db: DbClient, payment: PaymentRow, extra: Record<string, unknown> = {}): Promise<void> {
  await db.from('payments').update({ status: 'failed', updated_at: new Date().toISOString(), ...extra }).eq('id', payment.id);
  if (payment.application_id) {
    await db.from('applications').update({ payment_status: 'failed' }).eq('id', payment.application_id);
  }
}
