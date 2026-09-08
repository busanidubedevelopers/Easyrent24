-- ============================================================================
-- Migration: 004_applications_policies.sql
-- Phase 1, Task 6: Applications API — schema fixes required before the API
-- can work correctly.
--
-- Fixes found:
--   1. No UPDATE policy existed for `applications` at all — a landlord could
--      view applications on their properties but the database would
--      silently block them from ever setting status to 'approved' or
--      'declined'. Applicants also had no way to cancel their own pending
--      application.
--   2. Only a single `payslip_url` text column existed, but the table
--      already tracks THREE separate consents (credit, ID, bank statements)
--      — implying three separate documents are expected, not one. Added a
--      `documents` jsonb column to hold all of them by type.
--
-- HOW TO APPLY: Supabase dashboard → SQL Editor → paste → Run.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fix 1: UPDATE policies
-- ----------------------------------------------------------------------------
create policy "Landlords can update applications for their properties." on public.applications
  for update using (
    property_id is not null and exists (
      select 1 from public.properties
      where properties.id = applications.property_id
      and properties.landlord_id = auth.uid()
    )
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Applicants can update their own pending application." on public.applications
  for update using (
    auth.uid() = applicant_id and status = 'pending'
  );

-- ----------------------------------------------------------------------------
-- Fix 2: generic documents column (payslip, ID, bank statement, etc.)
-- Kept payslip_url in place for backward compatibility with anything already
-- reading it; new uploads should write to `documents` going forward.
-- ----------------------------------------------------------------------------
alter table public.applications
  add column if not exists documents jsonb default '{}';

comment on column public.applications.documents is
  'Keyed by document type, e.g. {"payslip": "https://...", "id_document": "https://...", "bank_statement": "https://..."}';

-- ----------------------------------------------------------------------------
-- Storage bucket for application documents.
-- PRIVATE (unlike property-images) — these are sensitive personal/financial
-- documents. Only the applicant (own docs) and the landlord of the property
-- being applied for can read them. No public access at all.
-- Path structure: application-documents/{applicant_id}/{application_id}/{type}-{filename}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('application-documents', 'application-documents', false)
on conflict (id) do nothing;

create policy "Applicants can upload their own application documents." on storage.objects
  for insert with check (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Applicants can read their own application documents." on storage.objects
  for select using (
    bucket_id = 'application-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Landlords can read documents for applications on their properties." on storage.objects
  for select using (
    bucket_id = 'application-documents'
    and exists (
      select 1 from public.applications
      join public.properties on properties.id = applications.property_id
      where applications.applicant_id::text = (storage.foldername(storage.objects.name))[1]
      and properties.landlord_id = auth.uid()
    )
  );
