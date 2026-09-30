-- ============================================================================
-- 003_invites_extraction_leases.sql
--
-- Plain-Postgres equivalent of backend/migrations 008–010 (which target
-- Supabase): tenant invites + registration admin fee, document extraction,
-- and leases. There is no row-level security in this setup — the API routes
-- enforce who can see and change each row (see backend/lib/applicationAccess.ts
-- and backend/lib/leaseRecords.ts). Files live on disk (UPLOAD_DIR), so the
-- Supabase storage bucket from 009 has no equivalent here.
--
-- Idempotent: safe to run against an existing database.
--   docker exec -i easyrent-postgres psql -U easyrent -d easyrent < db/init/003_invites_extraction_leases.sql
-- ============================================================================

-- ── Tenant invites (registration admin fee) ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.tenant_invites (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  token text NOT NULL UNIQUE,
  inviter_id uuid REFERENCES public.users(id) ON DELETE CASCADE NOT NULL,
  property_id uuid REFERENCES public.properties(id) ON DELETE SET NULL,
  invitee_name text NOT NULL,
  invitee_email text NOT NULL,
  admin_fee_amount numeric(10, 2) NOT NULL CHECK (admin_fee_amount >= 5),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'registered', 'paid', 'revoked')),
  tenant_id uuid REFERENCES public.users(id) ON DELETE SET NULL,
  registered_at timestamp with time zone,
  paid_at timestamp with time zone,
  expires_at timestamp with time zone NOT NULL DEFAULT (timezone('utc'::text, now()) + interval '14 days'),
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS tenant_invites_inviter_id_idx ON public.tenant_invites(inviter_id);
CREATE INDEX IF NOT EXISTS tenant_invites_tenant_id_idx ON public.tenant_invites(tenant_id);

-- A payment is for an application (application fee) or an invite (admin fee).
ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS invite_id uuid REFERENCES public.tenant_invites(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS payments_invite_id_idx ON public.payments(invite_id);

-- ── Document extraction ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.document_extractions (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
  document_type text NOT NULL CHECK (document_type IN (
    'payslip', 'id_document', 'bank_statement',
    'co_payslip', 'co_id_document', 'co_bank_statement'
  )),
  storage_path text NOT NULL,
  status text NOT NULL CHECK (status IN ('complete', 'failed')),
  extracted jsonb,
  error text,
  model text,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS document_extractions_application_id_idx
  ON public.document_extractions(application_id, document_type, created_at DESC);

-- ── Leases ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.leases (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid REFERENCES public.applications(id) ON DELETE RESTRICT NOT NULL UNIQUE,
  property_id uuid REFERENCES public.properties(id) ON DELETE RESTRICT NOT NULL,
  landlord_id uuid REFERENCES public.users(id) NOT NULL,
  tenant_id uuid REFERENCES public.users(id) NOT NULL,

  status text NOT NULL DEFAULT 'draft'
    CHECK (status IN ('draft', 'sent', 'tenant_signed', 'executed', 'cancelled')),

  monthly_rent numeric(10, 2) NOT NULL CHECK (monthly_rent > 0),
  deposit numeric(10, 2) NOT NULL CHECK (deposit >= 0),
  start_date date NOT NULL,
  term_months integer NOT NULL CHECK (term_months BETWEEN 1 AND 60),
  escalation_pct numeric(5, 2) NOT NULL DEFAULT 0 CHECK (escalation_pct BETWEEN 0 AND 25),
  rent_due_day integer NOT NULL DEFAULT 1 CHECK (rent_due_day BETWEEN 1 AND 28),
  pets_allowed boolean NOT NULL DEFAULT false,
  utilities text NOT NULL DEFAULT 'tenant_prepaid'
    CHECK (utilities IN ('tenant_prepaid', 'tenant_metered', 'included')),
  special_conditions text,

  parties jsonb NOT NULL,
  document_hash text,
  sent_at timestamp with time zone,
  tenant_signature jsonb,
  landlord_signature jsonb,
  executed_at timestamp with time zone,
  pdf_path text,

  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL,
  updated_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS leases_landlord_id_idx ON public.leases(landlord_id);
CREATE INDEX IF NOT EXISTS leases_tenant_id_idx ON public.leases(tenant_id);
