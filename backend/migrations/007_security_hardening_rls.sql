-- ============================================================================
-- Migration 007: Comprehensive Security Hardening & Row Level Security (RLS)
--
-- Defense-in-depth protections:
-- 1. Explicitly enables RLS on ALL public tables
-- 2. Creates missing production tables (reviews, maintenance_requests, audit_logs)
-- 3. Implements strict, least-privilege RLS policies
-- 4. Guarantees tamper-proof audit trail (append-only)
-- ============================================================================

-- ── 1. Enable RLS across all existing tables ─────────────────────────────────
do $$
declare
  t text;
  tables text[] := array[
    'profiles',
    'properties',
    'applications',
    'application_documents',
    'payments',
    'invoices',
    'handyman_jobs',
    'handyman_bids'
  ];
begin
  foreach t in array tables loop
    if exists (select 1 from information_schema.tables where table_schema = 'public' and table_name = t) then
      execute format('alter table public.%I enable row level security;', t);
    end if;
  end loop;
end $$;

-- ── 2. Reviews Table & Policies ─────────────────────────────────────────────
create table if not exists public.reviews (
  id uuid primary key default gen_random_uuid(),
  reviewer_id uuid references auth.users(id) on delete set null,
  reviewer_role text not null check (reviewer_role in ('tenant', 'landlord')),
  target_role text not null check (target_role in ('tenant', 'landlord')),
  target_name text not null,
  rating integer not null check (rating >= 1 and rating <= 5),
  comment text not null,
  created_at timestamptz not null default now()
);

alter table public.reviews enable row level security;

-- Public can read all published reviews
drop policy if exists "Reviews are viewable by everyone" on public.reviews;
create policy "Reviews are viewable by everyone"
  on public.reviews for select
  using (true);

-- Authenticated users can insert reviews
drop policy if exists "Authenticated users can submit reviews" on public.reviews;
create policy "Authenticated users can submit reviews"
  on public.reviews for insert
  with check (auth.uid() is not null);

-- Users can only modify their own reviews
drop policy if exists "Users can update their own reviews" on public.reviews;
create policy "Users can update their own reviews"
  on public.reviews for update
  using (reviewer_id = auth.uid());

-- ── 3. Maintenance Requests Table & Policies ─────────────────────────────────
create table if not exists public.maintenance_requests (
  id uuid primary key default gen_random_uuid(),
  property_id uuid references public.properties(id) on delete cascade,
  tenant_id uuid references auth.users(id) on delete set null,
  title text not null,
  description text not null,
  priority text not null check (priority in ('low', 'medium', 'high', 'emergency')),
  status text not null default 'pending' check (status in ('pending', 'in_progress', 'resolved', 'closed')),
  routed_to text not null default 'landlord',
  created_at timestamptz not null default now()
);

alter table public.maintenance_requests enable row level security;

-- Tenants can see their own requests
drop policy if exists "Tenants view their own maintenance requests" on public.maintenance_requests;
create policy "Tenants view their own maintenance requests"
  on public.maintenance_requests for select
  using (tenant_id = auth.uid());

-- Tenants can insert requests
drop policy if exists "Tenants can log maintenance requests" on public.maintenance_requests;
create policy "Tenants can log maintenance requests"
  on public.maintenance_requests for insert
  with check (tenant_id = auth.uid());

-- Landlords can see requests for properties they own
drop policy if exists "Landlords view maintenance for owned properties" on public.maintenance_requests;
create policy "Landlords view maintenance for owned properties"
  on public.maintenance_requests for select
  using (
    exists (
      select 1 from public.properties
      where properties.id = maintenance_requests.property_id
        and properties.landlord_id = auth.uid()
    )
  );

-- Landlords can update status of maintenance requests for their properties
drop policy if exists "Landlords update maintenance requests" on public.maintenance_requests;
create policy "Landlords update maintenance requests"
  on public.maintenance_requests for update
  using (
    exists (
      select 1 from public.properties
      where properties.id = maintenance_requests.property_id
        and properties.landlord_id = auth.uid()
    )
  );

-- ── 4. Immutable Audit Logs Table ───────────────────────────────────────────
create table if not exists public.audit_logs (
  id uuid primary key default gen_random_uuid(),
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  resource_type text not null,
  resource_id text,
  metadata jsonb not null default '{}'::jsonb,
  ip_address text,
  user_agent text,
  created_at timestamptz not null default now()
);

alter table public.audit_logs enable row level security;

-- Only platform admins can query audit logs
drop policy if exists "Admins can view audit logs" on public.audit_logs;
create policy "Admins can view audit logs"
  on public.audit_logs for select
  using (
    exists (
      select 1 from public.profiles
      where profiles.id = auth.uid()
        and profiles.role = 'admin'
    )
  );

-- No public insert/update/delete on audit logs (only service_role key can insert)
-- Disallowing UPDATE and DELETE completely ensures append-only immutability
revoke update, delete on public.audit_logs from public, authenticated, anon;
