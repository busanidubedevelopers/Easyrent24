import type { SupabaseClient } from '@supabase/supabase-js';

export type UserRole = 'tenant' | 'landlord' | 'handyman' | 'admin';

export interface AuthenticatedProfile {
  id: string;
  full_name: string | null;
  role: UserRole;
  phone: string | null;
  is_verified: boolean;
}

/**
 * Thrown when there is no valid session at all (not logged in / expired
 * token). Route handlers should catch this and respond 401.
 */
export class UnauthorizedError extends Error {
  constructor(message = 'You must be signed in to do this.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

/**
 * Thrown when the caller IS authenticated, but their role isn't allowed to
 * perform this action. Route handlers should catch this and respond 403.
 */
export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do this.") {
    super(message);
    this.name = 'ForbiddenError';
  }
}

/**
 * Resolves the currently authenticated user's profile from a request-scoped
 * Supabase client (i.e. one built from the caller's own cookies — see
 * frontend/lib/supabaseServer.ts). Throws UnauthorizedError if there is no
 * valid session, or if the session's user has no matching profiles row.
 *
 * This function is deliberately framework-agnostic (no Next.js imports) so
 * it can be unit-tested directly with a mock/real Supabase client and
 * reused if the platform ever moves beyond Next.js API routes.
 */
export async function getAuthenticatedProfile(
  supabase: SupabaseClient
): Promise<AuthenticatedProfile> {
  const { data: userData, error: userError } = await supabase.auth.getUser();

  if (userError || !userData?.user) {
    throw new UnauthorizedError();
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('id, full_name, role, phone, is_verified')
    .eq('id', userData.user.id)
    .single();

  if (profileError || !profile) {
    // A valid session but no profile row is a data-integrity problem, not a
    // "please log in" problem — but from the caller's point of view they
    // still aren't a usable authenticated user, so 401 is still correct.
    throw new UnauthorizedError('No profile found for this account.');
  }

  return profile as AuthenticatedProfile;
}

/**
 * Throws ForbiddenError if the given profile's role isn't in allowedRoles.
 * Use alongside getAuthenticatedProfile:
 *
 *   const profile = await getAuthenticatedProfile(supabase);
 *   requireRole(profile, ['landlord', 'admin']);
 */
export function requireRole(profile: AuthenticatedProfile, allowedRoles: UserRole[]): void {
  if (!allowedRoles.includes(profile.role)) {
    throw new ForbiddenError(
      `This action requires one of these roles: ${allowedRoles.join(', ')}. Your role: ${profile.role}.`
    );
  }
}

/**
 * Convenience helper combining both checks in one call, for the common case
 * of "must be logged in AND must have one of these roles".
 */
export async function requireAuthenticatedRole(
  supabase: SupabaseClient,
  allowedRoles: UserRole[]
): Promise<AuthenticatedProfile> {
  const profile = await getAuthenticatedProfile(supabase);
  requireRole(profile, allowedRoles);
  return profile;
}
