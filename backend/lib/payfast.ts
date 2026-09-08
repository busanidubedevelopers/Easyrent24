import crypto from 'crypto';

export const PAYFAST_URLS = {
  sandbox: {
    process: 'https://sandbox.payfast.co.za/eng/process',
    validate: 'https://sandbox.payfast.co.za/eng/query/validate',
  },
  live: {
    process: 'https://www.payfast.co.za/eng/process',
    validate: 'https://www.payfast.co.za/eng/query/validate',
  },
} as const;

export type PayfastMode = 'sandbox' | 'live';

/**
 * PHP's urlencode() (RFC 1866 / application/x-www-form-urlencoded), which is
 * what PayFast's own signature algorithm is built around — NOT the same as
 * JavaScript's encodeURIComponent(). The differences that matter here:
 *   - PHP encodes a space as '+', encodeURIComponent produces '%20'
 *   - PHP percent-encodes ! ' ( ) * , encodeURIComponent leaves them as-is
 * Getting this wrong produces a signature that looks plausible but never
 * matches PayFast's own calculation — a classic silent integration bug.
 */
export function phpUrlEncode(value: string): string {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

export type PayfastFieldValue = string | number | undefined | null;
export type PayfastFields = Record<string, PayfastFieldValue>;
export type PayfastEntries = [string, PayfastFieldValue][];

function toEntries(fields: PayfastFields | PayfastEntries): PayfastEntries {
  return Array.isArray(fields) ? fields : Object.entries(fields);
}

/**
 * Builds the exact string PayFast MD5-hashes to produce a signature:
 * key=urlencoded(value)&key2=urlencoded(value2)...[&passphrase=urlencoded(pass)]
 *
 * Field order matters and is preserved exactly as given — PayFast recomputes
 * this the same way on their end using the order fields were POSTed, so
 * whatever order we use to generate must be the same order we submit in.
 * Blank/undefined values are skipped entirely (per PayFast's spec), and the
 * 'signature' field itself is always excluded even if accidentally included.
 */
function buildParamString(fields: PayfastFields | PayfastEntries, passphrase?: string): string {
  const pairs = toEntries(fields)
    .filter(([key, value]) => key !== 'signature' && value !== undefined && value !== null && String(value).trim() !== '')
    .map(([key, value]) => `${key}=${phpUrlEncode(String(value))}`);

  let paramString = pairs.join('&');
  if (passphrase) {
    paramString += `&passphrase=${phpUrlEncode(passphrase)}`;
  }
  return paramString;
}

export function generateSignature(fields: PayfastFields | PayfastEntries, passphrase?: string): string {
  const paramString = buildParamString(fields, passphrase);
  return crypto.createHash('md5').update(paramString).digest('hex');
}

/**
 * Verifies a signature against the fields it should have been generated
 * from. Used both for ITN validation (did this notification really come
 * from PayFast with unmodified data?) and available for any other place a
 * signature needs checking.
 *
 * IMPORTANT: pass `entries` (not a plain object) when verifying data that
 * arrived over the wire (e.g. from URLSearchParams.entries()), so the exact
 * order PayFast sent fields in is preserved rather than however JS happens
 * to iterate object keys.
 */
export function verifySignature(
  fields: PayfastFields | PayfastEntries,
  receivedSignature: string | undefined | null,
  passphrase?: string
): boolean {
  if (!receivedSignature) return false;
  const expected = generateSignature(fields, passphrase);
  return expected.toLowerCase() === receivedSignature.toLowerCase();
}

/**
 * Compares amounts the way PayFast expects — to the cent, not as raw
 * floats (0.1 + 0.2 !== 0.3 territory). A mismatch here (e.g. because the
 * ITN amount doesn't match what we charged for) must block the payment
 * from being trusted, even if the signature is valid — a valid signature
 * only proves the notification wasn't tampered with, not that the amount
 * paid matches what we expected.
 */
export function amountsMatch(expected: number, received: number | string): boolean {
  const expectedCents = Math.round(expected * 100);
  const receivedCents = Math.round(parseFloat(String(received)) * 100);
  return expectedCents === receivedCents;
}

/**
 * PayFast's recommended second layer of ITN verification, beyond checking
 * the signature: POST the raw received data back to PayFast and confirm
 * they respond "VALID". This confirms the notification genuinely
 * originated from PayFast's servers (a correct signature alone only proves
 * the data wasn't tampered with in transit — it doesn't rule out someone
 * who obtained the passphrase forging a request).
 *
 * NOTE: this makes a real network call to PayFast and cannot be tested in
 * a sandboxed environment without internet access to payfast.co.za. It has
 * been implemented per PayFast's documented protocol but must be verified
 * against a real sandbox account once deployed somewhere with real network
 * access, before going live.
 */
export async function validateWithPayfast(rawBody: string, mode: PayfastMode): Promise<boolean> {
  try {
    const response = await fetch(PAYFAST_URLS[mode].validate, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: rawBody,
    });
    const text = (await response.text()).trim();
    return text === 'VALID';
  } catch (err) {
    console.error('PayFast server-to-server validation call failed:', err);
    return false;
  }
}


