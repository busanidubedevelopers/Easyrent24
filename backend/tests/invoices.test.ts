import { describe, it, expect } from 'vitest';
import {
  isValidInvoiceStatusTransition,
  validateLineItems,
  calculateInvoiceTotal,
  buildRentInvoiceLineItems,
  isPastDue,
} from '../lib/invoices';

describe('isValidInvoiceStatusTransition', () => {
  it('allows draft -> sent', () => {
    expect(isValidInvoiceStatusTransition('draft', 'sent')).toBe(true);
  });
  it('allows draft -> cancelled', () => {
    expect(isValidInvoiceStatusTransition('draft', 'cancelled')).toBe(true);
  });
  it('blocks draft -> paid (must be sent first)', () => {
    expect(isValidInvoiceStatusTransition('draft', 'paid')).toBe(false);
  });
  it('allows sent -> paid', () => {
    expect(isValidInvoiceStatusTransition('sent', 'paid')).toBe(true);
  });
  it('allows sent -> overdue', () => {
    expect(isValidInvoiceStatusTransition('sent', 'overdue')).toBe(true);
  });
  it('allows overdue -> paid', () => {
    expect(isValidInvoiceStatusTransition('overdue', 'paid')).toBe(true);
  });
  it('blocks any transition out of paid (terminal)', () => {
    expect(isValidInvoiceStatusTransition('paid', 'draft')).toBe(false);
    expect(isValidInvoiceStatusTransition('paid', 'cancelled')).toBe(false);
  });
  it('blocks any transition out of cancelled (terminal)', () => {
    expect(isValidInvoiceStatusTransition('cancelled', 'draft')).toBe(false);
  });
  it('allows a same-state no-op', () => {
    expect(isValidInvoiceStatusTransition('sent', 'sent')).toBe(true);
  });
});

describe('validateLineItems', () => {
  it('rejects an empty array', () => {
    expect(validateLineItems([]).valid).toBe(false);
  });
  it('accepts a single valid item', () => {
    expect(validateLineItems([{ description: 'Rent', amount: 5000 }]).valid).toBe(true);
  });
  it('rejects a missing description', () => {
    expect(validateLineItems([{ description: '', amount: 5000 }]).valid).toBe(false);
  });
  it('rejects a negative amount', () => {
    expect(validateLineItems([{ description: 'Rent', amount: -1 }]).valid).toBe(false);
  });
  it('accepts a zero amount (e.g. a waived fee line item)', () => {
    expect(validateLineItems([{ description: 'Late Fee Waiver', amount: 0 }]).valid).toBe(true);
  });
  it('reports one error per invalid item, not just the first', () => {
    const result = validateLineItems([
      { description: '', amount: -5 },
      { description: 'Valid', amount: 100 },
    ]);
    expect(result.errors).toHaveLength(2);
  });
});

describe('calculateInvoiceTotal', () => {
  it('sums multiple line items', () => {
    expect(
      calculateInvoiceTotal([
        { description: 'Rent', amount: 12000 },
        { description: 'Water', amount: 250.5 },
        { description: 'Electricity', amount: 480.25 },
      ])
    ).toBe(12730.75);
  });
  it('rounds to 2 decimal places, avoiding float artifacts', () => {
    expect(calculateInvoiceTotal([{ description: 'A', amount: 0.1 }, { description: 'B', amount: 0.2 }])).toBe(0.3);
  });
  it('returns 0 for an empty list', () => {
    expect(calculateInvoiceTotal([])).toBe(0);
  });
});

describe('buildRentInvoiceLineItems', () => {
  it('produces a single locked Monthly Rent item matching the given amount', () => {
    const items = buildRentInvoiceLineItems(9500);
    expect(items).toEqual([{ description: 'Monthly Rent', amount: 9500, locked: true }]);
  });
});

describe('isPastDue', () => {
  const now = new Date('2026-08-15T00:00:00Z');

  it('is true when a sent invoice is past its due date', () => {
    expect(isPastDue('2026-08-01', 'sent', now)).toBe(true);
  });
  it('is false when a sent invoice is not yet due', () => {
    expect(isPastDue('2026-09-01', 'sent', now)).toBe(false);
  });
  it('is false for a draft invoice regardless of date (never sent yet)', () => {
    expect(isPastDue('2026-08-01', 'draft', now)).toBe(false);
  });
  it('is false for an already-paid invoice', () => {
    expect(isPastDue('2026-08-01', 'paid', now)).toBe(false);
  });
  it('is false when there is no due date at all', () => {
    expect(isPastDue(null, 'sent', now)).toBe(false);
  });
});
