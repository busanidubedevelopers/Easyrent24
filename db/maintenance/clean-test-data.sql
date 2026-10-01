-- ============================================================================
-- clean-test-data.sql
--
-- Clears test activity so client testing starts from a clean system.
--
-- REMOVES: all applications (with their document readings and AI reports),
--          invites, leases, payments and notifications; every account except
--          the five demo accounts; every property except the four demo ones.
-- KEEPS:   admin@, agent@, landlord@, tenant@ and handyman@easyrent24.co.za,
--          and the four demo properties (Luxury Ocean View Apartment,
--          Spacious Family Townhouse, Chic City Center Studio,
--          Garden Cottage in Rondebosch).
--
-- Runs as one transaction: it either completes fully or changes nothing.
-- This file is NOT in db/init, so it never runs automatically.
--
-- Run (PowerShell, from the project folder):
--   Get-Content db\maintenance\clean-test-data.sql | docker exec -i easyrent-postgres psql -U easyrent -d easyrent -v ON_ERROR_STOP=1
-- ============================================================================

BEGIN;

CREATE TEMP TABLE keep_users AS
  SELECT id FROM public.users WHERE id::text ~ '^(11111111|22222222|33333333|44444444|55555555)-';
CREATE TEMP TABLE keep_props AS
  SELECT id FROM public.properties WHERE id::text ~ '^(aaaaaaaa|bbbbbbbb|cccccccc|dddddddd)-';

DELETE FROM public.leases;
DELETE FROM public.payments;
DELETE FROM public.notifications;
DELETE FROM public.tenant_invites;
DELETE FROM public.applications;
DELETE FROM public.properties WHERE id NOT IN (SELECT id FROM keep_props);
DELETE FROM public.users WHERE id NOT IN (SELECT id FROM keep_users);

COMMIT;

-- What's left (should be 5 users, 4 properties and 0 of everything else).
SELECT (SELECT count(*) FROM public.users)        AS users,
       (SELECT count(*) FROM public.properties)   AS properties,
       (SELECT count(*) FROM public.applications) AS applications,
       (SELECT count(*) FROM public.tenant_invites) AS invites,
       (SELECT count(*) FROM public.leases)       AS leases,
       (SELECT count(*) FROM public.payments)     AS payments;
