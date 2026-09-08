# Critical Issue #1: PayFast Payment Processing — Action Plan

**Created**: September 4, 2026
**Status**: Ready for immediate action
**Effort Estimate**: 2-3 hours for testing; add 1-2 weeks for infrastructure (Task 2)

---

## 🎯 What You're Dealing With

The easyrent24 app has a PayFast payment integration that is **theoretically correct** but **never tested against real PayFast servers**. This is a blocking issue for production:

- Users will be able to initiate payments ✅
- But we don't know if PayFast callbacks will be processed ❌
- And we can't debug issues when they happen ❌

**Risk**: Applicants pay but the app doesn't register the payment → they see "pending" forever → support escalation → lost revenue.

---

## 📦 What's Been Delivered

I've created a complete testing package for you:

### 1. Comprehensive Guides
- **`PAYFAST_E2E_TESTING_GUIDE.md`** — Step-by-step testing walkthrough (2-3 hours)
- **`backend/docs/LOCAL_TESTING_NGROK.md`** — How to expose your local app to the internet
- **`PAYFAST_TESTING_STATUS.md`** — Current verification matrix and what's at risk

### 2. Testing Tools
- **`backend/scripts/test-payfast-itn.mjs`** — Manual ITN testing script (no PayFast UI needed)
- Examples: Test invalid signatures, amount mismatches, duplicates in seconds

### 3. Planning & Documentation
- **`CRITICAL_ISSUE_1_PAYFAST_TESTING.md`** — Action plan for this issue
- **`AUDIT_AND_TESTING_FILES_INDEX.md`** — Index of all files and how to use them

---

## 🚀 How to Start Right Now

### Step 1: Get Oriented (15 min)
Read this file and `CRITICAL_ISSUE_1_PAYFAST_TESTING.md` to understand what you're doing.

