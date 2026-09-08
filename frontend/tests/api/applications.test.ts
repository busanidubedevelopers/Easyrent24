import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../../app/api/applications/route';
import { UnauthorizedError } from '../../../backend/lib/auth';

vi.mock('../../lib/supabaseServer', () => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock('../../../backend/lib/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/auth')>();
  return { ...real, getAuthenticatedProfile: vi.fn() };
});

vi.mock('../../../backend/lib/applications', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/applications')>();
  return { ...real, validateApplicationInput: vi.fn() };
});

const { getSupabaseServerClient } = await import('../../lib/supabaseServer');
const { getAuthenticatedProfile } = await import('../../../backend/lib/auth');
const { validateApplicationInput } = await import('../../../backend/lib/applications');

const mockProfile = {
  id: 'user-abc',
  full_name: 'Alice Applicant',
  role: 'tenant' as const,
  phone: null,
  is_verified: false,
};

const mockApplication = {
  id: 'app-001',
  applicant_id: 'user-abc',
  first_name: 'Alice',
  last_name: 'Applicant',
  status: 'pending',
  created_at: '2026-09-04T10:00:00Z',
};

const validBody = {
  first_name: 'Alice',
  last_name: 'Applicant',
  consent_credit: true,
  consent_id_check: true,
  consent_bank_statements: true,
};

function makeRequest(method: string, url: string, body?: unknown): NextRequest {
  return new NextRequest(url, {
    method,
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json' },
  });
}

// ── helpers to build a chainable Supabase query mock ──────────────────────────

/** Returns a mock that chains .order() and optional .eq() and resolves to result. */
function mockSelectChain(result: { data: unknown; error: unknown }) {
  const chain: any = {
    order: vi.fn().mockReturnThis(),
    eq: vi.fn().mockReturnThis(),
    then: undefined,
  };
  // Make the chain thenable so `await query` resolves to result.
  chain.order.mockReturnValue({ ...chain, ...result });
  chain.eq.mockReturnValue({ ...chain, ...result });
  // The final awaited value is the result itself.
  return { select: vi.fn().mockReturnValue({ ...chain, ...result }) };
}

/** Returns a mock that chains .select().single() for inserts. */
function mockInsertChain(result: { data: unknown; error: unknown }) {
  const singleMock = vi.fn().mockResolvedValue(result);
  const selectMock = vi.fn().mockReturnValue({ single: singleMock });
  return { insert: vi.fn().mockReturnValue({ select: selectMock }) };
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedProfile).mockResolvedValue(mockProfile);
  vi.mocked(validateApplicationInput).mockReturnValue({ valid: true, errors: [] });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/applications', () => {
  it('returns 200 with applications list for authenticated user', async () => {
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({ data: [mockApplication], error: null }),
        }),
      }),
    } as any);

    const req = makeRequest('GET', 'http://localhost:3000/api/applications');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.applications).toHaveLength(1);
    expect(body.applications[0].id).toBe('app-001');
  });

  it('narrows by property_id when the query param is present and is a valid UUID', async () => {
    const eqMock = vi.fn().mockResolvedValue({ data: [mockApplication], error: null });
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockReturnValue({ eq: eqMock }),
        }),
      }),
    } as any);

    const validUUID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
    const req = makeRequest('GET', `http://localhost:3000/api/applications?property_id=${validUUID}`);
    await GET(req);

    expect(eqMock).toHaveBeenCalledWith('property_id', validUUID);
  });

  it('returns 400 when property_id is not a valid UUID', async () => {
    vi.mocked(getSupabaseServerClient).mockResolvedValue({} as any);

    const req = makeRequest('GET', 'http://localhost:3000/api/applications?property_id=not-a-uuid');
    const res = await GET(req);

    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.error).toMatch(/invalid property_id/i);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSupabaseServerClient).mockResolvedValue({} as any);
    vi.mocked(getAuthenticatedProfile).mockRejectedValue(
      new UnauthorizedError()
    );

    const req = makeRequest('GET', 'http://localhost:3000/api/applications');
    const res = await GET(req);

    expect(res.status).toBe(401);
  });

  it('returns 500 with a generic message when the database query fails', async () => {
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockReturnValue({
          order: vi.fn().mockResolvedValue({
            data: null,
            error: { message: 'relation does not exist' },
          }),
        }),
      }),
    } as any);

    const req = makeRequest('GET', 'http://localhost:3000/api/applications');
    const res = await GET(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    // Raw DB message must NOT be forwarded to the client.
    expect(body.error).toBe('Something went wrong. Please try again.');
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/applications', () => {
  it('returns 201 with the created application on valid input', async () => {
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({ data: mockApplication, error: null }),
          }),
        }),
      }),
    } as any);

    const req = makeRequest('POST', 'http://localhost:3000/api/applications', validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.application.id).toBe('app-001');
  });

  it('sets applicant_id to the authenticated profile id', async () => {
    const insertMock = vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        single: vi.fn().mockResolvedValue({ data: mockApplication, error: null }),
      }),
    });
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as any);

    const req = makeRequest('POST', 'http://localhost:3000/api/applications', validBody);
    await POST(req);

    const insertedRows = insertMock.mock.calls[0][0] as any[];
    expect(insertedRows[0].applicant_id).toBe('user-abc');
    expect(insertedRows[0].status).toBe('pending');
  });

  it('returns 400 with validation errors when input is invalid', async () => {
    vi.mocked(validateApplicationInput).mockReturnValue({
      valid: false,
      errors: ['First name is required.', 'Consent to credit check is required.'],
    });
    vi.mocked(getSupabaseServerClient).mockResolvedValue({} as any);

    const req = makeRequest('POST', 'http://localhost:3000/api/applications', {});
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toBe('Invalid input.');
    expect(body.details).toContain('First name is required.');
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getSupabaseServerClient).mockResolvedValue({} as any);
    vi.mocked(getAuthenticatedProfile).mockRejectedValue(new UnauthorizedError());

    const req = makeRequest('POST', 'http://localhost:3000/api/applications', validBody);
    const res = await POST(req);

    expect(res.status).toBe(401);
  });

  it('returns 500 with a generic message when the database insert fails', async () => {
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockReturnValue({
          select: vi.fn().mockReturnValue({
            single: vi.fn().mockResolvedValue({
              data: null,
              error: { message: 'unique constraint violation' },
            }),
          }),
        }),
      }),
    } as any);

    const req = makeRequest('POST', 'http://localhost:3000/api/applications', validBody);
    const res = await POST(req);
    const body = await res.json();

    expect(res.status).toBe(500);
    // Raw DB message must NOT be forwarded to the client.
    expect(body.error).toBe('Something went wrong. Please try again.');
  });
});
