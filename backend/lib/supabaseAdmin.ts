import { createClient, SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client using the service_role key.
 *
 * This bypasses Row Level Security entirely — it must NEVER be imported into
 * any file that runs in the browser (no 'use client' components, no
 * NEXT_PUBLIC_ files). It is intended to be imported only from:
 *   - Next.js API routes (frontend/app/api/**\/route.ts)
 *   - Server Components / Server Actions
 *   - Backend scripts (backend/tests, backend/scripts)
 *
 * Required env vars (server-side only, never prefixed with NEXT_PUBLIC_):
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Today these come from a plain .env.local. In Phase 1 Task 2, this key
 * moves into AWS Secrets Manager — when that happens, only the code that
 * *reads* these two values changes; nothing that imports this file needs
 * to change.
 */

let cachedKey: string | undefined;
let cachedClient: SupabaseClient | null = null;

export function getSupabaseAdmin(): SupabaseClient {
  if (typeof (globalThis as any).window !== 'undefined') {
    throw new Error('FATAL SECURITY VIOLATION: supabaseAdmin cannot be imported into client-side bundle.');
  }

  const url = process.env.SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !serviceRoleKey) {
    throw new Error(
      'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY. ' +
      'These are server-only secrets — set them in frontend/.env.local for ' +
      'local dev (see backend/docs/ENVIRONMENT.md), never in NEXT_PUBLIC_* vars.'
    );
  }

  // Re-create the client if the key has been rotated so stale credentials
  // are never used after an AWS Secrets Manager rotation event.
  if (cachedClient && cachedKey === serviceRoleKey) return cachedClient;

  cachedKey = serviceRoleKey;
  cachedClient = createClient(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  return cachedClient;
}
