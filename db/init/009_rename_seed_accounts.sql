-- ============================================================================
-- 009_rename_seed_accounts.sql
--
-- The seeded accounts get realistic names and logins, so nothing on screen
-- (names on leases, signatures, account lists) says "demo". Passwords are
-- unchanged ("Password123!"). Matched by id, so it's safe to run again.
--
--   docker exec -i easyrent-postgres psql -U easyrent -d easyrent < db/init/009_rename_seed_accounts.sql
-- ============================================================================

UPDATE public.users AS u
   SET email = v.email, full_name = v.full_name, updated_at = now()
  FROM (VALUES
    ('11111111-1111-4111-a111-111111111111'::uuid, 'landlord@easyrent24.co.za', 'Sipho Ndlovu'),
    ('22222222-2222-4222-a222-222222222222'::uuid, 'tenant@easyrent24.co.za',   'Nomsa Khumalo'),
    ('33333333-3333-4333-a333-333333333333'::uuid, 'agent@easyrent24.co.za',    'Lindiwe Mthembu'),
    ('44444444-4444-4444-a444-444444444444'::uuid, 'handyman@easyrent24.co.za', 'Johan van Wyk'),
    ('55555555-5555-4555-a555-555555555555'::uuid, 'admin@easyrent24.co.za',    'EasyRent Super Admin')
  ) AS v(id, email, full_name)
 WHERE u.id = v.id;

-- profiles is a synced subset of users (no email).
UPDATE public.profiles AS p
   SET full_name = u.full_name
  FROM public.users AS u
 WHERE p.id = u.id
   AND u.id IN ('11111111-1111-4111-a111-111111111111', '22222222-2222-4222-a222-222222222222',
                '33333333-3333-4333-a333-333333333333', '44444444-4444-4444-a444-444444444444',
                '55555555-5555-4555-a555-555555555555');
