# Business Requirements Document (BRD)

## 1. Executive Summary
**Project Name:** Easy Rent Application  
**Objective:** To develop a comprehensive, end-to-end property rental management and tenant service platform tailored for the South African market. The Easy Rent Application aims to streamline the rental lifecycle, bridging the gap between landlords, tenants, and service providers (handymen), while integrating modern fintech solutions like service financing and automated billing.

## 2. Market Opportunity: South Africa
The South African residential property market is undergoing a significant shift toward long-term renting. 
* **Market Scale:** There are approximately **3 million households** operating within the rental market. Homeownership has declined from roughly 70% to 62% over the past decade, driving a proportional surge in rental demand.
* **Property Value:** The broader residential real estate sector is valued at around **$30.19 Billion USD**, with a projected CAGR of 10.9% through 2031.
* **Formal Inventory:** An estimated **700,000 formal rental properties** are actively managed and tracked.
* **Market Dynamics:** Affordability constraints, interest rate fluctuations, and a preference for mobility and "lifestyle-first" features have cemented renting as a strategic choice. Tenants exhibit strong payment behaviors but expect modern conveniences, while landlords require robust tools to manage billing, maintenance, and tenant vetting efficiently.

By targeting this expanding market, Easy Rent positions itself to capture significant market share by offering an all-in-one ecosystem that reduces friction for all stakeholders.

## 3. Target Audience
* **Prospective & Current Tenants:** Individuals seeking modern property search tools, simplified application processes, and seamless ways to request maintenance or secure short-term financing for repairs.
* **Landlords & Property Managers:** Property owners needing automated invoicing, tenant vetting, and a reliable network of maintenance professionals.
* **Service Professionals (Handymen):** Local tradespeople looking for a centralized platform to bid on and secure local maintenance jobs with guaranteed escrow payments.

## 4. Scope & Key Functional Requirements
Based on the defined user stories, the solution encompasses the following core modules:

### 4.1. Property Search & Listing
* **POI Distance Calculation:** Users can input specific daily destinations (Work, School, Gym). The system must calculate and display the travel distance from the property to these points of interest directly on the property cards.

### 4.2. Rental Applications & Tenant Verification
* **Tenant Invitation & Reference Codes:** Landlords can generate unique property reference codes and directly invite prospective tenants via email. Tenants can apply securely via these links or by entering the reference code manually into the unified `/apply` portal.
* **Unified Multi-Step Application Flow:** A frictionless, wizard-style application form capturing personal, employment, and financial data with progress indicators. It seamlessly handles both South African citizens and non-residents, dynamically adjusting fields for ID Numbers vs Passport Numbers and Country of Origin.
* **Joint Applications & Document Capturing:** The form supports joint applications, allowing the main applicant to securely upload ID or Passport documents for up to two participants directly within the application flow.
* **Application Fee Checkout:** Seamless redirection to a payment gateway post-submission to collect background check fees, automatically updating the application status to "Under Review" upon successful payment.
* **Premium Landlord Review Dashboard:** Landlords access comprehensive, visually premium risk reports for each applicant. This includes Identity Verification (Dept of Home Affairs, including non-resident matches with valid permits), Credit Bureau summaries (fraud indicators, credit judgements), and an automated Affordability Analysis derived from 3 months of bank statements (calculating net income, total expenses, and disposable income).

### 4.3. Handyman Services & Maintenance
* **Maintenance Job Board:** Clients can post detailed repair jobs (category, budget, location, photos up to 5MB).
* **Bidding System:** Handymen can view job details, submit customized quotes (price, estimated time), and communicate with the client. Clients receive real-time notifications of new bids.

### 4.4. Service Financing
* **Short-Term Loan Integration:** Tenants facing unexpected repair costs can compare approved financial providers (e.g., Capitec, FNB) and apply for short-term advances directly within the app based on their income data.
* **Service Escrow:** Approved loan funds are deposited directly into a secure Service Escrow account, ensuring handymen are guaranteed payment upon successful completion of the job, protecting both parties.

### 4.5. Documents & Billing
* **Dynamic Invoice Generation:** Landlords can build custom invoices with locked base rent and dynamic line items (e.g., water, electricity usage) that calculate totals in real-time.
* **Auto-Scheduled Delivery:** Landlords can schedule recurring invoice delivery via Email or SMS, utilizing cron jobs to automate dispatch on specific dates (e.g., the 25th of every month).

## 5. Non-Functional Requirements
* **Security & Data Privacy:** The platform must comply with the Protection of Personal Information Act (POPIA) regarding the storage and processing of tenant IDs, financial records, and application data.
* **Performance:** The platform must be highly responsive, particularly the property search map API and the real-time invoice calculators.
* **Reliability:** Background jobs (e.g., invoice cron schedules) and payment webhook listeners must have high availability and robust error handling/retry mechanisms.

## 6. Assumptions & Dependencies
* Integration with a verified third-party payment gateway (e.g., PayFast, Yoco, or Stripe) for application fees.
* Integration with external financial institution APIs for the Service Financing pre-approval and processing.
* Integration with a mapping API (e.g., Google Maps, Mapbox) for POI distance calculations.

## 7. Next Steps
* Finalize API partnerships with financial providers and payment gateways.
* Develop UI/UX wireframes for the Handyman Job Board and Escrow payment flow.
* Initiate development sprints starting with the Core Property Search and Multi-Step Application modules.
