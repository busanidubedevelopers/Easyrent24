# 🏢 EasyRent24 — Complete Master Demo Walkthrough Script

Use this comprehensive script to guide your client through the full EasyRent24 platform from end to end.

---

## ⚡ Master Quick Links Reference

| Step | Feature | URL | Description |
| :--- | :--- | :--- | :--- |
| **1** | **Marketplace & Home** | http://localhost:3000 | Public listing & search homepage |
| **2** | **Property Search & Filter** | http://localhost:3000/find-home | Interactive map, filters, and cards |
| **3** | **Role-Based Registration** | http://localhost:3000/signup | Tenant, Landlord, & Agent onboarding |
| **4** | **Secure Sign In** | http://localhost:3000/signin | Supabase session login |
| **5** | **Tenant Application** | http://localhost:3000/apply | Multi-step POPIA screening form |
| **6** | **PayFast Payment Demo** | http://localhost:3000/checkout | Sandbox payment gateway checkout |
| **7** | **Payment Confirmation** | http://localhost:3000/apply/payment-success | Success redirect confirmation card |
| **8** | **Due Diligence & Audit** | http://localhost:3000/applications | Credit score, bank audit, and regret letter |
| **9** | **Digital Lease Agreement** | http://localhost:3000/applications/lease | Auto-generated residential lease |
| **10** | **Rent Collections & Invoices**| http://localhost:3000/collections | Rent ledger, invoice status, & payout tracker |
| **11** | **Document Vault** | http://localhost:3000/documents | Stored leases, FICA, & tenant IDs |
| **12** | **Deposit Financing** | http://localhost:3000/financing | Rental deposit assistance & advance options |
| **13** | **Ratings & Reviews** | http://localhost:3000/reviews | Verified tenant & landlord reputation scores |
| **14** | **Log Maintenance Request** | http://localhost:3000/handyman/request | Tenant repair ticket logging |
| **15** | **Handyman Dispatch Board** | http://localhost:3000/handyman | Contractor job pipeline |
| **16** | **Landlord Dashboard** | http://localhost:3000/dashboard | Portfolio occupancy & rent roll hub |
| **17** | **List New Property** | http://localhost:3000/list-property | Add and publish rental listings |
| **18** | **Backend Supabase Studio** | http://127.0.0.1:25433 | Live Docker DB & Auth inspection |

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
  - Create a test account (e.g. `landlord@easyrent.com`, password: `Password123!`).
- **Script**:
  > *"The platform supports distinct permission profiles for Tenants, Landlords, and Agency Brokers. Security is handled via Supabase with encrypted passwords and server-side HTTP session cookies."*

---

### Stage 3: Digital Tenant Screening & Application
- **Action**: Open `http://localhost:3000/apply`.
- **Demo Highlights**:
  - Step 1: Personal info & SA ID number.
  - Step 2: Employment, employer verification, and salary details.
  - Step 3: POPIA-compliant consent checkboxes for credit and identity checks.
- **Script**:
  > *"Instead of paper forms and unencrypted email attachments, tenants submit structured digital screening data compliant with South African POPIA regulations."*

---

### Stage 4: Bank-Grade PayFast Checkout
- **Action**: Open `http://localhost:3000/checkout`.
- **Action**: Click **"Pay with PayFast (R 250.00)"**.
- **Demo Highlights**:
  - Show the redirect to **`sandbox.payfast.co.za`**.
  - Point out payment options: **Credit/Debit Card**, **Instant EFT**, **SnapScan**, and **Zapper**.
  - Click **Pay** (no real card charged) → PayFast redirects cleanly back to `http://localhost:3000/apply/payment-success`.
- **Script**:
  > *"We integrate South Africa's premier gateway, PayFast. Transactions use signed MD5 tokens, keeping payment credentials completely off our servers for strict PCI-DSS compliance."*

---

### Stage 5: Due Diligence, Risk Audit & Lease Generation
- **Action**: Open `http://localhost:3000/applications`.
- **Demo Highlights**:
  - **Credit Bureau Scorecard**: Risk score gauge, defaults, and judgments.
  - **Bank Statement Analysis**: Declared income vs. verified bank deposits.
  - **Affordability Ratio**: Rent-to-income calculation (e.g. 28%).
  - **Decision Buttons**:
    - Click **"Approve & Generate Lease"** to preview the digital lease at `/applications/lease`.
    - Click **"Reject"** to show the automated **Regret Letter Generator**.
- **Script**:
  > *"Property managers have a centralized due diligence console. In seconds, they evaluate creditworthiness, verify proof of income, approve leases, or generate polite, legally compliant regret letters."*

---

### Stage 6: Rent Collections, Invoicing & Document Vault
- **Action**: Open `http://localhost:3000/collections` and `http://localhost:3000/documents`.
- **Demo Highlights**:
  - **Collections**: Monthly rent ledger, automated invoice status (Paid, Pending, Overdue), and collection tracking.
  - **Documents Vault**: Centralized storage for signed leases, FICA copies, and ID records.
- **Script**:
  > *"Ongoing rent management is fully automated. Invoices and payment statuses are tracked in real time, and all sensitive compliance documentation is archived in an encrypted document vault."*

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
- **Action**: Open `http://localhost:3000/handyman/request` (Tenant logs an issue with priority: Plumbing, Electrical, Urgent).
- **Action**: Open `http://localhost:3000/handyman` (Contractor board tracking: Reported → In Progress → Completed).
- **Script**:
  > *"Post-move-in property care is fully automated. Tenants report issues with photos and urgency levels, and property managers dispatch vetted handymen with live tracking."*

---

### Stage 9: Landlord Operations & Portfolio Hub
- **Action**: Open `http://localhost:3000/dashboard`.
- **Demo Highlights**:
  - Real-time occupancy counters, rent roll metrics, and active maintenance alerts.
  - Click **"Add Property"** to show the listing creation form at `/list-property`.
- **Script**:
  > *"Landlords and agents enjoy complete operational clarity — overseeing occupancy, tracking rental yield, reviewing tenant applications, and managing maintenance in one unified dashboard."*

---

## 💡 Executive Closing Pitch
> *"EasyRent24 digitizes the entire residential leasing lifecycle: from discovery and tenant screening, through PayFast fee collection, risk due diligence, digital leasing, rent collection, and automated maintenance management."*
