-- ============================================================================
-- EasyRent PostgreSQL Schema (Docker & AWS RDS Compatible)
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ----------------------------------------------------------------------------
-- 1. Users Table (replaces Supabase auth.users)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.users (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  email text UNIQUE NOT NULL,
  password_hash text NOT NULL,
  full_name text,
  role text CHECK (role IN ('tenant', 'landlord', 'handyman', 'admin')) DEFAULT 'tenant',
  phone text,
  avatar_url text,
  services_offered text[] DEFAULT '{}'::text[],
  experience_years integer DEFAULT 0,
  certifications text[] DEFAULT '{}'::text[],
  is_verified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS users_email_idx ON public.users(email);
CREATE INDEX IF NOT EXISTS users_role_idx ON public.users(role);

-- ----------------------------------------------------------------------------
-- 2. Profiles (1:1 sync with users for backwards compatibility)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES public.users(id) ON DELETE CASCADE,
  full_name text,
  avatar_url text,
  role text CHECK (role IN ('tenant', 'landlord', 'handyman', 'admin')) DEFAULT 'tenant',
  phone text,
  services_offered text[] DEFAULT '{}'::text[],
  experience_years integer DEFAULT 0,
  certifications text[] DEFAULT '{}'::text[],
  is_verified boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE OR REPLACE FUNCTION sync_user_to_profile()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, avatar_url, role, phone, services_offered, experience_years, certifications, is_verified, created_at, updated_at)
  VALUES (NEW.id, NEW.full_name, NEW.avatar_url, NEW.role, NEW.phone, NEW.services_offered, NEW.experience_years, NEW.certifications, NEW.is_verified, NEW.created_at, NEW.updated_at)
  ON CONFLICT (id) DO UPDATE SET
    full_name = EXCLUDED.full_name,
    avatar_url = EXCLUDED.avatar_url,
    role = EXCLUDED.role,
    phone = EXCLUDED.phone,
    services_offered = EXCLUDED.services_offered,
    experience_years = EXCLUDED.experience_years,
    certifications = EXCLUDED.certifications,
    is_verified = EXCLUDED.is_verified,
    updated_at = timezone('utc'::text, now());
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_sync_user_to_profile ON public.users;
CREATE TRIGGER trg_sync_user_to_profile
  AFTER INSERT OR UPDATE ON public.users
  FOR EACH ROW EXECUTE FUNCTION sync_user_to_profile();

