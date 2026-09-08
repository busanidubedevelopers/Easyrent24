# Environment Variables

All environment variables live in **`frontend/.env.local`** (not in `backend/`,
since Next.js only loads `.env.local` from its own project root). `backend/`
code still uses these because it's imported *into* the frontend process at
runtime — it never runs standalone in production.

## Client-side (safe to expose to the browser)

These are bundled into the JS sent to the browser. Never put secrets here.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | Your Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public anon key — safe to expose, RLS still applies |

## Server-only (NEVER prefix with `NEXT_PUBLIC_`)

These must only be read from API routes, Server Components, or backend/
scripts. If a variable here ever gets a `NEXT_PUBLIC_` prefix by accident, it
will leak into the browser bundle — treat that as a security incident.

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Same project URL as above, read server-side |
| `SUPABASE_SERVICE_ROLE_KEY` | **Bypasses RLS entirely.** Used by `backend/lib/supabaseAdmin.ts`. Get this from Supabase dashboard → Settings → API → `service_role` secret |
| `PAYFAST_MERCHANT_ID` | PayFast merchant ID (once sandbox account is set up) |
| `PAYFAST_MERCHANT_KEY` | PayFast merchant key |
| `PAYFAST_PASSPHRASE` | PayFast ITN signature passphrase |

## Where this is going (Phase 1, Task 2)

Right now these all sit in a plain `.env.local` file, which is fine for local
development. Before production, `SUPABASE_SERVICE_ROLE_KEY` and the PayFast
credentials move into **AWS Secrets Manager**, fetched at container startup
on App Runner — never committed to git, never sitting in a plain-text file on
the server. That change happens in the deployment layer only; none of the
code that calls `getSupabaseAdmin()` needs to change when it does.

## Local setup checklist

1. Copy `frontend/.env.local.example` to `frontend/.env.local`
2. Fill in the Supabase values (URL + both keys) from your Supabase dashboard
3. Never commit `.env.local` — it's already in `.gitignore`
