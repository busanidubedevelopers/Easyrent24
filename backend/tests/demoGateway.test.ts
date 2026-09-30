import { describe, it, expect } from 'vitest';
import { chargeDemoCard, isSafeReturnPath, luhnValid, paymentProvider, DEMO_BANKS } from '../lib/demoGateway';

const NOW = new Date('2026-09-30T12:00:00Z');
const card = { bank: 'fnb', cardholder: 'Thabo Mokoena', card_number: '4242 4242 4242 4242', expiry: '12/28', cvv: '123' };

describe('paymentProvider', () => {
  it('defaults to PayFast and only uses the demo gateway when asked', () => {
    expect(paymentProvider({})).toBe('payfast');
    expect(paymentProvider({ PAYMENT_PROVIDER: 'payfast' })).toBe('payfast');
    expect(paymentProvider({ PAYMENT_PROVIDER: 'demo', PAYFAST_MODE: 'sandbox' })).toBe('demo');
  });

  it('refuses the demo gateway alongside live PayFast', () => {
    expect(() => paymentProvider({ PAYMENT_PROVIDER: 'demo', PAYFAST_MODE: 'live' })).toThrow(/live/);
  });
});

describe('chargeDemoCard', () => {
  it('approves a valid FNB card', () => {
    expect(luhnValid('4242424242424242')).toBe(true);
    expect(chargeDemoCard(card, NOW)).toEqual({ outcome: 'approved', last4: '4242', bank: 'fnb' });
    // Any valid card number works, as long as the bank is FNB.
    expect(chargeDemoCard({ ...card, card_number: '5555 5555 5555 4444' }, NOW).outcome).toBe('approved');
  });

  it('declines every other bank', () => {
    for (const { key } of DEMO_BANKS.filter((b) => b.key !== 'fnb')) {
      const result = chargeDemoCard({ ...card, bank: key }, NOW);
      expect(result.outcome).toBe('declined');
    }
    expect(chargeDemoCard({ ...card, bank: 'absa' }, NOW)).toEqual({
      outcome: 'declined',
      last4: '4242',
      bank: 'absa',
      reason: 'Absa card declined: this prototype only accepts FNB cards',
    });
  });

  it('rejects malformed card details before charging', () => {
    const result = chargeDemoCard({ bank: 'barclays', card_number: '4242 4242 4242 4241', expiry: '13/28', cvv: '12', cardholder: '' }, NOW);
    expect(result.outcome).toBe('invalid');
    if (result.outcome !== 'invalid') return;
    expect(Object.keys(result.errors).sort()).toEqual(['bank', 'card_number', 'cardholder', 'cvv', 'expiry']);
  });

  it('treats a card as valid until the end of its expiry month', () => {
    expect(chargeDemoCard({ ...card, expiry: '09/26' }, NOW).outcome).toBe('approved');
    const expired = chargeDemoCard({ ...card, expiry: '08/26' }, NOW);
    expect(expired.outcome === 'invalid' && expired.errors.expiry).toBe('This card has expired.');
  });
});

describe('isSafeReturnPath', () => {
  it('only allows paths on this site', () => {
    expect(isSafeReturnPath('/apply/payment-success?application_id=1')).toBe(true);
    expect(isSafeReturnPath('https://evil.example')).toBe(false);
    expect(isSafeReturnPath('//evil.example')).toBe(false);
    expect(isSafeReturnPath('/\\evil.example')).toBe(false);
    expect(isSafeReturnPath(null)).toBe(false);
  });
});
