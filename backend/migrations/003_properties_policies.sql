-- ============================================================================
-- Migration: 003_properties_policies.sql
-- Phase 1, Task 5: Properties API — schema fixes required before the API
-- can work correctly.
--
-- Fixes two real gaps found in the original schema:
--   1. No UPDATE or DELETE policy existed for `properties` at all — a
--      landlord could create a listing but the database would silently
--      block them from ever editing or removing it.
--   2. The public SELECT policy used `using (true)`, which means anyone
--      (including anonymous visitors) could see 'draft' and 'archived'
--      listings, not just 'published' ones.
--
-- HOW TO APPLY: Supabase dashboard → SQL Editor → paste → Run.
-- Safe to run on top of 001 and 002 — this only touches `properties`
-- policies and adds a new storage bucket.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- Fix 1: Replace the overly-permissive SELECT policy.
-- Published listings are public. Draft/rented/archived listings are only
-- visible to the landlord who owns them (or an admin).
-- ----------------------------------------------------------------------------
drop policy if exists "Properties are viewable by everyone." on public.properties;

create policy "Published properties are viewable by everyone." on public.properties
  for select using (
    status = 'published'
    or auth.uid() = landlord_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ----------------------------------------------------------------------------
-- Fix 2: Add the missing UPDATE and DELETE policies.
-- ----------------------------------------------------------------------------
create policy "Landlords can update their own properties." on public.properties
  for update using (
    auth.uid() = landlord_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

create policy "Landlords can delete their own properties." on public.properties
  for delete using (
    auth.uid() = landlord_id
    or exists (select 1 from public.profiles where id = auth.uid() and role = 'admin')
  );

-- ----------------------------------------------------------------------------
-- Storage bucket for property images.
-- Public read (so images render on the public find-home page), but only the
-- owning landlord can upload/delete within their own folder. Uploads are
-- organized as: property-images/{landlord_id}/{property_id}/{filename}
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public)
values ('property-images', 'property-images', true)
on conflict (id) do nothing;

create policy "Property images are publicly readable." on storage.objects
  for select using (bucket_id = 'property-images');

create policy "Landlords can upload to their own folder." on storage.objects
  for insert with check (
    bucket_id = 'property-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Landlords can delete their own uploaded images." on storage.objects
  for delete using (
    bucket_id = 'property-images'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
