import { describe, it, expect } from 'vitest';
import {
  getAuthenticatedProfile,
  requireRole,
  requireAuthenticatedRole,
  UnauthorizedError,
  ForbiddenError,
  type AuthenticatedProfile,
} from '../lib/auth';
import { toErrorResponse } from '../lib/apiError';

// Minimal mock of the subset of SupabaseClient these functions actually use.
function mockClient(opts: { user: unknown; profile: unknown; profileError?: unknown }) {
  return {
    auth: {
      getUser: async () => ({
        data: { user: opts.user },
        error: opts.user ? null : { message: 'no session' },
      }),
    },
    from: (_table: string) => ({
      select: (_cols: string) => ({
        eq: (_col: string, _val: string) => ({
          single: async () => ({ data: opts.profile, error: opts.profileError ?? null }),
        }),
      }),
    }),
  } as any;
}

describe('getAuthenticatedProfile', () => {
  it('throws UnauthorizedError when there is no session', async () => {
    await expect(getAuthenticatedProfile(mockClient({ user: null, profile: null }))).rejects.toThrow(
      UnauthorizedError
    );
  });

  it('returns the profile when session and profile both exist', async () => {
    const landlordProfile: AuthenticatedProfile = {
      id: 'u1',
      full_name: 'Lee',
      role: 'landlord',
      phone: null,
      is_verified: true,
    };
    const profile = await getAuthenticatedProfile(mockClient({ user: { id: 'u1' }, profile: landlordProfile }));
    expect(profile.role).toBe('landlord');
  });

  it('throws UnauthorizedError when session exists but no profile row does', async () => {
    await expect(
      getAuthenticatedProfile(
        mockClient({ user: { id: 'u2' }, profile: null, profileError: { message: 'not found' } })
      )
    ).rejects.toThrow(UnauthorizedError);
  });
});

describe('requireRole', () => {
  const landlord: AuthenticatedProfile = { id: 'u1', full_name: 'Lee', role: 'landlord', phone: null, is_verified: true };
  const tenant: AuthenticatedProfile = { id: 'u3', full_name: 'Tina', role: 'tenant', phone: null, is_verified: true };

  it('does not throw when role is allowed', () => {
    expect(() => requireRole(landlord, ['landlord', 'admin'])).not.toThrow();
  });

  it('throws ForbiddenError when role is not allowed', () => {
    expect(() => requireRole(tenant, ['landlord', 'admin'])).toThrow(ForbiddenError);
  });
});

describe('requireAuthenticatedRole', () => {
  it('combines both checks — blocks a wrong-role user even with a valid session', async () => {
    const tenant: AuthenticatedProfile = { id: 'u3', full_name: 'Tina', role: 'tenant', phone: null, is_verified: true };
    await expect(
      requireAuthenticatedRole(mockClient({ user: { id: 'u3' }, profile: tenant }), ['landlord', 'admin'])
    ).rejects.toThrow(ForbiddenError);
  });
});

describe('toErrorResponse', () => {
  it('maps UnauthorizedError to 401, ForbiddenError to 403, generic Error to 500', () => {
    expect(toErrorResponse(new UnauthorizedError()).status).toBe(401);
    expect(toErrorResponse(new ForbiddenError()).status).toBe(403);
    expect(toErrorResponse(new Error('boom')).status).toBe(500);
  });
});
