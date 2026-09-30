# 🏢 EasyRent24 — Complete Master Demo Walkthrough Script

Use this comprehensive script to guide your client through the full EasyRent24 platform from end to end.

---

## 🚦 Pre-Flight (do this before the client joins)

```bash
docker compose up -d          # from the repo root
docker compose ps             # both easyrent-app and easyrent-postgres should be "healthy"
```

Then open **http://localhost:3000** and confirm the marketplace shows **three**
listings. If the app container is still "health: starting", give it ~15 seconds.

- **No scenario data is pre-loaded.** Only the base login accounts and the 3
  published listings exist. Every application, invoice, and maintenance ticket
  in the demo is created live, in front of the client — nothing to reset
  between runs unless you created test data of your own.
- To wipe anything you create back to this clean state:
  `docker compose down -v && docker compose up -d --build`
  (the `-v` drops the database volume, which re-seeds only the base accounts
  and listings from `db/init/001_schema.sql`).
- **Have a valid-format SA ID number ready to type in Stage 3**: `9001015000085`.
  ID validation is real (checksum + date-of-birth extraction, not a stub), so
  a made-up number will show as unverified in the risk assessment. This one is
  a known-valid test ID (male, DOB 1990-01-01) — use it for a clean "Verified"
  result on camera.

**Known limitation — PayFast ITN:** the payment *redirect* and return-to-success
flow work fully against the PayFast sandbox. The background `notify_url` webhook
does not fire locally, because PayFast's servers cannot reach `localhost`. This
is invisible during the demo; only mention it if the client asks how settlement
is confirmed. See `backend/docs/LOCAL_TESTING_NGROK.md` to demo the webhook too.

---

## 🔑 Demo Logins

All seeded accounts use the password **`Password123!`**

| Account | Role | Unlocks |
| :--- | :--- | :--- |
| `landlord@demo.com` | Landlord | Dashboard (incl. assigning handymen to tickets), applications, collections, documents, financing, list-property |
| `tenant@demo.com` | Tenant | Apply, checkout, reviews, reporting a maintenance issue |
| `handyman@demo.com` | Handyman | Handyman board, tickets assigned to them, "Post a Job" bidding board |
| `agent@demo.com` | Landlord (agency) | Same as landlord |

> ⚠️ **Routes are role-gated.** Opening a landlord page while signed in as a tenant
> silently redirects to `/signin`. Sign in as the role listed below *before*
> opening each link, or the demo will look broken.

---

## ⚡ Master Quick Links Reference

| Step | Feature | URL | Sign in as |
| :--- | :--- | :--- | :--- |
| **1** | **Marketplace & Home** | http://localhost:3000 | — (public) |
| **2** | **Property Search & Filter** | http://localhost:3000/find-home | — (public) |
| **3** | **Role-Based Registration** | http://localhost:3000/signup | — (public) |
| **4** | **Secure Sign In** | http://localhost:3000/signin | — (public) |
| **5** | **Tenant Application** | http://localhost:3000/apply | tenant |
| **6** | **PayFast Payment Demo** | http://localhost:3000/checkout | tenant |
| **7** | **Payment Confirmation** | http://localhost:3000/apply/payment-success | tenant |
| **8** | **Due Diligence & Audit** | http://localhost:3000/applications | landlord |
| **9** | **Digital Lease Agreement** | reached by clicking **Approve & Generate Lease** in step 8 | landlord |
| **10** | **Rent Collections & Invoices**| http://localhost:3000/collections | landlord |
| **11** | **Document Vault** | http://localhost:3000/documents | landlord |
| **12** | **Deposit Financing** | http://localhost:3000/financing | landlord |
| **13** | **Ratings & Reviews** | http://localhost:3000/reviews | any signed-in user |
| **14** | **Tenant Reports an Issue** | http://localhost:3000/maintenance | tenant |
| **15** | **Landlord Assigns a Handyman** | http://localhost:3000/dashboard (Active Maintenance Tickets panel) | landlord |
| **16** | **Handyman Fixes It** | http://localhost:3000/handyman ("I'm a Pro" tab → Assigned to You) | **handyman** |
| **17** | **Open Job Bidding Board** *(separate feature)* | http://localhost:3000/handyman | any signed-in user |
| **18** | **Landlord Dashboard** | http://localhost:3000/dashboard | landlord |
| **19** | **List New Property** | http://localhost:3000/list-property | landlord |

