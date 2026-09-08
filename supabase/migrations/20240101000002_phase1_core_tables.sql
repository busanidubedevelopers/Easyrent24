-- ============================================================================
-- Migration: 002_phase1_core_tables.sql
-- Phase 1, Task 3: Harden DB schema — add bids, invoices, loans, escrow,
-- notifications tables (see EasyRent_Backend_Project_Plan.xlsx, Task ID 3)
--
-- HOW TO APPLY THIS MIGRATION:
--   Option A (quickest): Open your Supabase project → SQL Editor → paste this
--   entire file → Run.
--   Option B (recommended long-term): if you install the Supabase CLI, save
--   this file as supabase/migrations/<timestamp>_phase1_core_tables.sql and
--   run `supabase db push`.
--
-- This migration is additive only — it does not modify or drop any existing
-- table from supabase/schema.sql, so it's safe to run on top of what you
-- already have.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Table: handyman_bids
-- Handymen bid on open handyman_jobs; the job poster accepts one bid.
-- ----------------------------------------------------------------------------
create table public.handyman_bids (
  id uuid default uuid_generate_v4() primary key,
  job_id uuid references public.handyman_jobs(id) on delete cascade not null,
  handyman_id uuid references public.profiles(id) not null,
  amount numeric(10, 2) not null,
  message text,
  eta_days integer, -- estimated days to complete the job
  status text check (status in ('pending', 'accepted', 'rejected', 'withdrawn')) default 'pending',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  -- A handyman can only have one active bid per job
  unique (job_id, handyman_id)
);

create index handyman_bids_job_id_idx on public.handyman_bids(job_id);
create index handyman_bids_handyman_id_idx on public.handyman_bids(handyman_id);

alter table public.handyman_bids enable row level security;

create policy "Job poster can view bids on their own jobs." on public.handyman_bids
  for select using (
    exists (
      select 1 from public.handyman_jobs
      where handyman_jobs.id = handyman_bids.job_id
      and handyman_jobs.poster_id = auth.uid()
    )
  );

create policy "Handymen can view their own bids." on public.handyman_bids
  for select using (auth.uid() = handyman_id);

create policy "Handymen can submit bids." on public.handyman_bids
  for insert with check (auth.uid() = handyman_id);

create policy "Handymen can update or withdraw their own pending bid." on public.handyman_bids
  for update using (auth.uid() = handyman_id and status = 'pending');

create policy "Job poster can accept or reject bids on their own jobs." on public.handyman_bids
  for update using (
    exists (
      select 1 from public.handyman_jobs
      where handyman_jobs.id = handyman_bids.job_id
      and handyman_jobs.poster_id = auth.uid()
    )
  );


-- ----------------------------------------------------------------------------
-- Table: invoices
-- Covers both rent invoices (property_id) and handyman job invoices (job_id).
-- Exactly one of property_id / job_id should be set per invoice.
-- ----------------------------------------------------------------------------
create table public.invoices (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references public.properties(id) on delete set null,
  job_id uuid references public.handyman_jobs(id) on delete set null,

  issuer_id uuid references public.profiles(id) not null,   -- landlord or handyman
  recipient_id uuid references public.profiles(id) not null, -- tenant or client

  line_items jsonb not null default '[]', -- [{ "description": "Rent - August", "amount": 12000 }]
  amount numeric(10, 2) not null,
  currency text default 'ZAR',

  status text check (status in ('draft', 'sent', 'paid', 'overdue', 'cancelled')) default 'draft',
  due_date date,
  paid_at timestamp with time zone,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null,

  constraint invoice_has_one_source check (
    (property_id is not null and job_id is null) or
    (property_id is null and job_id is not null) or
    (property_id is null and job_id is null) -- allow ad-hoc invoices too
  )
);

create index invoices_property_id_idx on public.invoices(property_id);
create index invoices_job_id_idx on public.invoices(job_id);
create index invoices_recipient_id_idx on public.invoices(recipient_id);

