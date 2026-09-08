import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../app/api/auth/me/route';
import { UnauthorizedError } from '../../../backend/lib/auth';

// Route imports @/lib/supabaseServer and @backend/lib/auth.
// We mock both so no real Supabase connection is needed.
vi.mock('../../lib/supabaseServer', () => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock('../../../backend/lib/auth', async (importOriginal) => {
  // Keep real error classes so toErrorResponse instanceof checks still work.
  const real = await importOriginal<typeof import('../../../backend/lib/auth')>();
  return { ...real, getAuthenticatedProfile: vi.fn() };
});

// Pull the mocked functions out once so each test can configure them.
const { getSupabaseServerClient } = await import('../../lib/supabaseServer');
const { getAuthenticatedProfile } = await import('../../../backend/lib/auth');

const mockProfile = {
  id: 'user-abc',
  full_name: 'Alice Applicant',
  role: 'tenant' as const,
  phone: null,
  is_verified: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  // Default: return a dummy client object; tests override getAuthenticatedProfile directly.
  vi.mocked(getSupabaseServerClient).mockResolvedValue({} as any);
});

describe('GET /api/auth/me', () => {
  it('returns 200 with the authenticated profile', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(mockProfile);

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.profile).toEqual(mockProfile);
  });

  it('returns 401 when there is no session', async () => {
    vi.mocked(getAuthenticatedProfile).mockRejectedValue(
      new UnauthorizedError('You must be signed in to do this.')
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('You must be signed in to do this.');
  });

  it('returns 401 when the session user has no profiles row', async () => {
    vi.mocked(getAuthenticatedProfile).mockRejectedValue(
      new UnauthorizedError('No profile found for this account.')
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(401);
    expect(body.error).toBe('No profile found for this account.');
  });

  it('returns 500 for unexpected errors without leaking details', async () => {
    vi.mocked(getAuthenticatedProfile).mockRejectedValue(
      new Error('pg: connection refused')
    );

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    // toErrorResponse deliberately hides internal messages
    expect(body.error).toBe('Something went wrong. Please try again.');
  });
});
