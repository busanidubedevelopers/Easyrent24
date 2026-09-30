# Environment Variables

The app runs on **PostgreSQL + Next.js** (see `docker-compose.yml`). For local
`npm run dev`, variables live in **`frontend/.env.local`** (Next.js only loads
`.env.local` from its own project root); `backend/` code reads them because
it's imported *into* the frontend process — it never runs standalone. Under
Docker, `docker-compose.yml` sets them on the `app` service.

## Client-side (safe to expose to the browser)

Bundled into the JS sent to the browser. Never put secrets here.

| Variable | Purpose |
|---|---|
| `NEXT_PUBLIC_APP_URL` | Public URL of the app. Used for PayFast return/cancel/notify URLs, links in emails, and the CSRF origin check. Must be reachable by PayFast for ITN (use ngrok locally — `LOCAL_TESTING_NGROK.md`) |

## Server-only (NEVER prefix with `NEXT_PUBLIC_`)

Only read from API routes, Server Components, or backend/ code. If one of these
ever gets a `NEXT_PUBLIC_` prefix by accident it leaks into the browser bundle —
treat that as a security incident.

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string (`backend/lib/db.ts`). Inside docker-compose the host is `db`, not `localhost` |
| `JWT_SECRET` | Signs session cookies (`backend/lib/auth.ts`). At least 32 characters; must be the same everywhere the app runs |
| `UPLOAD_DIR` | Where uploaded documents and signed lease PDFs are stored on disk. Defaults to `./uploads` (`/app/uploads` volume in Docker) |
| `PAYFAST_MODE` | `sandbox` or `live`. In `sandbox`, payments can also be confirmed from PayFast's return redirect (localhost demos); in `live`, only the verified ITN webhook marks anything paid |
| `PAYFAST_MERCHANT_ID` | PayFast merchant ID |
| `PAYFAST_MERCHANT_KEY` | PayFast merchant key |
| `PAYFAST_PASSPHRASE` | PayFast signature passphrase |
| `RESEND_API_KEY` | Transactional email via Resend (`backend/lib/email.ts`): invite links, lease sent/signed/withdrawn. Without it (or `EMAIL_FROM`), emails are skipped and logged; in-app notifications and copyable links still work |
| `EMAIL_FROM` | Sender, e.g. `EasyRent24 <no-reply@easyrent24.co.za>` — the domain must be verified in Resend |
| `ANTHROPIC_API_KEY` | Claude API key (console.anthropic.com → API Keys). Switches on (1) Claude reading uploaded documents, including scans and photos (`backend/lib/extraction.ts`), and (2) the AI analyst report on each application (`backend/lib/aiAnalyst.ts`). Without it, digital PDFs are read by the built-in reader (`backend/lib/localExtraction.ts`), the rule-based affordability assessment works as normal, and the AI analyst shows "not set up" |

## Database schema

`db/init/*.sql` runs automatically when the Postgres volume is first created.
To apply a new file to an existing database:

```bash
docker exec -i easyrent-postgres psql -U easyrent -d easyrent < db/init/003_invites_extraction_leases.sql
```

The files are idempotent (`IF NOT EXISTS`). There is no row-level security:
every API route checks the caller's access in code (see
`backend/lib/applicationAccess.ts` and `backend/lib/leaseRecords.ts`).

## Before production

`JWT_SECRET`, `DATABASE_URL`, PayFast and API keys move into **AWS Secrets
Manager**, fetched at container startup — never committed to git, never in a
plain-text file on the server. That change is in the deployment layer only.

## Local setup checklist

1. `docker compose up -d` (starts Postgres and the app on http://localhost:3000)
2. For `npm run dev` instead: copy `frontend/.env.local.example` to `frontend/.env.local` and keep `DATABASE_URL` pointing at `localhost:5432`
3. Never commit `.env.local` — it's already in `.gitignore`
4. `node local-e2e-lease-flow.mjs` checks the invite → lease flow end to end
