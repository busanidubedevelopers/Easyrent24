# backend/

Shared backend logic, DB migrations, and tests for EasyRent24. This is
**imported into** `frontend/` at build time via the `@backend/*` path alias
— it does not run as its own server (see the architecture note below).

## Structure

```
backend/
├── lib/            Framework-agnostic backend logic, imported by frontend/app/api/**
│                   (db.ts + postgresClient.ts: the PostgreSQL data layer)
├── docs/           This kind of documentation
└── tests/          Unit tests (vitest)
```

The database schema lives in `../db/init/*.sql` (see `docs/ENVIRONMENT.md`).

## How this connects to frontend/

`frontend/tsconfig.json` has a path alias:
```json
"@backend/*": ["../backend/*"]
```
and `frontend/next.config.ts` has `experimental.externalDir: true` — both are
required for Next.js to bundle code that lives outside its own project root.
Don't remove either without knowing you're removing this wiring.

## ⚠️ Known gotcha: dependency version drift

`backend/` and `frontend/` each have their **own** `node_modules` (this is
intentional — Node can't resolve packages from a sibling folder, only from
ancestor directories). That means the same package can silently resolve to
*different versions* in each folder depending on exactly when `npm install`
last ran in each one.

**Keep shared packages on the same version in both folders** (`pg`, `zod`,
`jose`, `bcryptjs`, `pdf-lib`). A mismatch shows up as confusing TypeScript
errors about "incompatible" types that are really the same type from two
copies of a package. After bumping one side, update the other to match and
reinstall. The permanent fix is npm/pnpm workspaces (one hoisted
`node_modules`).

## What's been built (Phase 1)

> Historical build log. Phase 1 was built on Supabase; the app has since
> moved to plain PostgreSQL (`lib/db.ts`, `lib/postgresClient.ts`), JWT
> cookie sessions and local file storage, and the `migrations/` folder was
> replaced by `db/init/`. File and function names below are from that era
> (e.g. `supabaseAdmin.ts` is now `adminDb.ts`).

- ✅ Task 3: DB schema (`migrations/002_phase1_core_tables.sql`) — tested
  against a real local Postgres instance, including RLS enforcement tests
- ✅ Task 4: Auth API layer
  - `lib/auth.ts` — role-guard logic (`getAuthenticatedProfile`, `requireRole`,
    `requireAuthenticatedRole`), unit-tested with mocked Supabase clients
  - `lib/apiError.ts` — consistent error → HTTP status mapping
  - `lib/supabaseAdmin.ts` — service-role client for privileged operations
  - `frontend/lib/supabaseClient.ts` migrated to `@supabase/ssr`'s
    `createBrowserClient` (cookie-based sessions — required for any of this
    to work; the old client only stored sessions in `localStorage`, which
    the server can never see)
  - `frontend/lib/supabaseServer.ts` — request-scoped server client
  - `frontend/middleware.ts` — refreshes session cookies on every request
  - Example routes proving it all works end-to-end:
    `frontend/app/api/auth/me` (any signed-in user),
    `frontend/app/api/landlord/ping` (role-gated to landlord/admin)
- ✅ Task 5: Properties API
  - `migrations/003_properties_policies.sql` — fixed two real gaps found in
    the original schema: `properties` had **no UPDATE or DELETE policy at
    all**, and the SELECT policy exposed draft/archived listings publicly.
    Also adds the `property-images` storage bucket + folder-scoped RLS.
    All of this was tested against real Postgres, including confirming RLS
    is actually enforced (not just present) for cross-user update/delete/
    upload attempts.
  - `lib/properties.ts` — status-transition rules (e.g. `draft` can't jump
    straight to `rented`) and input validation, framework-agnostic and
    unit-tested (19 test cases)
  - `frontend/app/api/properties/route.ts` — GET (public list w/ filters,
    pagination), POST (create, landlord/admin only)
  - `frontend/app/api/properties/[id]/route.ts` — GET, PATCH (with status
    transition validation), DELETE — owner/admin only, enforced both in the
    route and redundantly via RLS
  - `frontend/app/api/properties/[id]/images/route.ts` — image upload with
    server-side size/type validation before anything touches storage
  - Fixed a real bug in `list-property/page.tsx`: it was inserting an
    `email` column into `profiles` that doesn't exist in the schema — would
    have thrown a Postgres error on any real (non-demo-mode) submission
