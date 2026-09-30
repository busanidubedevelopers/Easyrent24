-- ============================================================================
-- 004_affordability.sql
--
-- The applicant's current monthly rent, as they declare it on the application
-- form. The affordability assessment prefers rent payments it can see on the
-- bank statement, and falls back to this (e.g. rent paid in cash).
--
-- Idempotent:
--   docker exec -i easyrent-postgres psql -U easyrent -d easyrent < db/init/004_affordability.sql
-- ============================================================================

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS current_rent numeric(10, 2) CHECK (current_rent IS NULL OR current_rent >= 0);
