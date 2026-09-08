export type InvoiceStatus = 'draft' | 'sent' | 'paid' | 'overdue' | 'cancelled';

export const INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'paid', 'overdue', 'cancelled'];

/**
 * Allowed status transitions. 'overdue' is reachable from 'sent' — normally
 * set automatically by a scheduled job (Task 22) once due_date passes, not
 * something a person manually flips, but the transition itself is still
 * valid either way. 'paid' and 'cancelled' are both terminal: a paid
 * invoice should never be un-paid via this API (that's a refund/credit
 * note process, a different feature entirely), and a cancelled invoice
 * stays cancelled.
 */
const ALLOWED_TRANSITIONS: Record<InvoiceStatus, InvoiceStatus[]> = {
  draft: ['sent', 'cancelled'],
  sent: ['paid', 'overdue', 'cancelled'],
  overdue: ['paid', 'cancelled'],
  paid: [],
  cancelled: [],
};

export function isValidInvoiceStatusTransition(from: InvoiceStatus, to: InvoiceStatus): boolean {
  if (from === to) return true;
  return ALLOWED_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface LineItem {
  description: string;
  amount: number;
  locked?: boolean;
}

export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * Validates a set of invoice line items. Matches the shape already used by
 * the (currently mock-data) documents page: { description, amount, locked }.
 * `locked` is a frontend-only display hint (e.g. "Monthly Rent" can't be
 * removed) and isn't validated here — the backend doesn't need to enforce
 * which items a UI lets someone edit, only that the data itself is sane.
 */
export function validateLineItems(items: LineItem[]): ValidationResult {
  const errors: string[] = [];

  if (!Array.isArray(items) || items.length === 0) {
    return { valid: false, errors: ['At least one line item is required.'] };
  }

  items.forEach((item, i) => {
    if (!item.description || item.description.trim().length === 0) {
      errors.push(`Line item ${i + 1}: description is required.`);
    } else if (item.description.length > 500) {
      errors.push(`Line item ${i + 1}: description must be 500 characters or fewer.`);
    }
    if (typeof item.amount !== 'number' || Number.isNaN(item.amount) || item.amount < 0) {
      errors.push(`Line item ${i + 1}: amount must be a non-negative number.`);
    }
  });

  return { valid: errors.length === 0, errors };
}

/**
 * Sums line item amounts, rounded to 2 decimal places to avoid floating
 * point artifacts (e.g. 0.1 + 0.2 style errors) in the stored total.
 */
export function calculateInvoiceTotal(items: LineItem[]): number {
  const total = items.reduce((sum, item) => sum + (item.amount || 0), 0);
  return Math.round(total * 100) / 100;
}

/**
 * Generates the standard starting line items for a rent invoice: a single
 * locked "Monthly Rent" item pre-filled with the property's price. This is
 * exactly what the documents page's UI already expects (see
 * frontend/app/documents/page.tsx) — landlords can then add unlocked extra
 * items (water, electricity, etc.) on top of this before sending.
 */
export function buildRentInvoiceLineItems(rentAmount: number): LineItem[] {
  return [{ description: 'Monthly Rent', amount: rentAmount, locked: true }];
}

/**
 * A sent (or overdue) invoice whose due_date has passed and hasn't been
 * paid is, in substance, overdue — regardless of what its `status` column
 * currently says. This is the pure predicate Task 22's scheduled job will
 * use to decide which invoices to flip to 'overdue'; kept separate from
 * any actual DB update so it's independently testable.
 */
export function isPastDue(dueDate: string | null, status: InvoiceStatus, now: Date = new Date()): boolean {
  if (!dueDate) return false;
  if (status !== 'sent') return false; // only 'sent' invoices can become overdue
  return new Date(dueDate).getTime() < now.getTime();
}