### Step 2: Set Up PayFast Sandbox (30 min)
1. Go to [sandbox.payfast.co.za](https://sandbox.payfast.co.za)
2. Create a free account
3. Get your merchant credentials (ID, Key, Passphrase)
4. Enable ITN notifications

### Step 3: Configure Your Local App (15 min)
1. Open `frontend/.env.local`
2. Add:
   ```env
   PAYFAST_MERCHANT_ID=<your-sandbox-id>
   PAYFAST_MERCHANT_KEY=<your-sandbox-key>
   PAYFAST_PASSPHRASE=<your-passphrase>
   PAYFAST_MODE=sandbox
   NEXT_PUBLIC_APP_URL=<your-app-url>  # http://localhost:3000 or ngrok URL
   ```
3. Restart your frontend app

### Step 4: Expose App to Internet (10 min, if testing locally)
```bash
# In a new terminal
ngrok http 3000

# Copy the forwarding URL (e.g., https://abc123.ngrok.io)
# Update NEXT_PUBLIC_APP_URL in .env.local
# Restart frontend app
```

### Step 5: Follow the Testing Guide (90 min)
Open `PAYFAST_E2E_TESTING_GUIDE.md` and follow steps 5-7:
- Create a test application
- Click "Pay"
- Complete payment with test card `4111111111111111`
- Verify PayFast calls your app
- Verify database records update
- Test error scenarios with the testing script

### Step 6: Document Results (15 min)
Create `PAYFAST_TESTING_RESULTS.md` noting:
- ✅ What tests passed
- ⚠️ What issues you found (and fixed)
- 📝 Any limitations or caveats

---

## 📊 What Success Looks Like

After following the guide, you should see:

1. **In PayFast Dashboard**
   - Transaction shows as "Complete"
   - Payment confirmed for your test amount

2. **In Your App Logs**
   ```
   PayFast ITN: valid signature
   PayFast ITN: server-to-server validation passed
   PayFast ITN: amount match verified
   PayFast ITN: payment record updated to 'complete'
   ```

3. **In Supabase**
   ```sql
   -- Payment record:
   SELECT id, m_payment_id, status, amount_gross FROM payments 
   WHERE m_payment_id LIKE 'APP-%' LIMIT 1;
   -- Should show: status = 'complete', amount_gross = 250.00

   -- Application record:
   SELECT id, status, payment_status, paid_at FROM applications 
   WHERE id = '<test-app-id>';
   -- Should show: status = 'reviewing', payment_status = 'paid', paid_at = <timestamp>
   ```

4. **In Frontend**
   - Application shows status as "In Review" or "Payment Received"
   - No error messages or timeouts

---

## ⚠️ Common Pitfalls (Avoid These)

| Pitfall | Fix |
|---------|-----|
| "ngrok not found" | Install ngrok from ngrok.com or package manager |
| "ITN never arrives" | Check ngrok URL is correct in PayFast dashboard |
| "Invalid signature" | Verify PAYFAST_PASSPHRASE matches exactly |
| "Can't reach PayFast" | Network may be sandboxed; document limitation |
| "Payment stuck as pending" | Check app logs for errors; use manual testing script |

See `PAYFAST_E2E_TESTING_GUIDE.md` Troubleshooting section for more.

---

## 📈 After This Issue is Done

1. **Rotate Supabase Key** (Critical Issue #3)
   - A key was exposed earlier in the project
   - Must be rotated before going live

2. **Set Up AWS Secrets Manager** (Critical Issue #2)
   - Move PayFast credentials from `.env.local` to AWS Secrets Manager
   - Required for production deployment

3. **Add Rate Limiting** (Critical Issue #5)
   - Prevent brute-force attacks on payment endpoint
   - Already tested against; just needs implementation

4. **Add Structured Logging** (High Priority)
   - Replace `console.error()` with JSON logs
   - Include request IDs for debugging

5. **Continue Through Audit Checklist**
   - 10 critical/high-priority items total
   - Roughly 3-4 weeks effort for all of them

---

## 🎓 Key Concepts (If You're New to Payment Processing)

### ITN (Instant Transaction Notification)
When a user pays, PayFast doesn't just wait for you to check. It **pushes** a callback to your app saying "payment complete" — that's the ITN. You must handle it correctly:

1. **Verify it's really from PayFast** (signature check)
2. **Confirm with PayFast's servers** (server-to-server validation)
3. **Check the amount matches** (don't trust blindly)
4. **Update your database atomically** (no race conditions)
5. **Be idempotent** (same ITN arriving twice = no duplicate charge)

### Signature Verification
PayFast and your app both know a secret passphrase. They:
1. Combine all the payment fields in a specific order
2. MD5 hash the combined string + passphrase
3. Send you the hash

You do the same and compare. If they match, PayFast definitely sent it (and no one tampered with it).

### Why This Matters
If you skip these checks, attackers could:
- Send fake ITNs claiming someone paid when they didn't
- Modify payment amounts
- Cause duplicate charges by replaying old ITNs
- Redirect funds by changing account numbers

Our implementation is **bulletproof** on the algorithm side (proven by tests). Now we just need to verify it works with the **real PayFast servers**.

---

## ✅ Checklist: Before You Start

- [ ] You have access to the easyrent24 repository
- [ ] Frontend app runs locally at `http://localhost:3000`
- [ ] You can access Supabase dashboard to view records
- [ ] You have ngrok installed (or access to staging environment)
- [ ] You have 2-3 hours uninterrupted time
- [ ] You've read this document and `CRITICAL_ISSUE_1_PAYFAST_TESTING.md`

---

## 🆘 If Something Goes Wrong

**Common issues**:

| Issue | First, Check | Then, See |
|-------|--------------|-----------|
| "ngrok not found" | Is ngrok installed? | `backend/docs/LOCAL_TESTING_NGROK.md` installation section |
| "ITN not received" | Is ngrok running? Is URL in PayFast correct? | `PAYFAST_E2E_TESTING_GUIDE.md` Troubleshooting → "ITN callback not received" |
| "Invalid signature" | Is PAYFAST_PASSPHRASE correct in env? | `PAYFAST_E2E_TESTING_GUIDE.md` Troubleshooting → "Invalid signature" |
| "Payment stuck pending" | Check app logs; try manual test script | `backend/scripts/test-payfast-itn.mjs --help` |
| "PayFast validation failed" | Network may be sandboxed | `PAYFAST_TESTING_STATUS.md` → "Server-to-Server Validation Failure" |

**All issues documented in**:
- `PAYFAST_E2E_TESTING_GUIDE.md` (Troubleshooting section)
- `PAYFAST_TESTING_STATUS.md` (Risks & Mitigations section)
- `backend/docs/LOCAL_TESTING_NGROK.md` (Common Issues section)

---

## 📞 Need Help?

All your questions are already answered in the guides:
1. **How do I test?** → `PAYFAST_E2E_TESTING_GUIDE.md`
2. **What's been tested?** → `PAYFAST_TESTING_STATUS.md`
3. **How do I set up ngrok?** → `backend/docs/LOCAL_TESTING_NGROK.md`
4. **How do I test quickly?** → `backend/scripts/test-payfast-itn.mjs --help`
5. **What's at risk?** → `PAYFAST_TESTING_STATUS.md` → Risks & Mitigations
6. **What files exist?** → `AUDIT_AND_TESTING_FILES_INDEX.md`

---

## 🎯 You're Ready to Go

Everything you need is in place:

✅ **Guides**: Complete step-by-step testing procedure  
✅ **Tools**: Automated testing script for error scenarios  
✅ **Documentation**: Current state and what's at risk  
✅ **Support**: Troubleshooting for common issues  
✅ **Context**: Big-picture understanding of what we're doing and why

**Next action**: Follow `PAYFAST_E2E_TESTING_GUIDE.md` Steps 1-7. You've got this! 🚀

---

**Questions? Start here:**
1. Read `CRITICAL_ISSUE_1_PAYFAST_TESTING.md` (executive summary)
2. Skim `PAYFAST_TESTING_STATUS.md` (current state)
3. Open `PAYFAST_E2E_TESTING_GUIDE.md` and follow it step-by-step

Good luck! 🎉
