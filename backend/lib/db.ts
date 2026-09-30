import { Pool, QueryResult, QueryResultRow, types } from 'pg';

// Return dates and timestamps as strings, the way Supabase/PostgREST did and
// the rest of the app expects. node-postgres' default turns `date` columns
// into local-midnight Date objects, which silently shifts lease start dates
// (and the lease text both signatures are bound to) across timezones.
types.setTypeParser(types.builtins.DATE, (value: string) => value);
types.setTypeParser(types.builtins.TIMESTAMPTZ, (value: string) => new Date(value).toISOString());

const globalForDb = globalThis as unknown as {
  pool: Pool | undefined;
};

const connectionString =
  process.env.DATABASE_URL ||
  'postgresql://easyrent:easyrent_dev_password@localhost:5432/easyrent';

export const pool =
  globalForDb.pool ??
  new Pool({
    connectionString,
    max: 20,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 5000,
  });

if (process.env.NODE_ENV !== 'production') {
  globalForDb.pool = pool;
}

export function isDatabaseUnavailableError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error ?? '');
  const normalized = message.toLowerCase();

  const dbUnavailableIndicators = [
    'econnrefused',
    'connect timeout',
    'timeout exceeded',
    'could not connect to server',
    'database system is starting up',
    'password authentication failed',
    'role \\"easyrent\\" does not exist',
    'relation \"public.users\" does not exist',
    'function gen_random_uuid() does not exist',
    'relation \"users\" does not exist',
  ];

  return dbUnavailableIndicators.some((indicator) => normalized.includes(indicator));
}

export function getDatabaseUnavailableMessage(error: unknown): string {
  if (isDatabaseUnavailableError(error)) {
    return 'Database is unavailable or the schema is not initialized. Start PostgreSQL with "docker compose up -d db" and confirm DATABASE_URL.';
  }

  return 'Database is unavailable. Please check the PostgreSQL connection and schema setup.';
}

export async function query<T extends QueryResultRow = any>(
  text: string,
  params?: any[]
): Promise<QueryResult<T>> {
  return pool.query<T>(text, params);
}

export default {
  query,
  pool,
  isDatabaseUnavailableError,
  getDatabaseUnavailableMessage,
};
