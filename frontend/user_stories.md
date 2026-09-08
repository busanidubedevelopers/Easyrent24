# Easy Rent Application - User Stories

## 1. Rental Applications & Tenant Verification

### Story 1.1: Multi-Step Rental Application Form
**As a** prospective tenant
**I want to** complete a multi-step application form that captures my personal, employment, and financial details
**So that** I can apply for a rental property securely without being overwhelmed by a massive single-page form.

**Acceptance Criteria:**
* **Given** the user clicks "Apply Now" on a property, **When** the page loads, **Then** they are taken to the unified `/apply` page showing Step 1 (Personal Details) with a visual progress indicator.
* **When** the user indicates they are a "Non-Resident", **Then** the "ID Number" field updates to "Passport Number" and a "Country of Origin" dropdown appears.
* **When** a user clicks "Next", **Then** the system must validate all required fields before allowing them to proceed to the next step.
* **Given** the user checks "Joint Application (2 Applicants)", **Then** a Co-Applicant section appears requiring identical personal, residency, and identification inputs.
* **When** uploading identification documents (ID or Passport), **Then** both the main applicant and the co-applicant are provided with drag-and-drop file upload zones directly beneath their respective ID/Passport number fields.
* **Given** the user reaches the final step (Consent & Submission), **When** they submit, **Then** the data must be securely saved to the database.

### Story 1.2: Application Fee Checkout Flow
**As a** prospective tenant
**I want to** be redirected to a payment gateway immediately after submitting my application
**So that** I can pay the required background check fee to finalize my application submission.

**Acceptance Criteria:**
* **Given** the user successfully submits the final step of the application, **When** the API returns a success response, **Then** the user is automatically redirected to the payment checkout page.
* **Given** the user completes the payment, **When** the payment provider confirms success, **Then** the application status in the database updates from "Pending Payment" to "Under Review".
* **Edge Case:** If the payment fails or the user cancels the checkout, the application remains in a "Pending Payment" state, and the user receives an email with a link to retry the payment.

### Story 1.3: Tenant Invitation Workflow
**As a** landlord
**I want to** generate an email invitation containing a unique property reference code
**So that** I can direct specific prospective tenants to apply for my property securely.

**Acceptance Criteria:**
* **Given** the landlord is on the dashboard, **When** they select a property and enter an applicant's email, **Then** an invitation email is dispatched with a unique link and property reference code.
* **When** the prospective tenant clicks the link or navigates to the application portal, **Then** they can seamlessly apply with the property reference code automatically pre-filled or manually typed in.
* **Edge Case:** If the user manually types an invalid reference code, the system must warn them before they begin the application.

### Story 1.4: Advanced Landlord Application Review
**As a** landlord
**I want to** review comprehensive verification data including identity checks, credit reports, and affordability analyses
**So that** I can make informed decisions based on verified risk indicators.

**Acceptance Criteria:**
* **Given** the landlord opens a submitted application on the dashboard, **Then** they are presented with a premium, glassmorphism-styled UI highlighting key metrics (Credit Score, Affordability Ratio) at the top.
* **Then** they see Identity Verification details matched against the Dept of Home Affairs (including verification of non-resident matches with valid permits).
* **Then** they see a Credit Bureau summary displaying the credit score, detected fraud indicators, and any recorded credit judgements.
* **Then** they see an Affordability Analysis derived from 3 months of bank statements showing Net Income, Total Expenses, and Disposable Income.
* **Edge Case:** If bank statements cannot be automatically parsed, the system flags the affordability analysis for manual review and provides a link to view the raw uploaded PDFs.

## 2. Handyman Services (Maintenance)

### Story 2.1: Posting a Maintenance Request
**As a** client (tenant or landlord)
**I want to** post a detailed maintenance job (including category, description, location, and photos)
**So that** I can accurately convey the issue to local service professionals.

**Acceptance Criteria:**
* **Given** the user is on the Handyman Dashboard, **When** they click "Post a New Job", **Then** a form appears requiring Job Title, Category (e.g., Plumbing, Electrical), Location, Budget, and Image Upload.
* **When** uploading images, **Then** the system must restrict files to `.jpg` or `.png` and limit the size to 5MB per image.
* **When** the job is posted, **Then** it immediately appears on the "Your Active Requests" board with a status tag of "Open".
* **Edge Case:** If a user submits a job without a budget, the system should default to "Open to quotes" rather than throwing an error.

### Story 2.2: Handyman Bidding on a Job
**As a** handyman (service provider)
**I want to** view job details and submit a customized quote
**So that** I can compete for available maintenance jobs in my area.

