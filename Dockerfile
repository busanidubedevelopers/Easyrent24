# ============================================================================
# EasyRent24 — Production Dockerfile
#
# IMPORTANT: the build context for this Dockerfile must be the MONOREPO
# ROOT (the folder containing both frontend/ and backend/), not frontend/
# itself. That's because frontend/ imports shared code from ../backend via
# the @backend/* path alias (see frontend/tsconfig.json), so the build
# stage needs both folders present with their sibling structure intact.
#
# Build from the repo root with:
#   docker build -f Dockerfile -t easyrent24 .
#
# VERIFIED (see backend/README.md "Docker" section for the full story):
# backend/ is a BUILD-TIME dependency only. Next.js's webpack bundler
# inlines the compiled backend/lib code directly into each API route's
# output chunk — confirmed by grepping the compiled output for literal
# strings from backend/lib/payfast.ts and finding them present. This means
# the final runtime image does NOT need to include backend/ at all, only
# the build stage does. That's why the last stage below only copies
# frontend's own standalone output, not backend/.
# ============================================================================

# ---- Stage 1: install dependencies for both frontend and backend --------
FROM node:20-alpine AS deps
WORKDIR /repo

COPY frontend/package.json frontend/package-lock.json* ./frontend/
RUN cd frontend && npm ci --legacy-peer-deps

COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm ci --legacy-peer-deps

# ---- Stage 2: build the Next.js app --------------------------------------
FROM node:20-alpine AS builder
WORKDIR /repo

COPY --from=deps /repo/frontend/node_modules ./frontend/node_modules
COPY --from=deps /repo/backend/node_modules ./backend/node_modules
COPY frontend ./frontend
COPY backend ./backend

# Build-time env vars for anything next build needs baked into the client
# bundle (NEXT_PUBLIC_* only — never pass real secrets here, they'd end up
# visible in the image layers and the browser bundle). Pass these via
# --build-arg at build time.
ARG NEXT_PUBLIC_SUPABASE_URL
ARG NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_PUBLIC_SUPABASE_URL=$NEXT_PUBLIC_SUPABASE_URL
ENV NEXT_PUBLIC_SUPABASE_ANON_KEY=$NEXT_PUBLIC_SUPABASE_ANON_KEY
ENV NEXT_TELEMETRY_DISABLED=1

RUN cd frontend && npm run build

# ---- Stage 3: lean runtime image ------------------------------------------
FROM node:20-alpine AS runner
WORKDIR /app

ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=3000
ENV HOSTNAME=0.0.0.0

# Run as a non-root user — a container running as root is a real,
# unnecessary privilege-escalation risk if the app is ever compromised.
RUN addgroup --system --gid 1001 nodejs && adduser --system --uid 1001 nextjs

# Only frontend's own standalone output is needed here — see the note at
# the top of this file for why backend/ doesn't need to be copied in.
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/.next/standalone ./
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/.next/static ./.next/static
COPY --from=builder --chown=nextjs:nodejs /repo/frontend/public ./public

USER nextjs

EXPOSE 3000

# This is what AWS App Runner (or any orchestrator) should poll to confirm
# the container is alive — see frontend/app/api/health/route.ts.
HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:3000/api/health || exit 1

CMD ["node", "server.js"]