-- ----------------------------------------------------------------------------
-- 3. Properties (Real Estate Listings)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.properties (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  landlord_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  address text NOT NULL,
  price numeric(10, 2) NOT NULL,
  bedrooms numeric(3, 1),
  bathrooms numeric(3, 1),
  size_m2 numeric(10, 2),
  property_type text CHECK (property_type IN ('apartment', 'house', 'townhouse', 'studio', 'other')),
  features jsonb DEFAULT '[]'::jsonb,
  images text[] DEFAULT '{}'::text[],
  status text CHECK (status IN ('draft', 'published', 'rented', 'archived')) DEFAULT 'draft',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS properties_landlord_idx ON public.properties(landlord_id);
CREATE INDEX IF NOT EXISTS properties_status_idx ON public.properties(status);

-- ----------------------------------------------------------------------------
-- 4. Applications (Tenant Applications)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.applications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  applicant_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  
  first_name text NOT NULL,
  last_name text NOT NULL,
  id_number text,
  current_address text,
  email text,
  phone text,
  
  employer_name text,
  job_title text,
  employment_type text,
  monthly_income numeric(10, 2),
  
  bank_name text,
  account_number text,
  account_type text,
  payslip_url text,
  
  co_applicant_details jsonb,
  consent_credit boolean DEFAULT false,
  consent_id_check boolean DEFAULT false,
  consent_bank_statements boolean DEFAULT false,
  
  status text CHECK (status IN ('pending', 'reviewing', 'approved', 'declined', 'cancelled')) DEFAULT 'pending',
  risk_score integer,
  risk_level text CHECK (risk_level IN ('low', 'medium', 'high', 'unknown')) DEFAULT 'unknown',
  decision_notes text,
  
  application_fee_amount numeric(10, 2) DEFAULT 250.00,
  payment_status text CHECK (payment_status IN ('unpaid', 'pending', 'paid', 'failed')) DEFAULT 'unpaid',
  paid_at timestamp with time zone,
  
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS applications_property_idx ON public.applications(property_id);
CREATE INDEX IF NOT EXISTS applications_applicant_idx ON public.applications(applicant_id);

-- ----------------------------------------------------------------------------
-- 5. Payments (PayFast ITN audit)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.payments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid REFERENCES public.applications(id) ON DELETE SET NULL,
  m_payment_id text NOT NULL UNIQUE,
  pf_payment_id text,
  amount_gross numeric(10, 2) NOT NULL,
  status text CHECK (status IN ('pending', 'complete', 'failed', 'cancelled')) DEFAULT 'pending',
  raw_itn_payload jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS payments_application_idx ON public.payments(application_id);

-- ----------------------------------------------------------------------------
-- 6. Handyman Jobs & Bids
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.handyman_jobs (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  poster_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  title text NOT NULL,
  description text,
  category text,
  location text NOT NULL,
  budget_range text,
  status text CHECK (status IN ('open', 'bidding', 'in_progress', 'completed', 'cancelled')) DEFAULT 'open',
  images text[] DEFAULT '{}'::text[],
  assigned_handyman_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  agreed_price numeric(10, 2),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.handyman_bids (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES public.handyman_jobs(id) ON DELETE CASCADE NOT NULL,
  handyman_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  amount numeric(10, 2) NOT NULL,
  message text,
  eta_days integer,
  status text CHECK (status IN ('pending', 'accepted', 'rejected', 'withdrawn')) DEFAULT 'pending',
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  UNIQUE (job_id, handyman_id)
);

-- ----------------------------------------------------------------------------
-- 7. Invoices
-- ----------------------------------------------------------------------------
CREATE SEQUENCE IF NOT EXISTS public.invoice_number_seq START 1000;

CREATE TABLE IF NOT EXISTS public.invoices (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  invoice_number text UNIQUE,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  job_id uuid REFERENCES public.handyman_jobs(id) ON DELETE SET NULL,
  issuer_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  recipient_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  line_items jsonb NOT NULL DEFAULT '[]'::jsonb,
  amount numeric(10, 2) NOT NULL,
  currency text DEFAULT 'ZAR',
  status text CHECK (status IN ('draft', 'sent', 'paid', 'overdue', 'cancelled')) DEFAULT 'draft',
  due_date date,
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE OR REPLACE FUNCTION public.set_invoice_number()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.invoice_number IS NULL THEN
    NEW.invoice_number := 'INV-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.invoice_number_seq')::text, 5, '0');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_set_invoice_number ON public.invoices;
CREATE TRIGGER trg_set_invoice_number
  BEFORE INSERT ON public.invoices
  FOR EACH ROW EXECUTE FUNCTION public.set_invoice_number();

-- ----------------------------------------------------------------------------
-- 8. Loans & Escrow
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.loans (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  applicant_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  job_id uuid REFERENCES public.handyman_jobs(id) ON DELETE SET NULL,
  provider text CHECK (provider IN ('capitec', 'fnb', 'other')) NOT NULL,
  amount_requested numeric(10, 2) NOT NULL,
  amount_approved numeric(10, 2),
  monthly_income numeric(10, 2),
  status text CHECK (status IN ('pending', 'approved', 'declined', 'disbursed', 'repaid')) DEFAULT 'pending',
  decision_notes text,
  provider_reference text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.escrow_transactions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  job_id uuid REFERENCES public.handyman_jobs(id) ON DELETE CASCADE NOT NULL,
  payer_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  payee_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  amount numeric(10, 2) NOT NULL,
  status text CHECK (status IN ('held', 'released', 'refunded', 'disputed')) DEFAULT 'held',
  held_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  released_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ----------------------------------------------------------------------------
-- 9. Notifications & Market Comparisons
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  type text NOT NULL,
  title text NOT NULL,
  body text,
  link text,
  is_read boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE TABLE IF NOT EXISTS public.market_comparisons (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  search_criteria jsonb NOT NULL,
  suggested_price numeric(10, 2),
  comparable_properties jsonb,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- ----------------------------------------------------------------------------
-- 10. Maintenance Requests
-- (No subscription_tier routing in Docker — routed_to is stored but defaults to landlord)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maintenance_requests (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE CASCADE,
  title text NOT NULL,
  description text,
  priority text CHECK (priority IN ('low', 'medium', 'high', 'emergency')) DEFAULT 'low',
  status text CHECK (status IN ('pending', 'in_progress', 'resolved', 'closed')) DEFAULT 'pending',
  routed_to text DEFAULT 'landlord',
  assigned_handyman_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS maintenance_tenant_idx ON public.maintenance_requests(tenant_id);
CREATE INDEX IF NOT EXISTS maintenance_property_idx ON public.maintenance_requests(property_id);

-- ----------------------------------------------------------------------------
-- 11. Seed Data for Demo & Testing
-- Password for all seeded users: "Password123!"
-- bcrypt hash: $2b$10$SMWNDUG5nERuYs0.g1QuH.Semp9br8Bh9BNGcGmWgPzx8tmEi0.xy
-- ----------------------------------------------------------------------------
INSERT INTO public.users (id, email, password_hash, full_name, role, phone, services_offered, experience_years, is_verified)
VALUES 
  ('11111111-1111-4111-a111-111111111111', 'landlord@demo.com', '$2b$10$SMWNDUG5nERuYs0.g1QuH.Semp9br8Bh9BNGcGmWgPzx8tmEi0.xy', 'Demo Landlord', 'landlord', '+27821234567', '{}', 0, true),
  ('22222222-2222-4222-a222-222222222222', 'tenant@demo.com', '$2b$10$SMWNDUG5nERuYs0.g1QuH.Semp9br8Bh9BNGcGmWgPzx8tmEi0.xy', 'Demo Tenant', 'tenant', '+27837654321', '{}', 0, true),
  ('33333333-3333-4333-a333-333333333333', 'agent@demo.com', '$2b$10$SMWNDUG5nERuYs0.g1QuH.Semp9br8Bh9BNGcGmWgPzx8tmEi0.xy', 'Demo Agent', 'landlord', '+27849876543', '{}', 0, true),
  ('44444444-4444-4444-a444-444444444444', 'handyman@demo.com', '$2b$10$SMWNDUG5nERuYs0.g1QuH.Semp9br8Bh9BNGcGmWgPzx8tmEi0.xy', 'Demo Handyman', 'handyman', '+27811112222', '{"Plumbing","Electrical","General Repairs"}', 5, true)
ON CONFLICT (email) DO NOTHING;

-- Seed Properties
INSERT INTO public.properties (id, landlord_id, title, description, address, price, bedrooms, bathrooms, size_m2, property_type, features, status)
VALUES
  ('aaaaaaaa-aaaa-4aaa-aaaa-aaaaaaaaaaaa', '11111111-1111-4111-a111-111111111111', 'Luxury Ocean View Apartment', 'Modern 2-bedroom apartment with panoramic ocean views and 24h security.', '12 Beach Road, Sea Point, Cape Town', 18500.00, 2, 2, 85.0, 'apartment', '["Ocean View", "Balcony", "Parking", "Fibre Ready", "24h Security"]'::jsonb, 'published'),
  ('bbbbbbbb-bbbb-4bbb-bbbb-bbbbbbbbbbbb', '11111111-1111-4111-a111-111111111111', 'Spacious Family Townhouse', 'Pet-friendly 3-bedroom townhouse with private garden and garage.', '45 Main Road, Green Point, Cape Town', 26000.00, 3, 2.5, 140.0, 'townhouse', '["Garden", "Pet Friendly", "Garage", "Alarm System"]'::jsonb, 'published'),
  ('cccccccc-cccc-4ccc-cccc-cccccccccccc', '11111111-1111-4111-a111-111111111111', 'Chic City Center Studio', 'Compact and stylish studio apartment close to restaurants and tech hubs.', '88 Bree Street, Cape Town CBD', 9500.00, 1, 1, 42.0, 'studio', '["Furnished", "Fibre Ready", "Gym Access"]'::jsonb, 'published')
ON CONFLICT (id) DO NOTHING;
