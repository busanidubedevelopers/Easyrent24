-- ============================================================================
-- Migration: 005_payment_fields.sql
-- Phase 1, Task 7: PayFast integration for application fee checkout.
--
-- HOW TO APPLY: Supabase dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Payment tracking fields on applications.
-- ----------------------------------------------------------------------------
alter table public.applications
  add column if not exists application_fee_amount numeric(10, 2) default 250.00,
  add column if not exists payment_status text check (payment_status in ('unpaid', 'pending', 'paid', 'failed')) default 'unpaid',
  add column if not exists paid_at timestamp with time zone;

-- ----------------------------------------------------------------------------
-- Table: payments
-- An audit log of every PayFast transaction attempt, independent of the
-- applications table. PayFast can (and does) resend ITN notifications for
-- the same payment — this table's unique constraint on m_payment_id is
-- what makes ITN handling idempotent (processing the same notification
-- twice should not double-charge anything or fire duplicate side effects).
-- ----------------------------------------------------------------------------
create table public.payments (
  id uuid default uuid_generate_v4() primary key,
  application_id uuid references public.applications(id) on delete set null,

  -- m_payment_id is OUR reference, generated when we redirect to PayFast.
  -- pf_payment_id is PAYFAST's reference, only known once they respond.
  m_payment_id text not null unique,
  pf_payment_id text,

  amount_gross numeric(10, 2) not null,
  status text check (status in ('pending', 'complete', 'failed', 'cancelled')) default 'pending',

  -- Full raw ITN payload, kept for auditing/dispute resolution.
  raw_itn_payload jsonb,

  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

create index payments_application_id_idx on public.payments(application_id);

alter table public.payments enable row level security;

create policy "Applicants can view payments for their own applications." on public.payments
  for select using (
    exists (
      select 1 from public.applications
      where applications.id = payments.application_id
      and applications.applicant_id = auth.uid()
    )
  );

-- No INSERT/UPDATE policy for regular users at all — payments are only ever
-- written by backend code using the service_role key (the PayFast redirect
-- route creates the 'pending' row; the ITN webhook updates it to
-- 'complete'/'failed'). A user should never be able to mark their own
-- payment as paid by calling the API directly.
