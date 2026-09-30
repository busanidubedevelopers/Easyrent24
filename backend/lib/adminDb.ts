import { PostgresClient } from './postgresClient';

let cachedClient: PostgresClient | null = null;

/**
 * Server-only database client with full access (no per-user scoping).
 * Use only after the route has checked the caller may act on the rows.
 */
export function getAdminDb(): PostgresClient {
  if (typeof (globalThis as any).window !== 'undefined') {
    throw new Error('FATAL SECURITY VIOLATION: getAdminDb cannot be imported into client-side bundle.');
  }

  if (!cachedClient) {
    cachedClient = new PostgresClient(null);
  }

  return cachedClient;
}
