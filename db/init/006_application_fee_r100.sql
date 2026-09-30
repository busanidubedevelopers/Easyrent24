-- ============================================================================
-- 006_application_fee_r100.sql
--
-- The application (screening) fee is R100 (backend/lib/applications.ts
-- APPLICATION_FEE_ZAR). New applications set it explicitly; this updates the
-- column default and applications that haven't started paying yet.
-- Applications with a payment in progress keep the amount they were charged,
-- so PayFast's amount check still matches.
--
-- Idempotent:
--   docker exec -i easyrent-postgres psql -U easyrent -d easyrent < db/init/006_application_fee_r100.sql
-- ============================================================================

ALTER TABLE public.applications ALTER COLUMN application_fee_amount SET DEFAULT 100.00;

UPDATE public.applications
   SET application_fee_amount = 100.00
 WHERE payment_status = 'unpaid' AND application_fee_amount <> 100.00;
