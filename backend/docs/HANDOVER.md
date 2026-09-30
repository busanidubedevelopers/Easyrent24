# EasyRent24 — Handover & Go-Live Checklist

**Status as of this document:** Phase 1 complete (Tasks 1, 3–10; Task 2 needs
your AWS account, Task 11 QA pass not formally run as a separate step).
Phase 2 (handyman marketplace, financing, escrow) **not started**. Phase 3
in progress: Tasks 21, 25, 28 done; Tasks 22–24, 26–27, 29–31 need external
accounts (AWS, Google Maps, Twilio/Resend) this environment doesn't have
access to.

This document is the single place to look before handing this project to
someone else, or before flipping any of it to production. It does not
repeat everything in `backend/README.md` (which documents each task in
build order, with the reasoning and test evidence behind it) — read that
too. This document is the checklist and reference; the README is the story
of how it was built and why specific decisions were made.

---

## 1. What actually works today

### Buildable and tested (no missing dependencies)
- Full auth layer (cookie-based sessions, role guards) — `backend/lib/auth.ts`
- Properties CRUD + image upload — `/api/properties/*`
- Applications CRUD + document upload + PayFast-gated fee payment —
  `/api/applications/*`
- Credit-check / affordability heuristic (real SA ID validation, honestly
  labeled as NOT a real credit bureau score) — `/api/applications/[id]/assess`
- Landlord dashboard + per-property risk ranking — `/api/landlord/*`
- Invoice generation (rent, with sequential invoice numbers) — `/api/invoices/*`,
  `/api/properties/[id]/generate-invoice`
- Market price comparison against real listings (replaces a previous fake
  version that fabricated data) — `/api/properties/compare`
- A production Dockerfile, verified to actually compile and correctly
  bundle the `backend/` monorepo dependency

### Built but genuinely untestable from this environment — verify before trusting with real money/data
- **PayFast ITN flow**: the signature algorithm is proven correct via a
  manual MD5 cross-check (see `backend/lib/payfast.ts`), but the live
  round-trip with PayFast's servers (`validateWithPayfast`) has never
  actually run — `payfast.co.za` isn't reachable from this sandbox.
  **Test this against a real PayFast sandbox account before accepting real
  payments.**
- **Access control**: the app runs on plain PostgreSQL with no row-level
  security, so every API route checks the caller's access in code
  (`backend/lib/applicationAccess.ts`, `backend/lib/leaseRecords.ts`).
  `local-e2e-lease-flow.mjs` exercises those checks end to end.

### Explicitly NOT built
- Phase 2 in its entirety (handyman jobs/bidding, financing, escrow)
- Task 2 (AWS Secrets Manager / IAM) — needs your AWS account
- Task 22 (cron scheduler) — needs your AWS account
- Task 23 (email/SMS delivery) — needs a real Resend/Twilio account
- Task 24 (POI distance) — needs a real Google Maps/Mapbox API key
- Tasks 26–27, 29–31 (WAF, TLS, perf testing, actual deployment) — need
  your AWS account
