# Project Tasks: EasyRent

## 🚀 Active Focus
- [x] **Market Price Comparison Engine** (`components/MarketPriceComparison.tsx`)
    - [x] Create UI for comparing implementation.
    - [x] Implement basic mock algorithm for price suggestions.
    - [x] Refine "similarity" algorithm to be more weighted on attributes (size, location).
    - [x] Add persistence (save comparison results).

## 🏠 Core Features

### Property Listings (`app/list-property/`)
- [x] Basic Listing Form UI (`list-property/page.tsx`).
- [ ] **State Management:** Implement a global store (Context/Redux/Zustand) to hold listing drafts.
- [ ] **Image Upload:** Add drag-and-drop zone for property images.
- [x] **Submission Handling:** Implemented Supabase insertion logic.

### Tenant Applications (`app/applications/`)
- [ ] **Dashboard:** Create a dashboard for landlords to view incoming applications.
- [ ] **Application Form:** specific form for tenants to apply to a property.
- [ ] **Status Workflow:** Implement "Approve", "Decline", "Request Info" status changes.

### Handyman Hub (`app/handyman/`)
- [ ] **Service Listing:** Allow handymen to create profiles with skills and rates.
- [x] **Job Posting:** Landlord interface to post maintenance requests (Supabase integrated).
- [ ] **Bidding System:** Mechanism for handymen to bid on posted jobs.

### Credit & Background Checks (`app/credit-check/`)
- [x] **Integration:** Integrated application submission to Supabase `applications` table.
- [ ] **Report View:** Secure view for landlords to see tenant risk profile.

## 🎨 UI/UX Polish
- [ ] **Dark Mode:** specific refinements for form inputs in dark mode.
- [ ] **Micro-interactions:** Add loading states and success animations for all form submissions.
- [ ] **Responsive Design:** Verify listing wizard on mobile devices.

## 🔧 Infrastructure & Setup
- [x] Next.js 14+ Setup with App Router.
- [x] Tailwind CSS Configuration.
- [x] Basic Component Library (Lucide React icons).
- [x] **Supabase Setup:** Client configured, Schema created. (Needs Anon Key in `.env.local`)
- [ ] **SEO Optimization:** Dynamic metadata for property pages.
