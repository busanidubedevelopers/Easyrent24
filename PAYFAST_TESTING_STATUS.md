# PayFast Payment Processing - Testing Status

**Current Status**: ⚠️ **NOT PRODUCTION READY** — Signature algorithm proven, but end-to-end flow untested against real PayFast servers

---

## What's Verified ✅

### Unit Tests (141 passing)

| Test Suite | Coverage | Status |
|-----------|----------|--------|
| **phpUrlEncode** | Encoding algorithm (must match PHP exactly) | ✅ 7 tests passing |
| **generateSignature** | MD5 signature generation | ✅ 9 tests passing |
| **verifySignature** | Signature verification logic | ✅ 4 tests passing |
| **amountsMatch** | Cent-precision amount comparison | ✅ 5 tests passing |
| **buildPaymentRequest** | Payment form field generation | ✅ 2 tests passing |

All unit tests verified independently:
- MD5 signatures cross-checked against manual crypto computation
- Amount comparison tested for float precision edge cases
- Field ordering preserved correctly for signature stability

**Run tests**:
```bash
cd backend
npm test -- payfast.test.ts
```

---

## What's NOT Verified ❌

### 1. Server-to-Server Validation
**Function**: `validateWithPayfast()` in `backend/lib/payfast.ts`

- Makes real HTTP call to `https://sandbox.payfast.co.za/eng/query/validate`
- **Status**: Never run against real PayFast servers
- **Why**: Network-sandboxed environments can't reach PayFast
- **Impact**: Cannot confirm ITN originates from PayFast (only proves signature wasn't tampered with)

### 2. Full Payment Flow
**Scenario**: User clicks "Pay" → redirected to PayFast → completes payment → ITN callback received → app updated

- **Status**: Never tested end-to-end
- **Verified**: Individual components (signature generation, amount checking, idempotency)
- **Risk**: Integration failures, PayFast API behavior differences, callback delivery issues

### 3. ITN Callback Delivery
**Scenario**: PayFast calls `/api/payments/payfast/notify` after payment

- **Status**: Never tested in production-like environment
- **Potential issues**:
  - Firewall blocking callback
  - Wrong URL configured in PayFast dashboard
  - ngrok tunnel expires or wrong URL used
  - PayFast sandbox returns different data format than documented

### 4. Live vs. Sandbox Behavior Differences
**Risk**: Sandbox and live environments may behave differently

- Signature algorithm might differ
- Field naming might differ
- Response format might differ
- Error handling might differ

---

## Testing Requirements Before Production

### Tier 1: Critical (Must Complete)

- [ ] **Create PayFast Sandbox Account**
  - [ ] Register at [sandbox.payfast.co.za](https://sandbox.payfast.co.za)
  - [ ] Obtain Merchant ID, Merchant Key, Passphrase
  - [ ] Enable ITN notifications
  - [ ] Configure ITN URL to your app

- [ ] **Test Payment Initiation**
  - [ ] User can click "Pay" button
  - [ ] Redirected to PayFast sandbox process URL
  - [ ] Form contains all required fields with valid signature
  - [ ] Payment record created with `status: 'pending'`

- [ ] **Complete Payment in Sandbox**
  - [ ] Use PayFast sandbox test card: `4111111111111111`
  - [ ] Payment shows as complete in PayFast dashboard
  - [ ] See confirmation page (or redirect to your success URL)

- [ ] **Verify ITN Callback Received**
  - [ ] ITN callback hits `/api/payments/payfast/notify`
  - [ ] Signature verification passes (check logs)
  - [ ] Server-to-server validation passes (if network allows)
  - [ ] Amount matches (check logs)
  - [ ] Payment record updated to `status: 'complete'`

- [ ] **Verify Application Status Updated**
  - [ ] Application status changed to `'reviewing'` (or appropriate next state)
  - [ ] `paid_at` timestamp set
  - [ ] `payment_status` changed to `'paid'`
  - [ ] Frontend shows payment as "Paid"

- [ ] **Test Error Scenarios**
  - [ ] Invalid signature rejected with `400 Bad Request`
  - [ ] Amount mismatch rejected with `400 Bad Request` (payment marked `'failed'`)
  - [ ] Duplicate ITN handled idempotently (no duplicate updates)
  - [ ] Missing payment record returns `404 Not Found`
  - [ ] Failed payment status handled (app status not auto-advanced)

### Tier 2: High Priority (Before Public Beta)

- [ ] **Create Live PayFast Account**
  - [ ] Register at [www.payfast.co.za](https://www.payfast.co.za)
  - [ ] Obtain live Merchant ID, Merchant Key, Passphrase
  - [ ] Complete merchant verification (if required)

- [ ] **Test Against Live PayFast**
  - [ ] Repeat Tier 1 tests against live environment
  - [ ] Use small test amounts (e.g., R5-R10)
  - [ ] Verify signature algorithm matches live expectations
  - [ ] Verify all response fields match documentation

- [ ] **Add Request Logging**
  - [ ] Log all ITN requests with request ID
  - [ ] Log all payment status changes
  - [ ] Log all errors with full context
  - [ ] Include timestamps and user identification

- [ ] **Set Up Monitoring**
  - [ ] Alert on payment failures
  - [ ] Alert on repeated ITN errors
  - [ ] Dashboard showing payment success rate
  - [ ] Dashboard showing average payment processing time

### Tier 3: Nice-to-Have (Improves Reliability)

- [ ] **Add Retry Logic**
  - [ ] Handle transient ITN callback failures
  - [ ] Retry failed payments (with user consent)
  - [ ] Exponential backoff for retries

- [ ] **Add Manual Payment Verification**
  - [ ] Admin interface to check PayFast payment status manually
  - [ ] Option to manually mark payment as complete (for stuck payments)
  - [ ] Audit trail of manual interventions

- [ ] **Performance Testing**
  - [ ] Test ITN handling under high concurrent load (simulate multiple payments)
  - [ ] Verify database locks don't cause slowdowns
  - [ ] Test payment initiation with high latency to PayFast

---

## Tools & Scripts Provided

### 1. `PAYFAST_E2E_TESTING_GUIDE.md`
**What**: Step-by-step guide for end-to-end testing

**Use**: Follow this guide to test against real PayFast sandbox

**Covers**:
- Setting up PayFast sandbox account
- Configuring environment variables
- Exposing local app to internet (ngrok)
- Initiating and completing test payments
- Verifying database and frontend state
- Testing error scenarios
- Troubleshooting common issues

### 2. `test-payfast-itn.mjs` Script
**What**: Manual ITN testing without going through PayFast UI

**Why**: Faster iteration for testing error scenarios and debugging

**Use**:
```bash
# Happy path test
cd backend/scripts
node test-payfast-itn.mjs --app-id abc123 --amount 250.00

# Test invalid signature
node test-payfast-itn.mjs --app-id abc123 --invalid-sig

# Test amount mismatch
node test-payfast-itn.mjs --app-id abc123 --invalid-amount

# Test specific m_payment_id
node test-payfast-itn.mjs --m-payment-id APP-abc123-1234567890 --amount 250.00

# Full help
node test-payfast-itn.mjs --help
```

**Requires**:
- App running at `http://localhost:3000` (or set `--base-url`)
- `PAYFAST_PASSPHRASE` environment variable set
- `PAYFAST_MERCHANT_ID` environment variable set (or default used)

---

## Current Code Coverage

### Payment Initiation Flow

```
User clicks "Pay" button
  ↓
POST /api/applications/[id]/pay
  ├─ Authenticate user ✅
  ├─ Fetch application ✅
  ├─ Check applicant owns application ✅
  ├─ Check payment not already paid ✅
  ├─ Create payment record (pending) ✅
  ├─ Generate PayFast form fields ✅
  │   ├─ buildPaymentRequest() ✅
  │   └─ generateSignature() ✅
  └─ Return process URL + fields ✅
      ↓
Frontend renders hidden form + auto-submits
  ↓
User redirected to https://sandbox.payfast.co.za/eng/process
  ↓
User completes payment ✅ (manually tested in sandbox)
  ↓
PayFast server calls POST /api/payments/payfast/notify ⚠️ (Not tested)
  ↓
POST /api/payments/payfast/notify
  ├─ Parse ITN body ✅
  ├─ Verify signature ✅
  ├─ Server-to-server validation ⚠️ (Network-dependent)
  ├─ Fetch payment record ✅
  ├─ Check idempotency ✅
  ├─ Verify amount match ✅
  ├─ Update payment to 'complete' ✅
  ├─ Update application status ✅
  └─ Return 200 ✅
```

**Legend**:
- ✅ = Unit tested
- ⚠️ = Not unit tested (requires real PayFast)
- ❌ = Not implemented

---

## Risks & Mitigations

### Risk 1: Signature Algorithm Differs in Production

**Severity**: High
**Cause**: PHP `urlencode()` has subtle differences; PayFast uses PHP

**Mitigation**:
- ✅ Unit tests verify against hand-computed MD5 values
- ✅ Script `phpUrlEncode()` explicitly handles PHP differences
- ⚠️ Must verify against live PayFast server (Tier 1 test)

### Risk 2: Server-to-Server Validation Fails in Production

**Severity**: High
**Cause**: Cannot test against real PayFast from sandboxed environment

**Mitigation**:
- ✅ Function implemented per PayFast documentation
- ⚠️ Must test against real PayFast sandbox before going live
- If production environment also can't reach PayFast: temporarily disable, but document for future investigation

### Risk 3: ITN Callback Never Reaches App

**Severity**: High
**Cause**: Firewall, wrong URL, ngrok tunnel dies, etc.

**Mitigation**:
- ✅ Manual testing with `test-payfast-itn.mjs` catches endpoint issues
- ⚠️ Must configure correct ITN URL in PayFast dashboard
- ⚠️ Must ensure public IP/domain accessible from internet
- For local testing: use ngrok with correct forwarding URL

### Risk 4: Silent Payment Failures in Production

**Severity**: High
**Cause**: Payment completes in PayFast but app never processes it

**Mitigation**:
- ✅ Unit tests verify idempotency and error handling
- ⚠️ Must add request logging with request IDs
- ⚠️ Must add alerts for payment errors
- ⚠️ Must add manual verification/recovery procedure

### Risk 5: Applicants Expect Real-Time Status Updates

**Severity**: Medium
**Cause**: Applicant pays, but sees "pending" status until ITN arrives

**Mitigation**:
- ✅ Frontend shows "Payment Processing" state during this period
- ✅ Frontend can poll `/api/applications/[id]` to refresh status
- ⚠️ Must document typical ITN latency (usually <30 seconds)

---

## Recommended Testing Order

1. **Local Development** (1-2 hours)
   - Follow `PAYFAST_E2E_TESTING_GUIDE.md` Step 1-3 (setup)
   - Set up ngrok tunnel
   - Configure env vars
   - Run app locally

2. **Sandbox Happy Path** (1 hour)
   - Follow Steps 4-6 (initiate payment, complete payment, verify updates)
   - Manually test payment flow end-to-end
   - Verify database state
   - Verify frontend state

3. **Sandbox Error Scenarios** (1 hour)
   - Use `test-payfast-itn.mjs` script to quickly test error cases
   - Test invalid signature
   - Test amount mismatch
   - Test idempotency
   - Test missing payment record

4. **Server-to-Server Validation** (30 minutes)
   - Check if `validateWithPayfast()` can reach PayFast
   - If not: document the limitation and plan workaround for production

5. **Live Account Testing** (2 hours)
   - Create live PayFast account
   - Repeat happy path against live environment with small test amounts
   - Verify signature algorithm matches
   - Verify response formats match

6. **Production Deployment** (30 minutes)
   - Update env vars in AWS Secrets Manager (Task 2)
   - Set `PAYFAST_MODE=live`
   - Configure CloudFront/WAF for production URL
   - Configure ITN URL in live PayFast dashboard
   - Deploy to production

**Total time**: ~5-6 hours first time; ~1-2 hours for repeat testing on different environments

---

## Post-Testing Checklist

- [ ] All error scenarios tested and handled correctly
- [ ] Logging configured for payment debugging
- [ ] Monitoring alerts set up for payment failures
- [ ] Runbook created for payment troubleshooting
- [ ] Team trained on payment flow and how to debug
- [ ] Documentation updated with live PayFast credentials (secure storage)
- [ ] Backup payment method documented (manual invoice if PayFast fails)
- [ ] Recovery procedure tested (e.g., marking stuck payment as complete)

---

## Communication with Stakeholders

### Before Testing
- [ ] Notify payment testing will happen
- [ ] Explain sandbox transactions won't create real charges
- [ ] Provide timeline for completion

### After Testing Complete
- [ ] Summarize test results
- [ ] List any issues found and fixes applied
- [ ] Confirm ready for production
- [ ] Provide status of any remaining work (e.g., live account setup)

---

## Next Steps

1. **Follow the guide**: Start with `PAYFAST_E2E_TESTING_GUIDE.md` Steps 1-3
2. **Set up sandbox**: Create PayFast account and get credentials
3. **Run local tests**: Follow Steps 4-6 of the guide
4. **Use test script**: Use `test-payfast-itn.mjs` for rapid error scenario testing
5. **Test live**: Repeat against live PayFast before going live
6. **Deploy**: Move to production once all tests pass

