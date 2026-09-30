-- ============================================================================
-- 005_ai_reports.sql
--
-- Reports from the AI affordability analyst (backend/lib/aiAnalyst.ts): Claude's
-- review of an applicant's payslip and bank statements alongside the
-- rule-based assessment. Kept as history; the latest is shown.
--
-- Idempotent:
--   docker exec -i easyrent-postgres psql -U easyrent -d easyrent < db/init/005_ai_reports.sql
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.affordability_reports (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  application_id uuid REFERENCES public.applications(id) ON DELETE CASCADE NOT NULL,
  status text NOT NULL CHECK (status IN ('complete', 'failed')),
  report jsonb,
  error text,
  model text,
  requested_by uuid REFERENCES public.users(id) ON DELETE SET NULL,
  created_at timestamp with time zone DEFAULT timezone('utc'::text, now()) NOT NULL
);

CREATE INDEX IF NOT EXISTS affordability_reports_application_idx
  ON public.affordability_reports(application_id, created_at DESC);
