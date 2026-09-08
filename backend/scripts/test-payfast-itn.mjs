#!/usr/bin/env node

/**
 * Manual PayFast ITN Testing Script
 *
 * This script helps test the ITN callback handling without needing to complete
 * a full payment in PayFast. It generates valid ITN signatures and sends them
 * to your local /api/payments/payfast/notify endpoint.
 *
 * Usage:
 *   node test-payfast-itn.mjs --help
 *   node test-payfast-itn.mjs --app-id <app-id> --amount <amount>
 *   node test-payfast-itn.mjs --m-payment-id <id> --amount <amount> --status COMPLETE
 *   node test-payfast-itn.mjs --m-payment-id <id> --amount <amount> --signature invalid
 *
 * Environment vars:
 *   PAYFAST_PASSPHRASE - Required for signature generation
 *   BASE_URL - App URL (default: http://localhost:3000)
 */

import crypto from 'crypto';
import { parseArgs } from 'util';

const { values: args, positionals } = parseArgs({
  options: {
    'app-id': { type: 'string' },
    'm-payment-id': { type: 'string' },
    amount: { type: 'string', default: '250.00' },
    status: { type: 'string', default: 'COMPLETE' },
    signature: { type: 'string' },
    'base-url': { type: 'string', default: 'http://localhost:3000' },
    'invalid-amount': { type: 'boolean', default: false },
    'invalid-sig': { type: 'boolean', default: false },
    help: { type: 'boolean', default: false },
  },
  allowPositionals: true,
});

function phpUrlEncode(value) {
  return encodeURIComponent(value)
    .replace(/%20/g, '+')
    .replace(/[!'()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}

function generateSignature(fields, passphrase) {
  const pairs = fields
    .filter(([key, value]) => key !== 'signature' && value && String(value).trim() !== '')
    .map(([key, value]) => `${key}=${phpUrlEncode(String(value))}`);

  let paramString = pairs.join('&');
  if (passphrase) {
    paramString += `&passphrase=${phpUrlEncode(passphrase)}`;
  }
  return crypto.createHash('md5').update(paramString).digest('hex');
}

function showHelp() {
  console.log(`
PayFast ITN Testing Script

Usage:
  node test-payfast-itn.mjs [options]

Options:
  --app-id <id>          Application ID (generates m_payment_id automatically)
  --m-payment-id <id>    Specific m_payment_id to test
  --amount <amount>      Payment amount in ZAR (default: 250.00)
  --status <status>      Payment status (default: COMPLETE)
  --base-url <url>       App base URL (default: http://localhost:3000)
  --invalid-sig          Send with invalid signature (test error handling)
  --invalid-amount       Send with mismatched amount (test error handling)
  --signature <sig>      Use specific signature instead of generating
  --help                 Show this help

Examples:
  # Happy path: successful payment
  node test-payfast-itn.mjs --app-id abc123 --amount 250.00

  # Duplicate ITN (idempotency test)
  node test-payfast-itn.mjs --m-payment-id APP-abc123-1234567890 --amount 250.00

  # Test invalid signature error
  node test-payfast-itn.mjs --app-id abc123 --invalid-sig

  # Test amount mismatch error
  node test-payfast-itn.mjs --app-id abc123 --invalid-amount

Environment Variables:
  PAYFAST_PASSPHRASE     Required for signature generation
  BASE_URL               Override base-url option

`);
}

if (args.help) {
  showHelp();
  process.exit(0);
}

const passphrase = process.env.PAYFAST_PASSPHRASE;
if (!passphrase) {
  console.error('Error: PAYFAST_PASSPHRASE environment variable not set');
  process.exit(1);
}

let mPaymentId = args['m-payment-id'];
if (!mPaymentId) {
  if (args['app-id']) {
    mPaymentId = `APP-${args['app-id']}-${Date.now()}`;
  } else {
    console.error('Error: Must provide either --app-id or --m-payment-id');
    console.log('Run with --help for usage information');
    process.exit(1);
  }
}

const amount = args['invalid-amount'] ? '999.99' : args.amount;
const baseUrl = process.env.BASE_URL || args['base-url'];

const itnFields = [
  ['m_payment_id', mPaymentId],
  ['pf_payment_id', '12345678'],
  ['payment_status', args.status],
  ['item_name', 'EasyRent24 Application Fee'],
  ['item_description', 'Test application fee'],
  ['amount_gross', amount],
  ['amount_fee', '10.00'],
  ['amount_net', String(Number(amount) - 10)],
  ['custom_str1', ''],
  ['custom_str2', ''],
  ['custom_str3', ''],
  ['custom_str4', ''],
  ['custom_str5', ''],
  ['custom_int1', '0'],
  ['custom_int2', '0'],
  ['custom_int3', '0'],
  ['custom_int4', '0'],
  ['custom_int5', '0'],
  ['name_first', 'Test'],
  ['name_last', 'Applicant'],
  ['email_address', 'test@example.com'],
  ['billing_name', 'Test Applicant'],
  ['billing_address', '123 Test St'],
  ['billing_city', 'Test City'],
  ['billing_state', 'TC'],
  ['billing_zip', '1234'],
  ['billing_country', 'ZA'],
  ['merchant_id', process.env.PAYFAST_MERCHANT_ID || '10000100'],
];

let signature = args.signature;
if (!signature) {
  signature = generateSignature(itnFields, args['invalid-sig'] ? 'wrong-passphrase' : passphrase);
}
itnFields.push(['signature', signature]);

const queryString = itnFields.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');

console.log('PayFast ITN Notification Test');
console.log('=============================\n');
console.log(`Base URL: ${baseUrl}`);
console.log(`Endpoint: POST /api/payments/payfast/notify`);
console.log(`Full URL: ${baseUrl}/api/payments/payfast/notify`);
console.log(`\nPayment Details:`);
console.log(`  m_payment_id: ${mPaymentId}`);
console.log(`  amount_gross: ${amount}`);
console.log(`  payment_status: ${args.status}`);
console.log(`  signature: ${signature}`);
if (args['invalid-sig']) {
  console.log(`  ⚠️  INVALID SIGNATURE (testing error handling)`);
}
if (args['invalid-amount']) {
  console.log(`  ⚠️  MISMATCHED AMOUNT (testing error handling)`);
}
console.log(`\nRequest Body:`);
console.log(queryString);
console.log(`\nSending...\n`);

fetch(`${baseUrl}/api/payments/payfast/notify`, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/x-www-form-urlencoded',
  },
  body: queryString,
})
  .then((res) => {
    console.log(`Status: ${res.status}`);
    return res.json().then((body) => ({ status: res.status, body }));
  })
  .then(({ status, body }) => {
    console.log(`Response:`, JSON.stringify(body, null, 2));
    if (status === 200 || status === 400 || status === 404) {
      console.log(`\n✓ Request completed`);
    } else {
      console.log(`\n✗ Unexpected status code`);
      process.exit(1);
    }
  })
  .catch((err) => {
    console.error(`\n✗ Request failed:`, err.message);
    console.error(`\nMake sure:`);
    console.error(`  1. App is running at ${baseUrl}`);
    console.error(`  2. PAYFAST_PASSPHRASE is set: "${passphrase}"`);
    console.error(`  3. Endpoint /api/payments/payfast/notify is accessible`);
    process.exit(1);
  });
