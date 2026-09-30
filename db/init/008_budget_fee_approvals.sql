-- ============================================================================
-- 008_budget_fee_approvals.sql
--
-- 1. Tenant budget on the application: recurring monthly expenses, other
--    income sources (which must show on the bank statement) and where the
--    applicant lives now (a first-time renter has no rent history).
-- 2. One R150 tenant fee, paid once at registration through the invite link.
-- 3. Landlord and agent accounts must be approved by a super admin before
--    they can sign in; tenants are approved automatically.
--
-- Idempotent:
--   docker exec -i easyrent-postgres psql -U easyrent -d easyrent < db/init/008_budget_fee_approvals.sql
-- ============================================================================

-- ── 1. Budget ────────────────────────────────────────────────────────────────
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS monthly_expenses jsonb,
  ADD COLUMN IF NOT EXISTS other_income jsonb,
  ADD COLUMN IF NOT EXISTS living_situation text
    CHECK (living_situation IN ('renting', 'with_family', 'own_home', 'other'));

-- ── 2. One R150 tenant fee ──────────────────────────────────────────────────
ALTER TABLE public.tenant_invites ALTER COLUMN admin_fee_amount SET DEFAULT 150;
UPDATE public.tenant_invites SET admin_fee_amount = 150 WHERE status IN ('pending', 'registered');
ALTER TABLE public.applications ALTER COLUMN application_fee_amount SET DEFAULT 150;
UPDATE public.applications SET application_fee_amount = 150
  WHERE payment_status IS DISTINCT FROM 'paid' AND application_fee_amount IS DISTINCT FROM 0;

-- ── 3. Account approval ─────────────────────────────────────────────────────
ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS approval_status text NOT NULL DEFAULT 'approved'
    CHECK (approval_status IN ('pending', 'approved', 'rejected')),
  ADD COLUMN IF NOT EXISTS account_type text
    CHECK (account_type IN ('tenant', 'landlord', 'agent', 'handyman', 'admin')),
  ADD COLUMN IF NOT EXISTS approved_at timestamptz,
  ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS rejection_reason text;

-- Existing accounts keep working; label them.
UPDATE public.users SET account_type = role WHERE account_type IS NULL AND role <> 'landlord';
UPDATE public.users SET account_type = CASE WHEN email = 'agent@demo.com' THEN 'agent' ELSE 'landlord' END
  WHERE account_type IS NULL AND role = 'landlord';

CREATE INDEX IF NOT EXISTS users_approval_status_idx ON public.users(approval_status);

-- Super admin (password "Password123!", same as the other demo accounts).
INSERT INTO public.users (id, email, password_hash, full_name, role, account_type, phone, is_verified, approval_status)
VALUES ('55555555-5555-4555-a555-555555555555', 'admin@demo.com',
        '$2b$10$SMWNDUG5nERuYs0.g1QuH.Semp9br8Bh9BNGcGmWgPzx8tmEi0.xy',
        'EasyRent Super Admin', 'admin', 'admin', '+27800000000', true, 'approved')
ON CONFLICT (email) DO NOTHING;

-- A property listed by the demo agent, so an agent can run the full flow.
INSERT INTO public.properties (id, landlord_id, title, description, address, price, bedrooms, bathrooms, size_m2, property_type, features, status)
VALUES ('dddddddd-dddd-4ddd-dddd-dddddddddddd', '33333333-3333-4333-a333-333333333333',
        'Garden Cottage in Rondebosch', 'Quiet 1-bedroom garden cottage near UCT, with its own entrance and parking.',
        '14 Belmont Road, Rondebosch, Cape Town', 8500.00, 1, 1, 48.0, 'house',
        '["Garden", "Parking", "Fibre Ready", "Pet Friendly"]'::jsonb, 'published')
ON CONFLICT (id) DO NOTHING;
