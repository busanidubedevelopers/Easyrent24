# Critical Issue #1: Unverified PayFast Payment Processing

**Status**: 🔴 **CRITICAL** — Payment flow never tested end-to-end against real PayFast servers

**Impact**: Cannot go live with payments; risk of failed transactions and inability to diagnose issues

**Timeline**: 2-3 hours for initial testing; add to CI/CD afterward

---

## Executive Summary

The PayFast ITN (payment callback) integration is **theoretically sound** but **practically unverified**:

- ✅ Signature generation algorithm proven correct via unit tests (MD5 cross-checked)
- ✅ Amount matching logic tested against edge cases (float precision)
- ✅ Idempotency handling tested (duplicate callbacks safe)
- ❌ **Real PayFast server communication never tested** (server-to-server validation can't run from sandboxed dev environment)
- ❌ **Full payment flow never tested end-to-end** (user payment → callback → app update)
- ❌ **Live PayFast environment never tested**

**Why it matters**: Payment processing is safety-critical. Silent failures could result in:
- Applicants paying but status not updating (stuck payments)
- Landlords seeing no deposits (lost revenue)
- No audit trail of what went wrong
- User support burden with no clear resolution

---

## What You'll Do

Follow this step-by-step process:

### Phase 1: Local Development Testing (1-2 hours)

1. **Create PayFast Sandbox Account** → Get test merchant credentials
2. **Configure Local Environment** → Update env vars with sandbox credentials
3. **Expose Local App to Internet** → Use ngrok tunnel so PayFast can reach callback
4. **Test Payment Initiation** → Verify payment form generates correctly with valid signature
5. **Complete Test Payment** → Use PayFast sandbox test card
6. **Monitor Callback** → Verify PayFast calls your ITN endpoint
7. **Verify Status Updates** → Check payment and application records in database
8. **Test Error Scenarios** → Invalid signatures, amount mismatches, duplicates

### Phase 2: Validation & Documentation (1 hour)

1. **Confirm All Tests Pass** → Document results in PAYFAST_TESTING_RESULTS.md
2. **Set Up Live PayFast Account** → Get live credentials (don't use yet)
3. **Plan Production Testing** → Schedule live testing for after deployment

### Phase 3: Production Deployment (Later)

1. **Update AWS Secrets Manager** → Move PayFast credentials there (Task 2)
2. **Deploy to Staging** → Test with live PayFast credentials in safe environment
3. **Deploy to Production** → Go live with payments

---

## Resources Provided

### 1. `PAYFAST_E2E_TESTING_GUIDE.md`
**What**: Complete step-by-step guide for end-to-end testing

**Covers**:
- Setting up PayFast sandbox account (Steps 1-2)
- Configuring environment variables (Step 3)
- Exposing local app with ngrok (Step 4)
- Initiating and completing test payment (Steps 5-6)
- Verifying database and frontend state (Step 6-7)
- Testing error scenarios (Step 7)
- Troubleshooting common issues

**Time**: 2-3 hours following this guide step-by-step

### 2. `PAYFAST_TESTING_STATUS.md`
**What**: Current testing status and what's verified vs. not verified

**Use**: Understand what's been tested and what risks remain

**Key sections**:
- What's verified ✅ (unit tests, signature algorithm)
- What's NOT verified ❌ (server-to-server validation, full flow)
- Testing requirements checklist (Tier 1/2/3)
- Risks and mitigations
- Recommended testing order

### 3. `backend/scripts/test-payfast-itn.mjs`
**What**: Script to manually send ITN callbacks without PayFast UI

**Why**: Faster iteration for testing error scenarios

**Examples**:
```bash
# Happy path
node backend/scripts/test-payfast-itn.mjs --app-id abc123 --amount 250.00

# Test invalid signature
node backend/scripts/test-payfast-itn.mjs --app-id abc123 --invalid-sig

# Test amount mismatch
node backend/scripts/test-payfast-itn.mjs --app-id abc123 --invalid-amount

# Full help
node backend/scripts/test-payfast-itn.mjs --help
```

**Requirements**:
- App running at `http://localhost:3000`
- `PAYFAST_PASSPHRASE` env var set
- `PAYFAST_MERCHANT_ID` env var set (or default used)

### 4. `backend/docs/LOCAL_TESTING_NGROK.md`
**What**: Guide for setting up ngrok tunnel to expose local app

**Use**: If testing locally (instead of staging environment)

**Quick start**:
```bash
# Install ngrok
# Create account at ngrok.com (optional but recommended)

# Start tunnel
ngrok http 3000

# In PAYFAST_E2E_TESTING_GUIDE.md Step 3:
# Use the forwarding URL (e.g., https://abc123.ngrok.io)
# as your NEXT_PUBLIC_APP_URL
```

---

## Getting Started: Quick Checklist

### Before You Start
- [ ] Read `PAYFAST_TESTING_STATUS.md` (15 min) to understand current state
- [ ] Ensure easyrent24 app runs locally or in staging
- [ ] Have access to Supabase dashboard to verify database changes

### Testing Steps
- [ ] Follow `PAYFAST_E2E_TESTING_GUIDE.md` Steps 1-3 (Setup)
  - [ ] Create PayFast sandbox account
  - [ ] Get merchant credentials
  - [ ] Update `frontend/.env.local` with sandbox credentials
  - [ ] Restart frontend app
  
- [ ] Follow `PAYFAST_E2E_TESTING_GUIDE.md` Steps 4-6 (Happy Path)
  - [ ] Set up ngrok tunnel (or use staging environment)
  - [ ] Create test applicant
  - [ ] Initiate payment
  - [ ] Complete payment in PayFast sandbox
  - [ ] Verify ITN callback received
  - [ ] Verify database and frontend state
  
- [ ] Follow `PAYFAST_E2E_TESTING_GUIDE.md` Step 7 (Error Scenarios)
  - [ ] Use `test-payfast-itn.mjs` to test error cases quickly:
    - Invalid signature
    - Amount mismatch
    - Duplicate ITN
    - Missing payment record
    - Failed payment status

### After Testing
- [ ] Document results in a new file: `PAYFAST_TESTING_RESULTS.md`
- [ ] Create PayFast live account (don't test yet)
- [ ] Add results to production readiness audit summary

---

## Expected Outcomes

### Success Criteria ✅

All of these should be true after testing:

1. **Payment Initiation** 
   - ✅ User can click "Pay" button
   - ✅ Redirected to PayFast payment form
   - ✅ Form includes all required fields with valid signature
   - ✅ Payment record created with `status: 'pending'`

2. **Payment Completion**
   - ✅ Can complete payment in PayFast sandbox using test card
   - ✅ Payment shows complete in PayFast dashboard

3. **ITN Callback Processing**
   - ✅ Signature verification passes (logs show "valid signature")
   - ✅ Server-to-server validation passes (if network allows)
   - ✅ Amount matching passes (logs show "amount match verified")
   - ✅ ITN callback updates payment record to `status: 'complete'`

4. **Application Status Update**
   - ✅ Application status changes to `'reviewing'` (auto-advanced)
   - ✅ Application `payment_status` changes to `'paid'`
   - ✅ Application `paid_at` timestamp set
   - ✅ Frontend shows payment as "Paid"

5. **Error Handling**
   - ✅ Invalid signature returns 400 Bad Request
   - ✅ Amount mismatch returns 400 Bad Request (payment marked failed)
   - ✅ Duplicate ITN handled idempotently (no duplicate updates)
   - ✅ Missing payment record returns 404 Not Found
   - ✅ Failed payment status handled correctly

### If Testing Reveals Issues

**Common issues** and how to debug:

| Issue | Check | Fix |
|-------|-------|-----|
| ITN not received | ngrok tunnel running? ITN URL correct in PayFast? | Restart ngrok, update URL, check ngrok dashboard (http://localhost:4040) |
| Invalid signature | PAYFAST_PASSPHRASE env var correct? | Verify in PayFast dashboard, update .env.local, restart app |
| Server validation fails | Network access to payfast.co.za? | Try from different network, may need to skip in sandboxed environments |
| Amount mismatch | Check payment record amount vs. ITN amount | Verify amounts in Supabase, check for rounding errors |
| App status not updated | RLS policy issues? | Check backend/migrations/004_applications_policies.sql, verify policy allows updates |

See `PAYFAST_E2E_TESTING_GUIDE.md` Troubleshooting section for more.

---

## Integration with CI/CD

Once manual testing passes, add to CI/CD pipeline:

### What to Automate

1. **Payment Unit Tests** (already have)
   ```bash
   cd backend && npm test -- payfast.test.ts
   ```

2. **Add Integration Tests** (future)
   - Mock Supabase client
   - Test full ITN flow with mocked PayFast
   - Verify status transitions

### What to Manual Test Regularly

1. **Against PayFast Sandbox**: Monthly or before releases
2. **Against PayFast Live**: Before deploying to production
3. **Error Scenarios**: Whenever payment logic changes

---

## Success Metrics

**After completing this testing**, you should be able to answer:

- ✅ "What happens when a user pays?" → Payment record created, app redirected to PayFast
- ✅ "How do we know PayFast completed the payment?" → ITN callback signature verified
- ✅ "When does the app status update?" → When ITN callback received and validated
- ✅ "What happens if the ITN callback never arrives?" → Documented in troubleshooting
- ✅ "What happens if the amount paid doesn't match?" → Payment marked failed, application not updated
- ✅ "What happens if we receive the same ITN twice?" → Handled idempotently, no duplicate updates
- ✅ "How do we debug payment issues in production?" → Request ID in logs, PayFast dashboard, manual verification

---

## Next Steps (After This Issue)

Once you've verified PayFast ITN flow works:

1. **Critical Issue #2**: Implement AWS Secrets Manager integration (Task 2)
   - Move PayFast credentials from `.env.local` to AWS Secrets Manager
   - Fetch secrets on container startup
   - Test with Secrets Manager before production deployment

2. **Critical Issue #3**: Rotate exposed Supabase key
   - Key was exposed in test file earlier in project history
   - Generate new key in Supabase dashboard
   - Update all environments (dev, staging, production)

3. **Critical Issue #4**: Verify RLS policies on live Supabase
   - Re-run RLS test suite against real Supabase project
   - Ensure cross-user access properly blocked
   - Ensure role-based authorization works

4. **Critical Issue #5**: Add rate limiting
   - Prevent brute-force attacks on auth endpoints
   - Prevent payment spam
   - Prevent DoS via expensive queries

...and so on through the audit checklist.

---

## Questions?

Refer to the detailed guides:
- **"How do I...?"** → `PAYFAST_E2E_TESTING_GUIDE.md`
- **"What's the current status?"** → `PAYFAST_TESTING_STATUS.md`
- **"How do I set up ngrok?"** → `backend/docs/LOCAL_TESTING_NGROK.md`
- **"How do I test manually?"** → `backend/scripts/test-payfast-itn.mjs --help`

For issues not covered, check the troubleshooting section in the guide or refer back to the original audit report.

---

## Time Estimate

- **First time**: 2-3 hours (including setup and learning)
- **Subsequent times**: 30-45 minutes (quicker iteration)
- **Total time to production-ready**: Add to timeline after infrastructure setup (Task 2)