**Acceptance Criteria:**
* **Given** the handyman is browsing the job board, **When** they click on a specific job, **Then** they see the full description, client location, and attached photos.
* **When** the handyman clicks "View & Bid", **Then** a modal opens allowing them to enter their proposed price, estimated time to completion, and an optional message to the client.
* **When** the bid is submitted, **Then** the client receives a real-time notification (or email) that a new quote has been received.
* **Edge Case:** A handyman cannot submit a bid if the job status has already been changed to "In Progress" or "Closed" by the client.

## 3. Service Financing 

### Story 3.1: Short-Term Loan Application
**As a** user facing unexpected maintenance costs
**I want to** compare financial providers and apply for a short-term advance
**So that** I can afford urgent repairs without draining my immediate cash flow.

**Acceptance Criteria:**
* **Given** the user clicks "Finance this repair", **When** the Financing page loads, **Then** the user sees the requested repair amount auto-filled and a list of available providers (e.g., Capitec, FNB) with their respective interest fees and payout times.
* **When** the user selects a provider and clicks "Continue", **Then** they are prompted to confirm their Employer Name and Monthly Net Income.
* **When** the user submits the application, **Then** the UI must show a loading state ("Processing Approval...") for at least 2 seconds before redirecting to the success screen to simulate external API processing.
* **Edge Case:** If the requested loan amount exceeds the provider's maximum limit, the specific provider button should be disabled with a tooltip explaining why.

### Story 3.2: Loan Payout to Service Escrow
**As a** borrower
**I want** my approved funds to be paid directly into a Service Escrow account
**So that** I know the funds are secure and the handyman is guaranteed payment only when the job is actually completed.

**Acceptance Criteria:**
* **Given** the loan is approved on the final step, **When** the user clicks "Pay to Service Escrow", **Then** the system deducts the amount from the virtual loan balance and updates the associated Handyman Job status to "Funded".
* **Then** both the user and the hired handyman receive a notification stating "Funds Secured in Escrow".
* **Edge Case:** If the handyman fails to complete the job or the client cancels the contract, the escrow system must have a clearly defined refund trigger that sends the principal amount back to the financial provider.

## 4. Documents & Billing (Documents Centre)

### Story 4.1: Dynamic Invoice Generation
**As a** landlord
**I want to** create a custom invoice with multiple line items (Rent, Water, Electricity)
**So that** I can accurately charge my tenants based on their specific monthly usage.

**Acceptance Criteria:**
* **Given** the landlord is in the Documents Centre, **When** they select a tenant from the dropdown, **Then** the invoice builder auto-populates the fixed base rent, locking that line item from being deleted.
* **When** the landlord clicks "Add Item", **Then** a new editable row appears allowing them to add custom charges (e.g., Water Usage) and amounts.
* **When** line item amounts are updated, **Then** the Total Amount at the bottom of the invoice must recalculate dynamically in real-time.
* **Edge Case:** The system must prevent submission if the total invoice amount is zero or negative.

### Story 4.2: Auto-Scheduled Invoice Delivery
**As a** landlord
**I want to** select my delivery method and toggle "Auto-Schedule" for my invoices
**So that** my billing is automated on the same day every month without manual intervention.

**Acceptance Criteria:**
* **Given** the invoice is complete, **When** the landlord toggles "Email" and "SMS" delivery methods, **Then** the UI visually highlights the selected channels.
* **When** the landlord toggles "Auto-Schedule", **Then** the submit button text changes from "Create & Send" to "Save & Schedule".
* **When** scheduled, **Then** the system registers a cron job or scheduled task to dispatch the invoice on the 25th of the current/next month.
* **Edge Case:** If the landlord attempts to save without selecting at least one delivery method, the system must trigger a toast error saying "Please select at least one delivery method."

## 5. Property Search & Listing

### Story 5.1: Places of Interest (POI) Distance Calculation
**As a** prospective tenant
**I want to** input my specific daily destinations (Work, School, Gym) during my property search
**So that** the search results display the travel distance from the property to the places that matter most to me.

**Acceptance Criteria:**
* **Given** the user is on the property search page, **When** they open the advanced filters, **Then** they see a "Places of Interest" section with text inputs for specific addresses or coordinates.
* **When** the search results render, **Then** each property card includes a small map or tag showing the calculated distance (e.g., "5km to Work", "2km to School").
* **Edge Case:** If the map API fails to calculate the distance, the UI should gracefully fallback to displaying "Distance unavailable" rather than breaking the property card layout.