- Frontend wiring: several backend endpoints exist but the corresponding
  frontend pages still show mock data and haven't been connected yet
  (`find-home`, `documents`, `MarketPriceComparison` component, the
  `apply` page's payslip upload). See `backend/README.md` for the specific
  "not yet wired up" notes under each task.

---

## 2. Environment setup

All variables live in `frontend/.env.local` — copy `frontend/.env.local.example`
and fill in real values. Full explanation of each: `backend/docs/ENVIRONMENT.md`.

| Variable | Where to get it |
|---|---|
| `DATABASE_URL` | Your Postgres connection string (`db` host inside docker-compose) |
| `JWT_SECRET` | Any long random string (32+ chars) — signs session cookies |
| `PAYFAST_MODE` | `sandbox` until you're ready to go live, then `live` |
| `PAYFAST_MERCHANT_ID` / `PAYFAST_MERCHANT_KEY` / `PAYFAST_PASSPHRASE` | PayFast merchant dashboard |
| `NEXT_PUBLIC_APP_URL` | Your real deployed URL — PayFast's servers must be able to reach `${NEXT_PUBLIC_APP_URL}/api/payments/payfast/notify` |

⚠️ **A Supabase service-role key from this project's earlier Supabase setup
is in git history** (in `test_supabase.mjs` and the root `.env`). The app no
longer uses Supabase, but **revoke that key / delete the old Supabase project**.

---

## 3. Database setup

The schema lives in `db/init/*.sql` and runs automatically when the Postgres
volume is first created (`docker compose up -d db`). Each file is idempotent,
so a newer file can be applied to an existing database:

```bash
docker exec -i easyrent-postgres psql -U easyrent -d easyrent < db/init/003_invites_extraction_leases.sql
```

1. `001_schema.sql` — users (with bcrypt password hashes), profiles, properties, applications, payments, handyman, invoices, loans, escrow, notifications, maintenance
2. `002_application_documents.sql` — `applications.documents` (uploaded file paths)
3. `003_invites_extraction_leases.sql` — tenant invites + admin fee, document extraction, leases

---

## 4. Testing before any deploy

Run both of these — they catch different classes of bugs:

```bash
cd backend && npm test          # 141 tests: business logic, validation, signatures
cd frontend && npx tsc --noEmit -p tsconfig.json   # whole-project type safety
```

Neither is sufficient alone. A real bug (a generic type constraint that
broke on plain interfaces) passed every `npm test` run and was only caught
by `tsc` — documented in `backend/README.md` under Task 9/10.

---

## 5. Deployment (AWS App Runner)

1. Build and push the image (see `Dockerfile` header comment and
   `backend/README.md` Task 28 section for exact commands) — build context
   must be the **monorepo root**, not `frontend/`.
2. Test the image locally first: `docker compose up --build`, then
   `curl http://localhost:3000/api/health`.
3. Configure App Runner to poll `/api/health` for its health check.
4. Set all `frontend/.env.local` variables as App Runner environment
   variables (or, better, wire them through AWS Secrets Manager — Task 2,
   not yet done here).
5. Point `NEXT_PUBLIC_APP_URL` at the real App Runner URL (or custom
   domain) — PayFast's ITN webhook depends on this being publicly
   reachable.

---

## 6. Go-live checklist

Don't flip real users onto this without going through this list:

- [ ] Revoke the old Supabase key still in git history (see §2)
- [ ] Run `db/init/*.sql` against the production Postgres (e.g. AWS RDS)
- [ ] Test the full PayFast flow against a **real PayFast sandbox account**
      end-to-end (pay → ITN received → application status updates) — this
      has never actually run against PayFast's real servers
- [ ] Set `PAYFAST_MODE=live` and use live (not sandbox) PayFast credentials
      only once the sandbox flow is fully verified
- [ ] Set up AWS Secrets Manager for `JWT_SECRET`, `DATABASE_URL` and PayFast
      credentials instead of plain environment variables (Task 2)
- [ ] Fix the pre-existing frontend lint errors that are currently being
      silently ignored during build (`eslint.ignoreDuringBuilds: true` in
      `next.config.ts`) — see `backend/README.md` Task 28 section
- [ ] Wire the frontend pages that still show mock data to the real
      endpoints that now exist: `find-home`, `documents`,
      `MarketPriceComparison` component, `apply` page's payslip upload
- [ ] Decide on and build Phase 2 (handyman marketplace, financing, escrow)
      before advertising those features anywhere
- [ ] Get a real `logo.png` in place — referenced throughout the frontend
      but never actually supplied
- [ ] Confirm the Formspree form ID on the coming-soon landing page is
      genuinely the client's own account, not an inherited template default
      (this was specifically checked and confirmed earlier in this project)

---

## 7. Full API reference

All routes are under `frontend/app/api/`. Every route requiring
authentication uses cookie-based sessions (`frontend/lib/serverDb.ts`)
— see `backend/lib/auth.ts` for the role-guard pattern used throughout.

| Route | Methods | Auth |
|---|---|---|
| `/api/health` | GET | none |
| `/api/auth/me` | GET | any signed-in user |
| `/api/landlord/ping` | GET | landlord/admin (example route) |
| `/api/properties` | GET, POST | GET: none; POST: landlord/admin |
| `/api/properties/[id]` | GET, PATCH, DELETE | GET: none; PATCH/DELETE: owner/admin |
| `/api/properties/[id]/images` | POST | owner/admin |
| `/api/properties/[id]/generate-invoice` | POST | owner/admin |
| `/api/properties/compare` | GET | none |
| `/api/applications` | GET, POST | any signed-in user |
| `/api/applications/[id]` | GET, PATCH | applicant or property landlord |
| `/api/applications/[id]/documents` | POST | applicant only |
| `/api/applications/[id]/pay` | POST | applicant only |
| `/api/applications/[id]/assess` | POST | property landlord/admin |
| `/api/payments/payfast/notify` | POST | **none — PayFast's webhook, verified independently** |
| `/api/invoices` | GET, POST | any signed-in user |
| `/api/invoices/[id]` | GET, PATCH, DELETE | issuer/admin (DELETE: draft only) |
| `/api/landlord/dashboard` | GET | landlord/admin |
| `/api/landlord/properties/[id]/applicants` | GET | property landlord/admin |

---

## 8. Where to go next

If continuing this project, the natural next steps in rough priority order:
1. Go through the go-live checklist above (§6)
2. Wire the frontend pages that already have working backends waiting for them
3. Phase 2 (handyman marketplace, financing, escrow) — currently zero work done
4. Remaining Phase 3 tasks that need external accounts (§1, "explicitly not built")
