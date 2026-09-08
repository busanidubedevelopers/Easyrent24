import { describe, it, expect } from 'vitest';
import { isValidApplicationStatusTransition, validateApplicationInput } from '../lib/applications';

describe('isValidApplicationStatusTransition', () => {
  it('allows pending -> reviewing', () => {
    expect(isValidApplicationStatusTransition('pending', 'reviewing')).toBe(true);
  });
  it('allows pending -> approved (skip reviewing)', () => {
    expect(isValidApplicationStatusTransition('pending', 'approved')).toBe(true);
  });
  it('allows pending -> cancelled', () => {
    expect(isValidApplicationStatusTransition('pending', 'cancelled')).toBe(true);
  });
  it('allows reviewing -> approved', () => {
    expect(isValidApplicationStatusTransition('reviewing', 'approved')).toBe(true);
  });
  it('blocks any transition out of approved/declined/cancelled (all terminal)', () => {
    expect(isValidApplicationStatusTransition('approved', 'pending')).toBe(false);
    expect(isValidApplicationStatusTransition('declined', 'pending')).toBe(false);
    expect(isValidApplicationStatusTransition('cancelled', 'pending')).toBe(false);
  });
  it('allows a same-state no-op update', () => {
    expect(isValidApplicationStatusTransition('pending', 'pending')).toBe(true);
  });
});

describe('validateApplicationInput', () => {
  const validBase = {
    first_name: 'Amy',
    last_name: 'A',
    consent_credit: true,
    consent_id_check: true,
    consent_bank_statements: true,
  };

  it('accepts valid input with all consents given', () => {
    expect(validateApplicationInput(validBase).valid).toBe(true);
  });
  it('rejects missing first_name', () => {
    const { first_name, ...rest } = validBase;
    expect(validateApplicationInput(rest).valid).toBe(false);
  });
  it('rejects missing consent_credit', () => {
    expect(validateApplicationInput({ ...validBase, consent_credit: false }).valid).toBe(false);
  });
  it('rejects missing consent_id_check', () => {
    expect(validateApplicationInput({ ...validBase, consent_id_check: false }).valid).toBe(false);
  });
  it('rejects missing consent_bank_statements', () => {
    expect(validateApplicationInput({ ...validBase, consent_bank_statements: false }).valid).toBe(false);
  });
  it('rejects negative monthly_income', () => {
    expect(validateApplicationInput({ ...validBase, monthly_income: -500 }).valid).toBe(false);
  });
});