alter table public.invoices enable row level security;

create policy "Issuer can view their own invoices." on public.invoices
  for select using (auth.uid() = issuer_id);

create policy "Recipient can view invoices addressed to them." on public.invoices
  for select using (auth.uid() = recipient_id);

create policy "Issuer can create invoices." on public.invoices
  for insert with check (auth.uid() = issuer_id);

create policy "Issuer can update their own invoices." on public.invoices
  for update using (auth.uid() = issuer_id);


-- ----------------------------------------------------------------------------
-- Table: loans
-- Short-term repair financing applications (e.g. Capitec, FNB integrations).
-- ----------------------------------------------------------------------------
create table public.loans (
  id uuid default uuid_generate_v4() primary key,
  applicant_id uuid references public.profiles(id) not null,
  job_id uuid references public.handyman_jobs(id) on delete set null,

  provider text check (provider in ('capitec', 'fnb', 'other')) not null,
  amount_requested numeric(10, 2) not null,
  amount_approved numeric(10, 2),
  monthly_income numeric(10, 2),

  status text check (status in ('pending', 'approved', 'declined', 'disbursed', 'repaid')) default 'pending',
  decision_notes text,
  provider_reference text, -- external reference ID once integrated with the real provider API

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index loans_applicant_id_idx on public.loans(applicant_id);

alter table public.loans enable row level security;

create policy "Applicants can view their own loan applications." on public.loans
  for select using (auth.uid() = applicant_id);

create policy "Applicants can submit loan applications." on public.loans
  for insert with check (auth.uid() = applicant_id);


-- ----------------------------------------------------------------------------
-- Table: escrow_transactions
-- Holds funds for a handyman job until the client confirms completion.
-- ----------------------------------------------------------------------------
create table public.escrow_transactions (
  id uuid default uuid_generate_v4() primary key,
  job_id uuid references public.handyman_jobs(id) on delete cascade not null,
  payer_id uuid references public.profiles(id) not null,   -- the client funding escrow
  payee_id uuid references public.profiles(id) not null,   -- the handyman being paid

  amount numeric(10, 2) not null,
  status text check (status in ('held', 'released', 'refunded', 'disputed')) default 'held',

  held_at timestamp with time zone default timezone('utc'::text, now()) not null,
  released_at timestamp with time zone,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index escrow_transactions_job_id_idx on public.escrow_transactions(job_id);

alter table public.escrow_transactions enable row level security;

create policy "Payer can view their own escrow transactions." on public.escrow_transactions
  for select using (auth.uid() = payer_id);

create policy "Payee can view escrow transactions paid to them." on public.escrow_transactions
  for select using (auth.uid() = payee_id);

create policy "Payer can create an escrow transaction." on public.escrow_transactions
  for insert with check (auth.uid() = payer_id);

create policy "Payer can release or refund their own escrow." on public.escrow_transactions
  for update using (auth.uid() = payer_id);


-- ----------------------------------------------------------------------------
-- Table: notifications
-- In-app notifications (bid received, application status change, invoice due, etc).
-- Rows are written by backend logic using the service_role key, which bypasses
-- RLS entirely — so there is intentionally no INSERT policy for regular users.
-- ----------------------------------------------------------------------------
create table public.notifications (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id) on delete cascade not null,

  type text not null, -- e.g. 'bid_received', 'application_status', 'invoice_due'
  title text not null,
  body text,
  link text, -- e.g. '/handyman/job/123'
  is_read boolean default false,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index notifications_user_id_idx on public.notifications(user_id);
create index notifications_user_id_unread_idx on public.notifications(user_id) where is_read = false;

alter table public.notifications enable row level security;

create policy "Users can view their own notifications." on public.notifications
  for select using (auth.uid() = user_id);

create policy "Users can mark their own notifications as read." on public.notifications
  for update using (auth.uid() = user_id);

-- No insert policy: notifications are written by backend API routes using the
-- service_role key (see lib/supabaseAdmin.ts), which bypasses RLS by design.
