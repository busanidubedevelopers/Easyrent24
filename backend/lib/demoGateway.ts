// EasyRent Pay: a built-in card gateway for demos, used instead of PayFast
// when PAYMENT_PROVIDER=demo. No money moves. The prototype accepts FNB
// only: a valid card from FNB is approved, and a card from any other bank
// is declined, so a demo can show both outcomes on purpose. An approved
// payment goes through the same completion logic as a real PayFast ITN
// (paymentCompletion.ts).
//
// Card numbers are never stored; only the last four digits are.

export type PaymentProvider = 'demo' | 'payfast';

/** Banks the shopper can pick. Only FNB approves in the prototype. */
export const DEMO_BANKS = [
  { key: 'fnb', label: 'FNB' },
  { key: 'absa', label: 'Absa' },
  { key: 'standard_bank', label: 'Standard Bank' },
  { key: 'nedbank', label: 'Nedbank' },
  { key: 'capitec', label: 'Capitec' },
  { key: 'discovery', label: 'Discovery Bank' },
  { key: 'tymebank', label: 'TymeBank' },
  { key: 'african_bank', label: 'African Bank' },
  { key: 'investec', label: 'Investec' },
  { key: 'other', label: 'Other bank' },
] as const;

export type DemoBank = (typeof DEMO_BANKS)[number]['key'];

/** The one bank the prototype accepts. */
export const DEMO_APPROVED_BANK: DemoBank = 'fnb';

/** How many card attempts one payment reference allows. */
export const DEMO_MAX_ATTEMPTS = 5;

export function bankLabel(key: string): string {
  return DEMO_BANKS.find((b) => b.key === key)?.label ?? key;
}

/**
 * Which gateway handles new payments. PayFast is the default; the demo
 * gateway is never used alongside live PayFast credentials, because it
 * marks fees as paid without any money changing hands.
 */
export function paymentProvider(env: Record<string, string | undefined> = process.env): PaymentProvider {
  if ((env.PAYMENT_PROVIDER ?? '').trim().toLowerCase() !== 'demo') return 'payfast';
  if (env.PAYFAST_MODE === 'live') {
    throw new Error('PAYMENT_PROVIDER=demo cannot be used with PAYFAST_MODE=live.');
  }
  return 'demo';
}

export interface DemoCardInput {
  bank?: unknown;
  card_number?: unknown;
  expiry?: unknown;
  cvv?: unknown;
  cardholder?: unknown;
}

type CardField = 'bank' | 'card_number' | 'expiry' | 'cvv' | 'cardholder';

export type DemoChargeResult =
  | { outcome: 'approved'; last4: string; bank: DemoBank }
  | { outcome: 'declined'; last4: string; bank: DemoBank; reason: string }
  | { outcome: 'invalid'; errors: Partial<Record<CardField, string>> };

export function luhnValid(digits: string): boolean {
  let sum = 0;
  for (let i = 0; i < digits.length; i++) {
    let d = Number(digits[digits.length - 1 - i]);
    if (i % 2 === 1) {
      d *= 2;
      if (d > 9) d -= 9;
    }
    sum += d;
  }
  return sum % 10 === 0;
}

const text = (v: unknown) => (typeof v === 'string' ? v.trim() : '');
const BANK_KEYS = new Set<string>(DEMO_BANKS.map((b) => b.key));

/** Validates the card form, then approves FNB cards and declines every other bank. */
export function chargeDemoCard(input: DemoCardInput, now: Date = new Date()): DemoChargeResult {
  const errors: Partial<Record<CardField, string>> = {};

  const bank = text(input.bank);
  if (!BANK_KEYS.has(bank)) errors.bank = 'Choose the bank that issued your card.';

  const number = text(input.card_number).replace(/[\s-]/g, '');
  if (!/^\d{12,19}$/.test(number) || !luhnValid(number)) errors.card_number = 'Enter a valid card number.';

  const expiry = text(input.expiry).match(/^(\d{2})\s*\/\s*(\d{2}|\d{4})$/);
  if (!expiry || Number(expiry[1]) < 1 || Number(expiry[1]) > 12) {
    errors.expiry = 'Enter the expiry date as MM/YY.';
  } else {
    const year = expiry[2].length === 2 ? 2000 + Number(expiry[2]) : Number(expiry[2]);
    // A card is valid until the end of its expiry month.
    if (new Date(Date.UTC(year, Number(expiry[1]), 1)) <= now) errors.expiry = 'This card has expired.';
  }

  if (!/^\d{3,4}$/.test(text(input.cvv))) errors.cvv = 'Enter the 3 or 4 digit security code.';
  if (text(input.cardholder).length < 2) errors.cardholder = 'Enter the name on the card.';

  if (Object.keys(errors).length) return { outcome: 'invalid', errors };

  const last4 = number.slice(-4);
  const key = bank as DemoBank;
  if (key === DEMO_APPROVED_BANK) return { outcome: 'approved', last4, bank: key };
  return {
    outcome: 'declined',
    last4,
    bank: key,
    reason: `${bankLabel(key)} card declined: this prototype only accepts FNB cards`,
  };
}

/** Only our own pages may be a return target, so a stored URL can't bounce the shopper elsewhere. */
export function isSafeReturnPath(url: unknown): url is string {
  return typeof url === 'string' && url.startsWith('/') && !url.startsWith('//') && !url.includes('\\');
}
