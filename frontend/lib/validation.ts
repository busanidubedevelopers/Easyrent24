/**
 * Shared validation utilities for API routes.
 */

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Returns true if value is a well-formed UUID v4 string.
 * Use this to validate every route [id] param before passing it to
 * Supabase — a non-UUID value will produce a raw Postgres type error
 * that leaks schema details to the caller.
 */
export function isValidUUID(value: string): boolean {
  return UUID_RE.test(value);
}
