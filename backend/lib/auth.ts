import { jwtVerify, SignJWT } from 'jose';
import { query } from './db';

export type UserRole = 'tenant' | 'landlord' | 'handyman' | 'admin';

export interface AuthenticatedProfile {
  id: string;
  email?: string;
  full_name: string | null;
  role: UserRole;
  phone: string | null;
  services_offered?: string[];
  experience_years?: number;
  certifications?: string[];
  is_verified: boolean;
  approval_status?: ApprovalStatus;
}

export type ApprovalStatus = 'pending' | 'approved' | 'rejected';

/** Landlord and agent accounts need a super admin's approval; everyone else is approved on signup. */
export function needsApproval(role: UserRole): boolean {
  return role === 'landlord';
}

/** The message an unapproved account sees, or null when it may sign in. */
export function approvalBlockMessage(status: string | null | undefined, reason?: string | null): string | null {
  if (!status || status === 'approved') return null;
  if (status === 'rejected') {
    return `Your account was not approved by EasyRent.${reason ? ` Reason: ${reason}` : ''} Contact support@easyrent24.co.za if you think this is a mistake.`;
  }
  return 'Your account is awaiting approval by an EasyRent administrator. You can sign in once it has been approved.';
}

function assertApproved(status: string | null | undefined): void {
  const message = approvalBlockMessage(status);
  if (message) throw new ForbiddenError(message);
}

export class UnauthorizedError extends Error {
  constructor(message = 'You must be signed in to do this.') {
    super(message);
    this.name = 'UnauthorizedError';
  }
}

export class ForbiddenError extends Error {
  constructor(message = "You don't have permission to do this.") {
    super(message);
    this.name = 'ForbiddenError';
  }
}

const JWT_SECRET_STRING =
  process.env.JWT_SECRET || 'easyrent-secret-key-32-characters-minimum-length-key!';

const JWT_SECRET = new TextEncoder().encode(JWT_SECRET_STRING);

async function getUserProfileById(id: string): Promise<AuthenticatedProfile> {
  try {
    const res = await query(
      'SELECT id, email, full_name, role, phone, services_offered, experience_years, certifications, is_verified, approval_status FROM public.users WHERE id = $1',
      [id]
    );

    if (res.rows.length === 0) {
      throw new UnauthorizedError('No user account found for this session.');
    }

    const row = res.rows[0];
    assertApproved(row.approval_status);
    return {
      id: row.id,
      email: row.email,
      full_name: row.full_name,
      role: row.role as UserRole,
      phone: row.phone,
      services_offered: Array.isArray(row.services_offered) ? row.services_offered : [],
      experience_years: Number(row.experience_years) || 0,
      certifications: Array.isArray(row.certifications) ? row.certifications : [],
      is_verified: !!row.is_verified,
      approval_status: row.approval_status ?? 'approved',
    };
  } catch (error) {
    if (error instanceof UnauthorizedError || error instanceof ForbiddenError) {
      throw error;
    }

    const message = error instanceof Error ? error.message : String(error ?? '');
    if (message.includes('invalid input syntax for type uuid') || message.includes('uuid')) {
      throw new UnauthorizedError('No user account found for this session.');
    }

    throw error;
  }
}

export async function signToken(payload: {
  id: string;
  email: string;
  role: UserRole;
  full_name?: string | null;
}): Promise<string> {
  return new SignJWT({
    id: payload.id,
    email: payload.email,
    role: payload.role,
    full_name: payload.full_name || null,
  })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(payload.id)
    .setIssuedAt()
    .setExpirationTime('7d')
    .sign(JWT_SECRET);
}

export async function verifyToken(token: string): Promise<{
  id: string;
  email: string;
  role: UserRole;
  full_name?: string | null;
}> {
  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    return {
      id: (payload.id as string) || (payload.sub as string),
      email: payload.email as string,
      role: payload.role as UserRole,
      full_name: (payload.full_name as string) || null,
    };
  } catch {
    throw new UnauthorizedError('Invalid or expired session token.');
  }
}

/**
 * Extract token string from Request (cookie or Authorization header) or direct token string
 */
export function extractToken(input?: any): string | null {
  if (!input) return null;
  if (typeof input === 'string') return input;

  if (typeof input.headers?.get === 'function') {
    const authHeader = input.headers.get('authorization');
    if (authHeader && authHeader.toLowerCase().startsWith('bearer ')) {
      return authHeader.substring(7).trim();
    }

    const cookieHeader = input.headers.get('cookie');
    if (cookieHeader) {
      const match = cookieHeader.match(/(?:^|;\s*)easyrent_token=([^;]+)/);
      if (match) {
        return decodeURIComponent(match[1]);
      }
    }
  }

  return null;
}

/**
 * Resolves user profile from client, request, or token
 */
export async function getAuthenticatedProfile(
  input?: any
): Promise<AuthenticatedProfile> {
  // 1. If input is a client object with auth.getUser() (Supabase client or PostgresClient)
  if (input && typeof input === 'object' && typeof input.auth?.getUser === 'function') {
    const tokenToUse = typeof input.token === 'string' && input.token ? input.token : undefined;
    const { data, error } = await input.auth.getUser(tokenToUse);
    if (error || !data?.user) {
      throw new UnauthorizedError();
    }

    if (typeof input.from === 'function') {
      try {
        // `users` is the canonical account table (it has email and the
        // handyman fields); `profiles` is a synced subset without email.
        const { data: profile, error: profileError } = await input
          .from('users')
          .select('id, email, full_name, role, phone, services_offered, experience_years, certifications, is_verified, approval_status')
          .eq('id', data.user.id)
          .single();

        if (!profileError && profile) {
          assertApproved(profile.approval_status);
          return {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            role: profile.role as UserRole,
            phone: profile.phone,
            services_offered: Array.isArray(profile.services_offered) ? profile.services_offered : [],
            experience_years: Number(profile.experience_years) || 0,
            certifications: Array.isArray(profile.certifications) ? profile.certifications : [],
            is_verified: !!profile.is_verified,
            approval_status: profile.approval_status ?? 'approved',
          };
        }
      } catch (err) {
        if (err instanceof ForbiddenError) throw err;
        // Some environments do not have a synced `profiles` row yet. Fall back
        // to the canonical user table instead of rejecting a valid session.
      }
    }

    return getUserProfileById(data.user.id);
  }

  // 2. Otherwise extract token from Request or direct string
  const token = extractToken(input);
  if (!token) {
    throw new UnauthorizedError();
  }

  const decoded = await verifyToken(token);

  return getUserProfileById(decoded.id);
}

export function requireRole(
  profile: AuthenticatedProfile,
  allowedRoles: UserRole[]
): void {
  if (!allowedRoles.includes(profile.role)) {
    throw new ForbiddenError(
      `This action requires one of these roles: ${allowedRoles.join(', ')}. Your role: ${profile.role}.`
    );
  }
}

export async function requireAuthenticatedRole(
  input: any,
  allowedRoles: UserRole[]
): Promise<AuthenticatedProfile> {
  const profile = await getAuthenticatedProfile(input);
  requireRole(profile, allowedRoles);
  return profile;
}
