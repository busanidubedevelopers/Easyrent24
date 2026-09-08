-- ============================================================================
-- Migration: 006_invoice_numbering.sql
-- Phase 3, Task 21: Invoice generation API.
--
-- The `invoices` table already has SELECT/INSERT/UPDATE policies from
-- migration 002. This migration adds two things that were missing:
--   1. A human-readable, sequential invoice_number (e.g. INV-2026-01042) —
--      needed for real accounting/tax purposes, not just the internal UUID.
--   2. A DELETE policy — but deliberately scoped to 'draft' invoices only.
--      Once an invoice has been sent, deleting it would destroy an audit
--      trail a landlord may need for tax/dispute purposes; cancelling
--      (status = 'cancelled') is the correct action for anything already
--      sent, not deletion.
--
-- HOW TO APPLY: Supabase dashboard → SQL Editor → paste → Run.
-- ============================================================================

create sequence if not exists public.invoice_number_seq start 1000;

alter table public.invoices
  add column if not exists invoice_number text unique;

create or replace function public.set_invoice_number()
returns trigger as $$
begin
  if new.invoice_number is null then
    new.invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0');
  end if;
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_set_invoice_number on public.invoices;
create trigger trg_set_invoice_number
  before insert on public.invoices
  for each row execute function public.set_invoice_number();

-- Scoped DELETE: issuer can only delete their own invoices while still 'draft'.
create policy "Issuer can delete their own draft invoices." on public.invoices
  for delete using (
    auth.uid() = issuer_id and status = 'draft'
  );
