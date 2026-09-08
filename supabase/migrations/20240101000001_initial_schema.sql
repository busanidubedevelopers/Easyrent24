-- Create tables for the EasyRent application

-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- Table: users (extends auth.users with public profile data)
create table public.profiles (
  id uuid references auth.users(id) on delete cascade primary key,
  full_name text,
  avatar_url text,
  role text check (role in ('tenant', 'landlord', 'handyman', 'admin')) default 'tenant',
  phone text,
  is_verified boolean default false,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for profiles
alter table public.profiles enable row level security;

create policy "Public profiles are viewable by everyone." on public.profiles
  for select using (true);

create policy "Users can insert their own profile." on public.profiles
  for insert with check (auth.uid() = id);

create policy "Users can update own profile." on public.profiles
  for update using (auth.uid() = id);

-- Table: properties (Real Estate Listings)
create table public.properties (
  id uuid default uuid_generate_v4() primary key,
  landlord_id uuid references public.profiles(id) not null,
  title text not null,
  description text,
  address text not null,
  price numeric(10, 2) not null,
  bedrooms numeric(3, 1),
  bathrooms numeric(3, 1),
  size_m2 numeric(10, 2),
  property_type text check (property_type in ('apartment', 'house', 'townhouse', 'studio', 'other')),
  features jsonb, -- e.g. ["pool", "parking", "wifi"]
  images text[], -- Array of image URLs
  status text check (status in ('draft', 'published', 'rented', 'archived')) default 'draft',
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for properties
alter table public.properties enable row level security;

create policy "Properties are viewable by everyone." on public.properties
  for select using (true);

create policy "Landlords can create properties." on public.properties
  for insert with check (auth.uid() = landlord_id);

create policy "Landlords can update own properties." on public.properties
  for update using (auth.uid() = landlord_id);

-- Table: applications (Tenant Applications to Properties OR General Verifications)
create table public.applications (
  id uuid default uuid_generate_v4() primary key,
  property_id uuid references public.properties(id) on delete cascade, -- Nullable for general verification
  applicant_id uuid references public.profiles(id) not null, -- Assumes user is logged in
  
  -- Application Data Snapshot (in case profile changes later)
  first_name text not null,
  last_name text not null,
  id_number text,
  current_address text,
  email text,
  phone text,
  
  -- Employment Details
  employer_name text,
  job_title text,
  employment_type text,
  monthly_income numeric(10, 2),
  
  -- Financial & Banking
  bank_name text,
  account_number text,
  account_type text,
  payslip_url text,
  
  -- Co-Applicant Data (stored as JSONB for flexibility)
  co_applicant_details jsonb,
  
  -- Verification & Consent
  consent_credit boolean default false,
  consent_id_check boolean default false,
  consent_bank_statements boolean default false,
  
  -- Application Status
  status text check (status in ('pending', 'reviewing', 'approved', 'declined', 'cancelled')) default 'pending',
  risk_score integer, -- e.g. credit score 0-999
  risk_level text check (risk_level in ('low', 'medium', 'high', 'unknown')) default 'unknown',
  decision_notes text,
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for applications
alter table public.applications enable row level security;

create policy "Landlords can view applications for their properties." on public.applications
  for select using (
    property_id is not null and exists (
      select 1 from public.properties
      where properties.id = applications.property_id
      and properties.landlord_id = auth.uid()
    )
  );

create policy "Applicants can view their own applications." on public.applications
  for select using (auth.uid() = applicant_id);

create policy "Applicants can insert new applications." on public.applications
  for insert with check (auth.uid() = applicant_id);


-- Table: handyman_jobs (Maintenance Requests)
create table public.handyman_jobs (
  id uuid default uuid_generate_v4() primary key,
  poster_id uuid references public.profiles(id) not null,
  title text not null,
  description text,
  category text, -- e.g. Plumbing, Electrical
  location text not null,
  budget_range text, -- e.g. "R500-R1000" or specific amount
  status text check (status in ('open', 'bidding', 'in_progress', 'completed', 'cancelled')) default 'open',
  images text[],
  
  assigned_handyman_id uuid references public.profiles(id),
  agreed_price numeric(10, 2),
  
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for handyman_jobs
alter table public.handyman_jobs enable row level security;

create policy "Jobs are viewable by everyone." on public.handyman_jobs
  for select using (true);

create policy "Users can post jobs." on public.handyman_jobs
  for insert with check (auth.uid() = poster_id);

create policy "Users can update own jobs." on public.handyman_jobs
  for update using (auth.uid() = poster_id);

-- Table: market_comparisons (Saved Price Comparisons)
create table public.market_comparisons (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references public.profiles(id), -- Nullable for guest users if needed
  search_criteria jsonb not null, -- { location: "Sea Point", bedrooms: 2, ... }
  suggested_price numeric(10, 2),
  comparable_properties jsonb, -- Snapshot of top comparables used
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS for market_comparisons
alter table public.market_comparisons enable row level security;

create policy "Users can see own comparisons." on public.market_comparisons
  for select using (auth.uid() = user_id);

create policy "Users can create comparisons." on public.market_comparisons
  for insert with check (auth.uid() = user_id);