- ✅ Task 6: Applications API
  - `migrations/004_applications_policies.sql` — fixed the same class of gap
    as properties: `applications` had **no UPDATE policy**, so a landlord
    could view applicants but never actually approve/decline them, and an
    applicant could never cancel their own application. Also added a
    `documents` jsonb column (payslip/ID/bank statement) and a **private**
    `application-documents` storage bucket — tested to confirm only the
    applicant and the relevant property's landlord can read documents,
    nobody else, and cross-user upload attempts are blocked
  - `lib/applications.ts` — status-transition rules (applicants can only
    ever move to 'cancelled', and only from 'pending') and consent
    validation, unit-tested (13 test cases)
  - `frontend/app/api/applications/route.ts` — GET (list, RLS-scoped
    automatically to "yours or your property's"), POST (submit, requires
    all 3 consents)
  - `frontend/app/api/applications/[id]/route.ts` — GET, PATCH (landlord
    decisions vs. applicant self-cancel are both handled by the same
    endpoint, gated by who's actually calling)
  - `frontend/app/api/applications/[id]/documents/route.ts` — upload with
    size/type validation; documents are stored by storage **path**, not
    public URL, since the bucket is private and reading them back requires
    a signed URL generated on demand
  - Found (not yet wired up): `apply/page.tsx` has a payslip file *input* in
    its UI, but the selected file was never actually sent anywhere — the
    upload endpoint now exists, but connecting that page to it is frontend
    work, not part of this backend task
- ✅ Task 7: PayFast integration
  - `migrations/005_payment_fields.sql` — adds payment tracking fields to
    `applications` and a `payments` audit table with a **unique constraint
    on `m_payment_id`**, which is what makes ITN handling idempotent (tested:
    a duplicate insert with the same reference is correctly rejected by
    Postgres, and the correct re-processing path — an UPDATE instead — was
    also verified). No regular user can INSERT or UPDATE this table at all,
    even for their own application — verified with an actual blocked insert
    attempt — since only backend code using the service-role key should
    ever mark a payment as paid.
  - `lib/payfast.ts` — signature generation/verification using PayFast's
    exact algorithm. This required implementing PHP's `urlencode()` byte-
    for-byte in JS (PHP encodes spaces as `+` and percent-encodes
    `! ' ( ) *`, which JS's `encodeURIComponent` does not) — **29 unit
    tests**, including a manually-computed MD5 cross-check independent of
    the implementation itself, tamper-detection tests, and cent-precision
    amount comparison (avoiding float-equality bugs).
  - `frontend/app/api/applications/[id]/pay/route.ts` — initiates payment,
    creates the pending payment record via the admin client (applicants
    have no direct write access to `payments`), returns signed PayFast
    redirect fields
  - `frontend/app/api/payments/payfast/notify/route.ts` — the ITN webhook.
    This is the **one route in the whole project that intentionally accepts
    unauthenticated requests** (PayFast calls it directly, with no user
    session) — it instead independently proves authenticity via three
    checks: signature verification, PayFast's server-to-server validation
    callback, and per-payment amount matching. All three must pass before
    any application status changes.
  - **Honest limitation:** the server-to-server validation call
    (`validateWithPayfast`) and the full ITN round-trip cannot be tested
    from this sandbox — `payfast.co.za` isn't reachable here. The signature
    algorithm itself is proven correct independent of network access (the
    manual MD5 cross-check), but the live end-to-end flow needs to be
    tested against a real PayFast sandbox merchant account once deployed
    somewhere with real network access. Do this before accepting real money.
- ✅ Task 8: Credit-check & affordability analysis service
  - **Honest scope note (see top of `lib/creditCheck.ts`):** there is no
    real credit bureau (TransUnion/Experian/Compuscan) or Open Banking
    integration here — that needs a commercial contract this project
    doesn't have. What's real: SA ID number validation (checksum + DOB/
    gender/citizenship extraction) is a genuine, deterministic public
    algorithm, not a stub. What's a stub: bank statement analysis, and the
    "risk score" is an affordability-based heuristic, not an actual credit
    score — every result includes `isHeuristic: true` so nothing downstream
    can mistake it for a real bureau pull.
  - `lib/creditCheck.ts` — `validateSAIdNumber` (Luhn-based checksum,
    date-of-birth/gender/citizenship extraction), `calculateAffordability`
    (the standard SA guideline: rent ≤ ⅓ of income), `computeRiskAssessment`
    — **25 unit tests**, including two ID numbers with checksums computed
    by hand independently of the code (one male citizen, one female
    permanent resident), confirming the algorithm is genuinely correct and
    not just self-consistent with its own logic
  - `frontend/app/api/applications/[id]/assess/route.ts` — landlord/admin
    only; validates ID, calculates affordability against the specific
    property's rent, writes `risk_score`/`risk_level` back onto the
    application; re-checks all three consents even though Task 6 already
    required them at submission, in case anything changed since

- ✅ Task 9: Landlord dashboard API (risk report aggregation)
  - `lib/landlordDashboard.ts` — `rankApplicantsByRisk` (best-first or
    attention-first ordering, with unassessed applicants always placed last
    rather than ranked as neutral), `countByField` / `buildDashboardSummary`
    for the property/application status overview — **18 unit tests**
  - Caught a real TypeScript error while wiring this up: `countByField`'s
    generic constraint (`T extends Record<string, unknown>`) rejected plain
    interfaces like `PropertyLite`/`ApplicationLite` at compile time, even
    though the logic itself was correct — this only showed up under `tsc`,
    not under the `tsx` test runs, since `tsx` transpiles without type-
    checking. A reminder that passing runtime tests isn't the same as
    passing a real build.
  - `frontend/app/api/landlord/dashboard/route.ts` — property/application
    counts by status, risk breakdown, and a "needs attention" queue
  - `frontend/app/api/landlord/properties/[id]/applicants/route.ts` — the
    actual risk report: every applicant for one property, ranked by their
    Task 8 assessment (`?order=best_first` or `?order=attention_first`)

- ✅ Task 10: Unit test suite
  - Every ad-hoc test I ran while building Tasks 3–9 (previously written as
    throwaway scripts in `/tmp`, run once via `tsx`, then deleted) has been
    ported into a permanent suite at `backend/tests/`, using `vitest`.
  - **97 tests, all passing**, across 6 files: `auth`, `properties`,
    `applications`, `payfast`, `creditCheck`, `landlordDashboard`.
  - Run them with `npm test` from inside `backend/` (or `npm run test:watch`
    while developing).
  - Note: the ad-hoc `tsx` runs during Tasks 3–9 didn't type-check anything
    (esbuild transpiles without verifying types) — that's exactly how the
    Task 9 generic-constraint bug slipped past testing and was only caught
    by `tsc`. `vitest` has the same limitation by default. **Both** `npm
    test` (backend logic) **and** `npx tsc --noEmit` from `frontend/`
    (whole-project type safety) should be run before considering any change
    done — they catch different classes of bugs.
  - What ISN'T covered by this suite: the actual database (RLS policies,
    migrations) and the Next.js route handlers themselves. Those were
    verified separately — RLS against a real local Postgres instance during
    Tasks 3–7 (not repeatable via `npm test`, since it needs a live
    Postgres), and routes via `tsc` + manual review, since properly mocking
    Next's `NextRequest`/cookies plus a live Supabase connection is
    integration-test territory, not unit-test territory. A real CI
    pipeline should eventually run migrations against a throwaway Postgres
    container automatically — worth doing before this goes to production,
    not before Phase 1 ships.
## Phase 3

- ✅ Task 21: Invoice generation API
  - `migrations/006_invoice_numbering.sql` — the `invoices` table already
    had SELECT/INSERT/UPDATE policies from Phase 1 (migration 002); this
    adds two things that were missing:
    1. **Sequential, human-readable invoice numbers** (`INV-2026-01000`,
       `INV-2026-01001`, ...) via a Postgres sequence + trigger — needed
       for real accounting/tax purposes, not just the internal UUID.
       Tested against real Postgres: confirmed auto-generation on insert
       and correct incrementing across multiple invoices.
    2. **A DELETE policy — deliberately scoped to `draft` invoices only.**
       Once an invoice is sent, deleting it would destroy an audit trail;
       cancelling is the correct action for anything already sent, not
       deletion. Tested: a sent invoice survives a delete attempt by its
       own issuer (blocked), a draft invoice can be deleted by its issuer
       (allowed), and the recipient (tenant) can never delete anything.
  - `lib/invoices.ts` — status transitions (`draft → sent → paid`, with
    `overdue` reachable from `sent`; `paid`/`cancelled` both terminal —
    no un-paying an invoice through this API, that's a refund/credit-note
    process, not a status flip), line item validation, total calculation
    (rounded to avoid float artifacts), and `buildRentInvoiceLineItems` —
    **24 unit tests**
  - `frontend/app/api/invoices/route.ts` + `[id]/route.ts` — standard CRUD,
    with line items only editable while still `draft` (changing the amount
    behind a tenant's back after sending is exactly the kind of silent
    change a billing system must never allow)
  - `frontend/app/api/properties/[id]/generate-invoice/route.ts` — the
    actual "dynamic invoice generation" this task is named for: given a
    property, auto-generates a draft invoice with a locked "Monthly Rent"
    line pre-filled from the property's price, matching the exact
    `{ description, amount, locked }` shape `frontend/app/documents/page.tsx`
    already expects in its UI (currently 100% mock data) — wiring that page
    to this endpoint should be a drop-in replacement, not a redesign

- ✅ Task 25: Market price comparison backend
  - **Honest scope note:** the existing frontend component
    (`components/MarketPriceComparison.tsx`) is entirely fabricated — it
    generates fake "Property24/Gumtree/Private Property" comparables by
    randomly perturbing the user's OWN input price (±5-20%), meaning its
    numbers are mathematically derived from the very price it claims to be
    validating. It will essentially always report "you're roughly at
    market," regardless of reality. Shipping that as-is would be a
    misleading claim about scraping sites this project never actually
    touches.
  - This task replaces that with real comparisons against **our own
    published listings** — genuine data, though narrower in reach than an
    actual Property24/Gumtree partnership would be (that needs a real data
    deal or scraping infrastructure this project doesn't have).
  - `lib/marketComparison.ts` — `extractLocality` (a simple address-based
    heuristic, since there's no lat/long or geocoding yet — that's Task 24,
    not built), `computeSimilarityScore` (type + bedrooms + locality,
    **deliberately excludes price** from the similarity calculation, since
    weighting comparables by price closeness would be circular and make
    every result look artificially "fair"), `rankComparables`,
    `computeMarketStats` — **20 unit tests**, including confirming price
    truly has zero influence on similarity scoring
  - Returns `null` stats (not a fabricated average) when there are zero
    genuine comparables, rather than pretending there's enough data when
    there isn't
  - `frontend/app/api/properties/compare/route.ts` — public (only ever
    reads already-published, already-public listings); only counts
    `status = 'published'` properties as real market data, since draft/
    archived listings aren't actually on the market
  - **Not yet done:** wiring `MarketPriceComparison.tsx` to call this real
    endpoint instead of its fake data generator, and removing the
    "Source: Property24/Gumtree" labels from the UI (still there from the
    fake version) — that's frontend work, separate from this backend task

- ✅ Task 28: Dockerfile (containerize the app)
  - **Real finding worth knowing:** I couldn't just write a Dockerfile and
    assume it'd work — there was a genuine open question of whether Next.js's
    production build would correctly handle `backend/` living *outside* its
    project root (via the `externalDir` config from Phase 1). I don't have
    Docker in this sandbox, but I could still run the actual `next build`
    and inspect its output directly. Two things confirmed:
    1. **The build compiles cleanly** across the `@backend/*` boundary —
       confirmed by running a real production build (`next build`), not
       just `tsc`.
    2. **`backend/` is a BUILD-TIME dependency only, not a runtime one.**
       Webpack inlines the compiled `backend/lib` code directly into each
       API route's own output chunk — verified by grepping the compiled
       `.next/server/` output for literal strings from `backend/lib/
       payfast.ts` (e.g. `sandbox.payfast.co.za`) and finding them present
       inside the route bundles. This means the final runtime container
       image doesn't need to include `backend/` at all — only the build
       stage does. The Dockerfile is structured around this: a 3-stage
       build where the last (runtime) stage only copies frontend's
       `.next/standalone` output.
  - Also hit and fixed along the way: `next build` runs ESLint by default
    and failed on pre-existing lint errors in unrelated pages (unused
    imports, unescaped quotes — none of it related to backend work). Set
    `eslint.ignoreDuringBuilds: true` in `next.config.ts` so a production
    build isn't blocked by lint issues — linting should be a separate CI
    step, not a deploy gate. **These lint errors are real and still exist
    in the frontend** — this just stops them from blocking the container
    build; they're still worth fixing separately.
  - Switched both `npm install` calls in the Dockerfile to `npm ci` once I
    confirmed (by actually running it) that both `frontend/package-lock.json`
    and `backend/package-lock.json` are in a valid, installable state —
    `npm ci` is deterministic and faster, the correct choice for a
    production image when a lockfile exists.
  - `Dockerfile` (at the **monorepo root**, not inside `frontend/` — the
    build context must include both `frontend/` and `backend/` since the
    build stage needs both). Build with:
    ```
    docker build -f Dockerfile -t easyrent24 --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
    ```
  - `.dockerignore` — excludes `.env*` files explicitly (secrets must come
    from the runtime environment / AWS Secrets Manager, never be baked into
    an image layer), `node_modules`, build output, and test files
  - `docker-compose.yml` — for local testing of the actual production image
    before pushing it anywhere; not what App Runner uses in production
  - Runs as a **non-root user** inside the container (a root-running
    container is an unnecessary privilege-escalation risk if ever
    compromised), and includes a `HEALTHCHECK` polling
    `/api/health` (built in Phase 1, Task 4) — this is also what AWS App
    Runner itself should be configured to poll.
  - **Honest limitation:** I cannot run `docker build` or push to ECR from
    this sandbox (no Docker daemon, and `amazonaws.com` isn't in the
    network allowlist here). Once you have Docker and AWS CLI configured:
    ```
    aws ecr get-login-password --region <region> | docker login --username AWS --password-stdin <account-id>.dkr.ecr.<region>.amazonaws.com
    docker build -f Dockerfile -t easyrent24 --build-arg NEXT_PUBLIC_SUPABASE_URL=... --build-arg NEXT_PUBLIC_SUPABASE_ANON_KEY=... .
    docker tag easyrent24:latest <account-id>.dkr.ecr.<region>.amazonaws.com/easyrent24:latest
    docker push <account-id>.dkr.ecr.<region>.amazonaws.com/easyrent24:latest
    ```
    Test the image locally first with `docker compose up --build` and hit
    `http://localhost:3000/api/health` before pushing anywhere.

- ✅ Task 32: Handover documentation
  - `backend/docs/HANDOVER.md` — the single go-live checklist and handover
    reference. Built from an actual scan of the codebase (route list,
    migration list, every `process.env.*` reference), not from memory —
    verified the API reference table's row count matches the real route
    count exactly (18 routes, 18 rows) before shipping it, the same
    discipline as every other task.
  - Covers: what's genuinely tested vs. what's built-but-unverifiable from
    this sandbox (PayFast live flow, RLS against real Supabase) vs. what's
    explicitly not built at all; full environment setup; migration order;
    deployment steps; a concrete go-live checklist; and a complete API
    reference with auth requirements per route.
