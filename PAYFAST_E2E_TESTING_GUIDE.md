# PayFast End-to-End Testing Guide

## Overview

The PayFast ITN (Instant Transaction Notification) flow is currently **not verified** against real PayFast servers. While the signature verification and amount matching logic are proven correct through unit tests, the **full round-trip** with PayFast's actual servers has never been tested.

This guide walks through:
1. Setting up a real PayFast sandbox account
2. Testing the payment initiation flow
3. Verifying ITN callback handling
4. Validating the application status updates

**Time estimate**: 2-3 hours for first-time setup and testing.

---

## Prerequisites

- Working easyrent24 application running locally or in a staging environment
- Supabase project set up with database migrations applied
- PayFast sandbox account (free to create)
- Network access from your testing environment to `sandbox.payfast.co.za`
- A test applicant profile to trigger payments with

---

## Step 1: Create PayFast Sandbox Account

### 1.1 Register

1. Go to [sandbox.payfast.co.za](https://sandbox.payfast.co.za)
2. Click **"Create Free Account"** or **"Register Merchant"**
3. Fill in your details:
   - **Email**: Use a test email (can be anything@example.com)
   - **Full Name**: "EasyRent24 Test Merchant"
   - **Company**: "EasyRent24"
4. Accept terms and register

### 1.2 Verify Email

1. Check your email for a verification link (check spam folder)
2. Click the verification link
3. Log in to [sandbox.payfast.co.za](https://sandbox.payfast.co.za)

### 1.3 Get Merchant Credentials

1. In PayFast sandbox dashboard, go to **Integrations** or **Merchant Settings**
2. Find your merchant credentials:
   - **Merchant ID** (usually a 7-digit number)
   - **Merchant Key** (a long alphanumeric string)
   - **Passphrase** (you should set this yourself, or note the default)

### 1.4 Enable ITN Notifications

1. Go to **Settings** → **Notification Settings** (or similar)
2. Ensure **ITN** is **enabled**
3. Enter your notification URL: `https://your-app.com/api/payments/payfast/notify`
   - **For local testing**: Use ngrok or a tunneling service to expose your local server to the internet
   - Example: `https://abc123.ngrok.io/api/payments/payfast/notify`

---

## Step 2: Configure Your Environment

### 2.1 Update Frontend `.env.local`

Add the PayFast sandbox credentials to `frontend/.env.local`:

```env
# PayFast Sandbox Configuration
PAYFAST_MERCHANT_ID=10000100
PAYFAST_MERCHANT_KEY=mk_sandbox_abc123def456
PAYFAST_PASSPHRASE=your-test-passphrase-here
PAYFAST_MODE=sandbox
NEXT_PUBLIC_APP_URL=https://abc123.ngrok.io  # Or your staging URL
```

**Important**:
- `PAYFAST_MODE=sandbox` (not `live`)
- `NEXT_PUBLIC_APP_URL` must match the domain name used to access your app (required for PayFast return/cancel/notify URLs)
- `PAYFAST_PASSPHRASE` must match exactly what you set in PayFast dashboard

### 2.2 Restart Your Application

1. Stop your local/staging app
2. Restart with the updated env vars loaded
3. Verify PayFast URLs are sandbox:
   - Check backend logs or add a debug endpoint to confirm `process.env.PAYFAST_MODE === 'sandbox'`

---

## Step 3: Expose Local Server to Internet (For Local Testing)

If testing locally, you need to expose your app to the internet so PayFast can reach the ITN callback.

### Option A: ngrok (Recommended for Local Testing)

1. Install ngrok: [ngrok.com/download](https://ngrok.com/download)
2. Start ngrok tunnel:
   ```bash
   ngrok http 3000
   ```
3. Copy the forwarding URL (e.g., `https://abc123.ngrok.io`)
4. Update `NEXT_PUBLIC_APP_URL` in your `.env.local` to this URL
5. Restart your app

### Option B: Staging Environment

If you have a staging server on AWS/Heroku/etc., use its public URL directly.

### Option C: PayFast Sandbox Simulation

For development **without** real network callbacks, you can simulate ITN notifications by manually calling the notify endpoint (see **Step 5** below).

---

## Step 4: Create Test Data and Initiate Payment

### 4.1 Sign Up as Test Applicant

1. Open your app frontend
2. Create a new applicant account with a test email
3. Start a new application for a property
4. Complete the application form and submit

### 4.2 Initiate Payment

1. Once application is submitted, look for a **"Pay Application Fee"** button
2. Click it
3. You should be redirected to PayFast's sandbox payment page
4. **Expected behavior**:
   - Form auto-submits to `https://sandbox.payfast.co.za/eng/process`
   - PayFast page displays the application fee amount
   - You see payment options (credit card, bank transfer, etc.)

### 4.3 Record the `m_payment_id`

1. In your app backend logs, find the payment creation step
2. Note the `m_payment_id` generated (format: `APP-<app-id>-<timestamp>`)
3. In your database, verify a `payments` record was created with `status: 'pending'`

**Verify in Supabase**:
```sql
SELECT * FROM payments WHERE m_payment_id LIKE 'APP-%' ORDER BY created_at DESC LIMIT 1;
```

You should see:
- `status`: `'pending'`
- `application_id`: Your test application's ID
- `amount_gross`: The application fee amount
- `m_payment_id`: The payment ID

---

## Step 5: Complete Payment in PayFast

### 5.1 Choose a Payment Method

On the PayFast sandbox page, select a payment method:
- **Credit card**: Use PayFast test card details
  - Card number: `4111111111111111`
  - Expiry: Any future date (e.g., `12/25`)
  - CVC: Any 3 digits (e.g., `123`)
- **EFT/Bank Transfer**: PayFast may simulate this automatically in sandbox

### 5.2 Complete the Transaction

1. Enter payment details and submit
2. PayFast should show a success confirmation
3. You may be redirected back to your app's success URL

### 5.3 Check Logs for ITN Callback

**Critical**: PayFast should now call your ITN notify endpoint.

1. Check your app backend logs for:
   ```
   PayFast ITN: valid signature
   PayFast ITN: server-to-server validation passed
   PayFast ITN: amount match verified
   ```

2. If using ngrok, you can see the callback in ngrok's web dashboard: `localhost:4040`

3. **If you don't see the callback**:
   - Check that `validateWithPayfast()` didn't fail (PayFast servers are unreachable from your environment)
   - Verify your ITN notification URL in PayFast dashboard is correct
   - Check PayFast sandbox's **Transaction History** or **Notification Log** to see if they tried to call your endpoint

---

## Step 6: Verify Application Status Update

### 6.1 Check Database State

After the ITN callback is received, verify the payment and application were updated:

```sql
-- Check payment status
SELECT id, m_payment_id, status, pf_payment_id, raw_itn_payload FROM payments 
WHERE m_payment_id LIKE 'APP-%' 
ORDER BY created_at DESC LIMIT 1;

-- Check application status
SELECT id, status, payment_status, paid_at FROM applications 
WHERE id = '<your-app-id>';
```

**Expected state after successful payment**:
- `payments.status`: `'complete'`
- `payments.pf_payment_id`: Set (PayFast's own payment ID)
- `payments.raw_itn_payload`: Full ITN JSON stored
- `applications.payment_status`: `'paid'`
- `applications.status`: `'reviewing'` (auto-advanced from `pending`)
- `applications.paid_at`: Current timestamp

### 6.2 Check Frontend State

1. Log in as the applicant
2. Navigate to your application
3. Verify the payment status shows as **"Paid"** or similar
4. Verify the application status shows as **"In Review"** or **"Reviewing"**

---

## Step 7: Test Error Scenarios

### 7.1 Invalid Signature

Simulate a tampered ITN by manually calling the notify endpoint with modified data:

```bash
curl -X POST http://localhost:3000/api/payments/payfast/notify \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "m_payment_id=APP-xxx&amount_gross=250.00&payment_status=COMPLETE&signature=invalid_signature"
```

**Expected**: `400 Bad Request` with `"Invalid signature."`

**Check logs**:
```
PayFast ITN: invalid signature
```

### 7.2 Amount Mismatch

Manually call the notify endpoint with a different amount than the payment record:

```bash
# First, complete a real payment and note the m_payment_id
# Then, manually send an ITN with wrong amount:

curl -X POST http://localhost:3000/api/payments/payfast/notify \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "m_payment_id=APP-xxx&amount_gross=999.99&payment_status=COMPLETE&signature=<valid-sig>"
```

**Expected**: `400 Bad Request` with `"Amount mismatch."`

**Check database**: `payments.status` should be updated to `'failed'`

### 7.3 Duplicate/Idempotent ITN

After a successful payment, manually replay the same ITN notification:

```bash
# Use the exact same data from a successful ITN above
curl -X POST http://localhost:3000/api/payments/payfast/notify \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "<same exact ITN data as before>"
```

**Expected**: `200 OK` with `{ "received": true, "alreadyProcessed": true }`

**Check database**: Application status should NOT change (already reviewing/already paid)

### 7.4 Missing Payment Record

Create a payment ITN for an `m_payment_id` that doesn't exist in your database:

```bash
curl -X POST http://localhost:3000/api/payments/payfast/notify \
  -H "Content-Type: application/x-www-form-urlencoded" \
  -d "m_payment_id=APP-nonexistent&amount_gross=250.00&payment_status=COMPLETE&signature=<sig>"
```

**Expected**: `404 Not Found` with `"Unknown payment reference."`

### 7.5 Failed Payment Status

Complete a payment in PayFast but intentionally fail it (if PayFast sandbox supports this), or manually simulate:

```bash
# Generate a valid signature for a FAILED payment
# Then POST to the notify endpoint
```

**Expected**:
- `payments.status`: `'failed'`
- `applications.payment_status`: `'failed'`
- Application status should NOT auto-advance

---

## Step 8: Test Failure Modes

### 8.1 Server-to-Server Validation Failure

**Current limitation**: If PayFast's sandbox validation server is unreachable from your environment (e.g., network-sandboxed VM, corporate firewall), the `validateWithPayfast()` call will fail.

**What to do**:
1. Check logs for:
   ```
   PayFast server-to-server validation call failed
   ```
2. This may be expected in some environments; document it
3. In production, this should work (assuming no firewall blocks `sandbox.payfast.co.za`)
4. **Workaround for testing**: Temporarily comment out or bypass the `validateWithPayfast()` check during local testing (but restore it before production)

### 8.2 Webhook Delivery Failure

If ITN callbacks are not reaching your app:

1. **Check ITN Configuration**:
   - PayFast dashboard → Notification Settings
   - Verify the URL is correct and publicly accessible

2. **Test with ngrok**:
   - Ensure ngrok tunnel is still active
   - Restart ngrok if needed
   - Verify the forwarding URL matches `NEXT_PUBLIC_APP_URL`

3. **Check Firewall/CORS**:
   - PayFast calls from their servers; CORS doesn't apply
   - Ensure your app is accepting POST requests to `/api/payments/payfast/notify` without auth

4. **PayFast Notification Log**:
   - In PayFast dashboard, check **Notification History** or **Notification Log**
   - See if PayFast attempted the callback and what response they received

5. **Manual Testing**:
   - Use curl or Postman to POST a sample ITN to your endpoint
   - Verify it processes correctly

---

## Step 9: Production Readiness Checklist

Before moving to production, confirm:

- [ ] Created PayFast **live** account (separate from sandbox)
- [ ] Obtained live merchant credentials (Merchant ID, Merchant Key, Passphrase)
- [ ] Updated `.env.local` or AWS Secrets Manager with live credentials
- [ ] Set `PAYFAST_MODE=live`
- [ ] Set `NEXT_PUBLIC_APP_URL` to your production domain
- [ ] Configured PayFast ITN notification URL to production domain
- [ ] Tested full flow (initiate payment → complete → ITN callback → app update) against live PayFast
- [ ] Verified signature generation matches PayFast's expectations
- [ ] Verified server-to-server validation works (`validateWithPayfast` returns `true`)
- [ ] Verified amount matching works
- [ ] Verified idempotency (duplicate ITN doesn't duplicate payment)
- [ ] Verified error scenarios (invalid signature, amount mismatch, etc.)
- [ ] Added request ID logging for debugging production issues
- [ ] Set up monitoring/alerts for payment failures
- [ ] Tested rollback/recovery procedure if payment processing breaks

---

## Troubleshooting

### "PayFast server-to-server validation call failed"

**Cause**: The app can't reach PayFast's validation server.

**Solutions**:
- Verify network access to `sandbox.payfast.co.za` from your environment
- Check firewall/proxy settings
- Try from a different network (e.g., not corporate VPN)
- In staging/production: ensure AWS security group allows outbound HTTPS

### "Invalid signature"

**Cause**: Signature verification failed.

**Check**:
- `PAYFAST_PASSPHRASE` matches exactly what's in PayFast dashboard
- Field order is preserved (PayFast is very sensitive to this)
- `phpUrlEncode()` is being used (not `encodeURIComponent()`)
- Verify manually with the test in `backend/tests/payfast.test.ts`

### ITN callback not received

**Cause**: Notification URL not reachable or misconfigured.

**Check**:
- In PayFast dashboard, ITN URL is set correctly
- For local testing: ngrok tunnel is active and URL is updated
- App is listening on the correct port
- No firewall blocking the callback
- Test manually: `curl -X POST http://localhost:3000/api/payments/payfast/notify -d "..."`

### Amount mismatch error

**Cause**: The amount paid doesn't match the amount expected.

**Check**:
- In the payment record: `SELECT amount_gross FROM payments WHERE m_payment_id = '...'`
- In the ITN: `amount_gross` field
- Verify they're equal to the cent
- Check for rounding errors in the payment initiation code

### Application status didn't update after payment

**Cause**: ITN was received but application status update failed.

**Check**:
- Look for errors in the route logs
- Verify RLS policies on the `applications` table allow the service-role key to update
- Verify the `application_id` in the payment record matches the actual application
- Manually check: `SELECT id, status FROM applications WHERE id = '<id>'`

---

## Testing Checklist

Use this checklist to track your end-to-end testing:

- [ ] **Setup Phase**
  - [ ] PayFast sandbox account created
  - [ ] Merchant credentials obtained
  - [ ] ITN notification enabled in PayFast
  - [ ] Environment variables configured
  - [ ] App restarted with new env vars
  - [ ] ngrok tunnel set up (for local testing)

- [ ] **Happy Path**
  - [ ] Test applicant created
  - [ ] Application submitted
  - [ ] Payment initiation succeeds (redirect to PayFast)
  - [ ] Payment completed in PayFast
  - [ ] ITN callback received (check logs)
  - [ ] Payment record updated to 'complete'
  - [ ] Application status updated to 'reviewing'
  - [ ] Frontend shows "Paid" status

- [ ] **Error Scenarios**
  - [ ] Invalid signature rejected
  - [ ] Amount mismatch rejected
  - [ ] Duplicate ITN handled idempotently
  - [ ] Missing payment record returns 404
  - [ ] Failed payment status handled

- [ ] **Production Readiness**
  - [ ] Live PayFast account created
  - [ ] Live credentials configured
  - [ ] Full flow tested against live PayFast
  - [ ] Monitoring/alerting configured
  - [ ] Runbook documented for payment failures

---

## Logging Events to Track

Add logging/monitoring for these critical events:

1. **Payment Initiation**: `{ event: 'payment_initiated', application_id, m_payment_id, amount }`
2. **ITN Received**: `{ event: 'itn_received', m_payment_id, payment_status, amount }`
3. **Signature Valid**: `{ event: 'itn_signature_valid', m_payment_id }`
4. **Server Validated**: `{ event: 'itn_server_validated', m_payment_id }`
5. **Amount Matched**: `{ event: 'itn_amount_matched', m_payment_id }`
6. **Payment Completed**: `{ event: 'payment_completed', m_payment_id, pf_payment_id }`
7. **Application Updated**: `{ event: 'application_updated', application_id, new_status }`
8. **Error Cases**: `{ event: 'itn_error', error_type, m_payment_id, reason }`

These will help diagnose production issues.

---

## Next Steps

Once this E2E testing is complete and all checks pass:

1. Document any environment-specific quirks (e.g., firewall issues)
2. Update infrastructure-as-code to set PayFast credentials in AWS Secrets Manager (Task 2)
3. Set up monitoring alerts for payment failures
4. Create runbook for payment troubleshooting
5. Move to the next critical issue in the audit

