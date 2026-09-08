import { createBrowserClient } from '@supabase/ssr';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  throw new Error('Missing Supabase environment variables. Please check your frontend/.env.local file.');
}

/**
 * Browser Supabase client.
 *
 * This client must talk to the real configured Supabase project so auth and
 * database requests are authenticated correctly.
 */
export const supabase = createBrowserClient(supabaseUrl, supabaseKey);
