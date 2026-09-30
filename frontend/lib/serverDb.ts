import { cookies } from 'next/headers';
import { PostgresClient } from '@backend/lib/postgresClient';

/**
 * Server-side database client scoped to the current request's session.
 * Carries the session cookie so auth.getUser() resolves the caller.
 */
export async function getServerDb(): Promise<PostgresClient> {
  const cookieStore = await cookies();
  const token = cookieStore.get('easyrent_token')?.value || null;
  return new PostgresClient(token);
}