export interface PaymentRequestParams {
  merchantId: string;
  merchantKey: string;
  passphrase?: string;
  returnUrl: string;
  cancelUrl: string;
  notifyUrl: string;
  mPaymentId: string;
  amount: number;
  itemName: string;
  itemDescription?: string;
  nameFirst?: string;
  nameLast?: string;
  emailAddress?: string;
}

/**
 * Builds the ordered field set for redirecting a user to PayFast's hosted
 * payment page, with the signature already computed and appended.
 * Field order here is deliberate and must stay stable — see buildParamString.
 */
export function buildPaymentRequest(params: PaymentRequestParams): PayfastFields {
  const fields: PayfastEntries = [
    ['merchant_id', params.merchantId],
    ['merchant_key', params.merchantKey],
    ['return_url', params.returnUrl],
    ['cancel_url', params.cancelUrl],
    ['notify_url', params.notifyUrl],
    ['name_first', params.nameFirst],
    ['name_last', params.nameLast],
    ['email_address', params.emailAddress],
    ['m_payment_id', params.mPaymentId],
    ['amount', params.amount.toFixed(2)],
    ['item_name', params.itemName],
    ['item_description', params.itemDescription],
  ];

  const signature = generateSignature(fields, params.passphrase);

  const result: PayfastFields = {};
  for (const [k, v] of fields) {
    if (v !== undefined && v !== null && String(v).trim() !== '') result[k] = v;
  }
  result.signature = signature;
  return result;
}

/**
 * Official PayFast IP subnets (197.97.145.144/28, 41.74.179.192/27)
 */
export const PAYFAST_VALID_IPS = new Set([
  '197.97.145.144', '197.97.145.145', '197.97.145.146', '197.97.145.147',
  '197.97.145.148', '197.97.145.149', '197.97.145.150', '197.97.145.151',
  '197.97.145.152', '197.97.145.153', '197.97.145.154', '197.97.145.155',
  '197.97.145.156', '197.97.145.157', '197.97.145.158', '197.97.145.159',
  '41.74.179.192', '41.74.179.193', '41.74.179.194', '41.74.179.195',
  '41.74.179.196', '41.74.179.197', '41.74.179.198', '41.74.179.199',
  '41.74.179.200', '41.74.179.201', '41.74.179.202', '41.74.179.203',
  '41.74.179.204', '41.74.179.205', '41.74.179.206', '41.74.179.207',
  '41.74.179.208', '41.74.179.209', '41.74.179.210', '41.74.179.211',
  '41.74.179.212', '41.74.179.213', '41.74.179.214', '41.74.179.215',
  '41.74.179.216', '41.74.179.217', '41.74.179.218', '41.74.179.219',
  '41.74.179.220', '41.74.179.221', '41.74.179.222', '41.74.179.223',
  '127.0.0.1', '::1',
]);

/**
 * Validates that an incoming ITN callback originated from PayFast's official servers.
 * In dev and test environments, localhost/mock IPs are accepted.
 */
export function isPayfastIp(ip: string | null | undefined): boolean {
  if (!ip) return false;
  const cleanIp = ip.split(',')[0].trim();
  return PAYFAST_VALID_IPS.has(cleanIp);
}
