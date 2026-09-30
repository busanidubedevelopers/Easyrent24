import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import { phpUrlEncode, generateSignature, verifySignature, amountsMatch, buildPaymentRequest } from '../lib/payfast';

describe('phpUrlEncode (must match PHP urlencode() exactly, not encodeURIComponent)', () => {
  it('encodes space as +', () => {
    expect(phpUrlEncode('hello world')).toBe('hello+world');
  });
  it('percent-encodes apostrophe (PHP does; encodeURIComponent alone does not)', () => {
    expect(phpUrlEncode("O'Brien")).toBe('O%27Brien');
  });
  it('percent-encodes ampersand', () => {
    expect(phpUrlEncode('a&b')).toBe('a%26b');
  });
  it('percent-encodes parentheses', () => {
    expect(phpUrlEncode('(test)')).toBe('%28test%29');
  });
  it('percent-encodes asterisk', () => {
    expect(phpUrlEncode('a*b')).toBe('a%2Ab');
  });
  it('leaves plain alphanumerics unchanged', () => {
    expect(phpUrlEncode('abc123')).toBe('abc123');
  });
  it('leaves hyphen/underscore/period unchanged', () => {
    expect(phpUrlEncode('a-b_c.d')).toBe('a-b_c.d');
  });
});

describe('generateSignature', () => {
  const fields = { merchant_id: '10000100', merchant_key: 'abc123', amount: '250.00', item_name: 'Application Fee' };

  it('is deterministic for identical input', () => {
    expect(generateSignature(fields)).toBe(generateSignature(fields));
  });

  it('produces a 32-character hex MD5 digest', () => {
    expect(generateSignature(fields)).toMatch(/^[a-f0-9]{32}$/);
  });

  it('changes when any field value changes (tamper detection)', () => {
    expect(generateSignature(fields)).not.toBe(generateSignature({ ...fields, amount: '999.00' }));
  });

  it('changes when a passphrase is added', () => {
    expect(generateSignature(fields)).not.toBe(generateSignature(fields, 'mySecretPassphrase'));
  });

  it('matches a manually-computed MD5 for a simple 2-field case (independent cross-check)', () => {
    const manual = crypto.createHash('md5').update('merchant_id=10000100&amount=250.00').digest('hex');
    expect(generateSignature({ merchant_id: '10000100', amount: '250.00' })).toBe(manual);
  });

  it('matches a manually-computed MD5 WITH a passphrase appended', () => {
    const manual = crypto
      .createHash('md5')
      .update('merchant_id=10000100&amount=250.00&passphrase=secret123')
      .digest('hex');
    expect(generateSignature({ merchant_id: '10000100', amount: '250.00' }, 'secret123')).toBe(manual);
  });

  it('excludes blank string fields from the signature', () => {
    const withBlank = generateSignature({ merchant_id: '10000100', item_description: '', amount: '250.00' });
    const withoutBlank = generateSignature({ merchant_id: '10000100', amount: '250.00' });
    expect(withBlank).toBe(withoutBlank);
  });

  it('excludes undefined fields from the signature', () => {
    const withUndefined = generateSignature({ merchant_id: '10000100', item_description: undefined, amount: '250.00' });
    const withoutBlank = generateSignature({ merchant_id: '10000100', amount: '250.00' });
    expect(withUndefined).toBe(withoutBlank);
  });

  it('is sensitive to field order (order must be preserved exactly as received for ITN)', () => {
    const a = generateSignature([['merchant_id', '10000100'], ['amount', '250.00']]);
    const b = generateSignature([['amount', '250.00'], ['merchant_id', '10000100']]);
    expect(a).not.toBe(b);
  });
});

describe('verifySignature', () => {
  const fields = { merchant_id: '10000100', amount: '250.00' };
  const validSig = generateSignature(fields);

  it('accepts a genuine signature', () => {
    expect(verifySignature(fields, validSig)).toBe(true);
  });
  it('rejects a signature computed from tampered data', () => {
    expect(verifySignature({ merchant_id: '10000100', amount: '999.00' }, validSig)).toBe(false);
  });
  it('rejects when no signature is provided', () => {
    expect(verifySignature(fields, undefined)).toBe(false);
  });
  it('is case-insensitive on hex casing', () => {
    expect(verifySignature(fields, validSig.toUpperCase())).toBe(true);
  });
});

describe('amountsMatch (cent-precision, not float equality)', () => {
  it('matches 250 against "250.00"', () => {
    expect(amountsMatch(250, '250.00')).toBe(true);
  });
  it('matches 19.99 against "19.99" (classic float trap)', () => {
    expect(amountsMatch(19.99, '19.99')).toBe(true);
  });
  it('rejects 250 against "250.01"', () => {
    expect(amountsMatch(250, '250.01')).toBe(false);
  });
  it('ignores sub-cent differences that round to the same cent', () => {
    expect(amountsMatch(0.3, 0.30001)).toBe(true);
  });
  it('rejects a genuinely different amount', () => {
    expect(amountsMatch(250.0, 250.5)).toBe(false);
  });
});

describe('buildPaymentRequest', () => {
  const request = buildPaymentRequest({
    merchantId: '10000100',
    merchantKey: 'abc123',
    returnUrl: 'https://easyrent24.co.za/apply/success',
    cancelUrl: 'https://easyrent24.co.za/apply/cancelled',
    notifyUrl: 'https://easyrent24.co.za/api/payments/payfast/notify',
    mPaymentId: 'APP-0001',
    amount: 250,
    itemName: 'EasyRent24 Application Fee',
  });

  it('includes a 32-character signature field', () => {
    expect(request.signature).toMatch(/^[a-f0-9]{32}$/);
  });

  it('omits undefined optional fields rather than including them empty', () => {
    expect('name_first' in request).toBe(false);
  });

  it('produces a signature that self-validates against its own fields', () => {
    const { signature, ...rest } = request;
    expect(verifySignature(rest, signature as string)).toBe(true);
  });
});

describe('isPayfastSource', () => {
  it('accepts the known PayFast subnets without a DNS lookup', async () => {
    const { isPayfastSource } = await import('../lib/payfast');
    expect(await isPayfastSource('41.74.179.193')).toBe(true);
  });

  it("accepts current addresses of PayFast's ITN hosts and rejects everything else", async () => {
    vi.resetModules();
    vi.doMock('dns', () => ({
      promises: { resolve4: vi.fn(async (host: string) => (host === 'w2w.payfast.co.za' ? ['102.216.36.136'] : ['34.107.176.71'])) },
    }));
    const { isPayfastSource } = await import('../lib/payfast');
    expect(await isPayfastSource('102.216.36.136, 10.0.0.1')).toBe(true);
    expect(await isPayfastSource('203.0.113.9')).toBe(false);
    expect(await isPayfastSource(null)).toBe(false);
    vi.doUnmock('dns');
  });
});
