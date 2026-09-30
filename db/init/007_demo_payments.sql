-- ============================================================================
-- 007_demo_payments.sql
--
-- Supports the built-in demo payment gateway (backend/lib/demoGateway.ts),
-- used instead of PayFast when PAYMENT_PROVIDER=demo. A payment remembers which
-- provider handles it, what it's for, where to send the shopper afterwards,
-- and — for demo payments — the outcome of each card attempt.
--
-- Idempotent:
--   docker exec -i easyrent-postgres psql -U easyrent -d easyrent < db/init/007_demo_payments.sql
-- ============================================================================

ALTER TABLE public.payments
  ADD COLUMN IF NOT EXISTS provider text NOT NULL DEFAULT 'payfast' CHECK (provider IN ('payfast', 'demo')),
  ADD COLUMN IF NOT EXISTS item_name text,
  ADD COLUMN IF NOT EXISTS return_url text,
  ADD COLUMN IF NOT EXISTS cancel_url text,
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS failure_reason text,
  ADD COLUMN IF NOT EXISTS card_last4 text;