> **Note on step 9:** the lease has no standalone URL — it is generated per
> application, so it lives at `/applications/lease/<application-id>`. Reach it by
> approving an applicant in step 8 rather than typing a URL.
>
> **Note on steps 14–17 — two separate maintenance systems, don't mix them up:**
> - **Direct assignment** (steps 14–16): tenant logs a ticket at `/maintenance` →
>   it lands in the landlord's "Active Maintenance Tickets" panel on `/dashboard`
>   → landlord picks a handyman from a dropdown and clicks **Assign** → it
>   appears under **"Assigned to You"** on the handyman's `/handyman` page
>   ("I'm a Pro" tab) → handyman clicks **Mark Resolved**. This is the flow to
>   show the client.
> - **Open bidding board** (step 17, `/handyman` → "Post a Job" / "I need a
>   Service"): a separate marketplace where anyone posts a job and handymen bid
>   on it — unrelated to a specific tenant's lease. Empty until someone posts a
>   job live (via **Post a New Job** on that page). Mention it as a secondary
>   feature only if there's time; don't present it as how tenant repair
>   requests get handled, since it isn't.

---

## 🎬 Step-by-Step Presentation Script

### Stage 1: Marketplace & Discovery
- **Action**: Open `http://localhost:3000` and navigate to `http://localhost:3000/find-home`.
- **Script**: 
  > *"EasyRent24 provides an intuitive rental marketplace tailored to the South African market. Prospective tenants browse verified listings with transparent pricing, location maps, and property amenities."*

---

### Stage 2: Role-Based Onboarding & Authentication
- **Action**: Open `http://localhost:3000/signup`.
- **Demo Highlights**:
  - Show the role selector: **Tenant**, **Landlord**, or **Agent**.
  - Click **"Agent"** to demonstrate the dynamic **"Agency / Company Name"** field (e.g., *Prestige Realty*).
  - Create a test account live (use a fresh address, e.g. `demo+live@easyrent.com`, password: `Password123!`).
  - *Or* skip creating one and sign in with the seeded `landlord@demo.com` / `Password123!`.
- **Script**:
  > *"The platform supports distinct permission profiles for Tenants, Landlords, and Agency Brokers. Security is handled via Supabase with encrypted passwords and server-side HTTP session cookies."*

---

### Stage 3: Digital Tenant Screening & Application
- **Action**: Open `http://localhost:3000/apply` (sign in as `tenant@demo.com` first).
- **Demo Highlights**:
  - Step 1: Personal info & SA ID number — **use `9001015000085`** (a
    known-valid test ID) so Stage 5's assessment shows a clean "Verified" result.
  - Step 2: Employment, employer verification, and salary details — the income
    you enter here drives the real affordability calculation in Stage 5, so
    enter something that makes the story you want to tell (a comfortable
    income for an approval, a tight one for a decline).
  - Step 1 and Step 3 each have a file upload (ID document, payslip) — these
    are real uploads now: pick any small PDF or image, it's written to disk
    and tied to the application. In Stage 5, the landlord can click **View
    Payslip** / **View ID Document** to open exactly what was just uploaded.
  - Step 3: POPIA-compliant consent checkboxes for credit and identity checks
    — all three must be checked to submit; they also gate the Stage 5
    assessment, so don't skip one.
- **Script**:
  > *"Instead of paper forms and unencrypted email attachments, tenants submit structured digital screening data compliant with South African POPIA regulations."*

---

### Stage 4: Bank-Grade PayFast Checkout
- **Action**: Open `http://localhost:3000/checkout`.
- **Action**: Click **"Pay with PayFast (R 100.00)"**.
- **Demo Highlights**:
  - Show the redirect to **`sandbox.payfast.co.za`**.
  - Point out payment options: **Credit/Debit Card**, **Instant EFT**, **SnapScan**, and **Zapper**.
  - Click **Pay** (no real card charged) → PayFast redirects cleanly back to `http://localhost:3000/apply/payment-success`.
- **Script**:
  > *"We integrate South Africa's premier gateway, PayFast. Transactions use signed MD5 tokens, keeping payment credentials completely off our servers for strict PCI-DSS compliance."*

---

### Stage 5: Due Diligence, Risk Audit & Lease Generation
- **Sign in as `landlord@demo.com`**, then open `http://localhost:3000/applications`.
- **The application from Stage 3 is here.** The moment the page loads, it
  silently runs a real risk assessment on any application that doesn't have
  one yet — South African ID checksum validation and a rent-to-income
  affordability calculation against the actual numbers the tenant just
  entered (not a canned figure). Give it a second to appear before opening it.
- **Demo Highlights**:
  - **Credit Bureau Scorecard**: risk score and Low/Medium/High band, computed
    live from the applicant's real ID validity + affordability.
  - **Affordability Ratio**: real rent-to-income % for the property they
    applied to — the standard SA guideline is rent ≤ ⅓ of income.
  - **Decision Buttons**:
    - Click **"Approve & Generate Lease"** — confirms the approval and takes
      you straight into the lease workflow for that applicant.
    - Or click **"Decline"** to show the automated **Regret Letter Generator**.
  - **To show both paths in one sitting**: submit a second application in a
    separate tab as `tenant@demo.com` (or a fresh signup) with a low income
    against an expensive property — it'll land here as a High-risk case ready
    to decline, alongside the first as a clean approval.
- **Note — real credit bureau, not a stub**: the risk score is an honest
  heuristic (ID validity + affordability), not a live TransUnion/Experian
  pull — say so if asked directly, but the script below is accurate as
  positioning language for what the platform *does* compute today.
- **Script**:
  > *"Property managers have a centralized due diligence console. In seconds, they evaluate creditworthiness, verify proof of income, approve leases, or generate polite, legally compliant regret letters."*

---

### Stage 6: Invoicing & the Arrears Escalation Console
- **Action**: Open `http://localhost:3000/documents` → **Invoicing & Billing** tab.
- **Create a live invoice**: paste the demo tenant's user ID —
  `22222222-2222-4222-a222-222222222222` — into **Tenant User ID (UUID)**, set
  a line item (e.g. "Monthly rent", R18 500), and click **Create Invoice**.
  The confirmation toast means it was actually written to the database via
  `/api/invoices` — there's no list view on this page afterward, so if the
  client wants to see it land, pull it up via `GET /api/invoices` or the DB.
- **Action**: Open `http://localhost:3000/collections`.
- **Demo Highlights**:
  - **Documents Vault** (`/documents`, other tabs): centralized storage for
    signed leases, FICA copies, and ID records.
  - **Collections console** (`/collections`): this is deliberately empty of
    sample data (the code itself says so — a past decision made specifically
    to avoid showing fake arrears in a client walkthrough). Present it as the
    **structure** of the rent-arrears escalation workflow — Communication →
    Demand Letter → Agent Handoff → Cancellation → Eviction — rather than a
    populated case list, since no lease in this demo has aged into arrears.
- **Script**:
  > *"Ongoing rent management is fully automated. Invoices are generated and tracked in real time, and if a tenant falls behind, the platform walks the landlord through a structured, legally-compliant escalation path — before it ever needs to go to court."*

---

### Stage 7: Value-Added Services (Financing & Reviews)
- **Action**: Open `http://localhost:3000/financing` and `http://localhost:3000/reviews`.
- **Demo Highlights**:
  - **Deposit Financing**: Rental deposit advance options to help tenants move in faster.
  - **Reviews & Reputation**: Two-way verified ratings for tenants and landlords.
- **Script**:
  > *"To build long-term platform value, we offer deposit financing products and a community trust engine with verified tenant and landlord ratings."*

---

### Stage 8: Maintenance & Contractor Dispatch
Walk the ticket through all three roles in one pass — this is the story to tell:
tenant reports → landlord triages and assigns → handyman closes it out.

- **Sign in as `tenant@demo.com`**, open `http://localhost:3000/maintenance`, and
  log an issue (priority: Plumbing / Electrical / Emergency). It's confirmed
  instantly and shows up in the tenant's own request list.
- **Sign in as `landlord@demo.com`**, open `http://localhost:3000/dashboard`,
  and scroll to **Active Maintenance Tickets**. The ticket just submitted is
  there — pick **Demo Handyman** from the dropdown and click **Assign**.
- **Sign in as `handyman@demo.com`**, open `http://localhost:3000/handyman`
  (lands on the "I'm a Pro" tab), and show the ticket under **Assigned to
  You**. Click **Mark Resolved** to close the loop.
- **Optional — the other maintenance system**: still on `/handyman`, scroll to
  the open job board (three seeded jobs). This is a *separate* feature — an
  open marketplace where any landlord or tenant posts a job and handymen bid
  on it, independent of a specific tenant's ticket. Worth a mention, but don't
  conflate it with the assignment flow above.
- **Script**:
  > *"Post-move-in property care is fully automated. A tenant logs an issue and it's routed straight to their landlord, who assigns a vetted handyman with one click — no phone calls, no spreadsheets. The handyman sees exactly what's assigned to them and marks it resolved the moment the job is done."*

---

### Stage 9: Landlord Operations & Portfolio Hub
- **Action**: Open `http://localhost:3000/dashboard`.
- **Demo Highlights**:
  - Real-time occupancy counters, rent roll metrics, and active maintenance alerts.
  - Click **"Add Property"** to show the listing creation form at `/list-property`.
  - Upload a real photo on the listing form — it's genuinely stored and served
    back (no more generic stock-photo placeholder), so the exact image
    uploaded is what appears on the listing card afterward.
- **Script**:
  > *"Landlords and agents enjoy complete operational clarity — overseeing occupancy, tracking rental yield, reviewing tenant applications, and managing maintenance in one unified dashboard."*

---

## 💡 Executive Closing Pitch
> *"EasyRent24 digitizes the entire residential leasing lifecycle: from discovery and tenant screening, through PayFast fee collection, risk due diligence, digital leasing, rent collection, and automated maintenance management."*
