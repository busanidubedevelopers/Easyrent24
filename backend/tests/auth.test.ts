import { describe, it, expect, vi } from 'vitest';
import {
  getAuthenticatedProfile,
  requireRole,
  requireAuthenticatedRole,
  UnauthorizedError,
  ForbiddenError,
  signToken,
  type AuthenticatedProfile,
} from '../lib/auth';
import { PostgresClient } from '../lib/postgresClient';
import { toErrorResponse } from '../lib/apiError';
import * as db from '../lib/db';

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

describe('PostgresClient.auth.getUser', () => {
  it('reads the token from the client instance instead of the auth wrapper', async () => {
    const querySpy = vi.spyOn(db, 'query').mockResolvedValue({
      rows: [{ id: 'u1', email: 'lee@example.com', full_name: 'Lee', role: 'landlord', phone: null, is_verified: true }],
    } as any);

    // A real signed session token — getUser verifies it before looking the user up.
    const token = await signToken({ id: 'u1', email: 'lee@example.com', role: 'landlord' });
    const client = new PostgresClient(token);
    const result = await client.auth.getUser();

    expect(result.error).toBeNull();
    expect(result.data?.user?.id).toBe('u1');
    expect(result.data?.user?.role).toBe('landlord');
    querySpy.mockRestore();
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

  it('maps database connection errors to a 503 with a clear startup message', () => {
    const result = toErrorResponse(new Error('connect ECONNREFUSED 127.0.0.1:5432'));
    expect(result.status).toBe(503);
    expect(result.body.code).toBe('DB_UNAVAILABLE');
    expect(result.body.error).toContain('docker compose up -d db');
  });
});
