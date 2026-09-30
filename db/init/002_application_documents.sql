-- ============================================================================
-- 002_application_documents.sql
--
-- Adds the `documents` column that app/api/applications/[id]/documents/route.ts
-- has always expected but 001_schema.sql never created — every upload attempt
-- (ID document, payslip, bank statement) failed with "column documents does
-- not exist" until this ran. Stores a map of document_type -> storage path,
-- e.g. {"payslip": "app-storage/application-documents/<uuid>/payslip-....pdf"}.
-- ============================================================================

ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS documents jsonb NOT NULL DEFAULT '{}'::jsonb;
