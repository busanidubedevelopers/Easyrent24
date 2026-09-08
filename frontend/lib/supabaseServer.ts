import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';

/**
 * Server-side Supabase client, scoped to the current request's cookies.
 *
 * Use this in:
 *   - API routes (frontend/app/api/**\/route.ts)
 *   - Server Components
 *   - Server Actions
 *
 * This client acts AS THE LOGGED-IN USER (respects RLS) — it is not the
 * admin client. For privileged operations that must bypass RLS, use
 * @backend/lib/supabaseAdmin instead.
 *
 * Must be called fresh on every request (it reads the request's cookies),
 * so don't cache the return value across requests the way supabaseAdmin
 * caches its client.
 */
export async function getSupabaseServerClient() {
  const cookieStore = await cookies();

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

  return createServerClient(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // setAll is called from a Server Component in some cases, where
          // cookies can't be written. Safe to ignore if middleware.ts is
          // refreshing sessions (which it is — see frontend/middleware.ts).
        }
      },
    },
  });
}
