import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/applications/[id]/pay/route';
import { UnauthorizedError, ForbiddenError } from '../../../backend/lib/auth';

vi.mock('../../lib/supabaseServer', () => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock('../../../backend/lib/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/auth')>();
  return { ...real, getAuthenticatedProfile: vi.fn() };
});

vi.mock('../../../backend/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const { getSupabaseServerClient } = await import('../../lib/supabaseServer');
const { getAuthenticatedProfile } = await import('../../../backend/lib/auth');
const { getSupabaseAdmin } = await import('../../../backend/lib/supabaseAdmin');

const APP_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const USER_ID = 'b1ccdc00-0d1c-5fg9-cc7e-7ccace491b22';

const mockProfile = {
  id: USER_ID,
  full_name: 'Alice Applicant',
  role: 'tenant' as const,
  phone: null,
  is_verified: false,
};

const mockApplication = {
  id: APP_ID,
  applicant_id: USER_ID,
  application_fee_amount: 250,
  payment_status: 'pending',
  first_name: 'Alice',
  last_name: 'Applicant',
};

function makePostRequest(appId: string): NextRequest {
  return new NextRequest(`http://localhost:3000/api/applications/${appId}/pay`, {
    method: 'POST',
  });
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}
function mockServerClientWithApp(app: object | null, dbError: object | null = null) {
  const maybeSingleMock = vi.fn().mockResolvedValue({ data: app, error: dbError });
  const updateMock = vi.fn().mockReturnValue({
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
  });
  vi.mocked(getSupabaseServerClient).mockResolvedValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock }),
      }),
      update: updateMock,
    }),
  } as any);
}

// Helper: mock the admin client for inserting a payment record.
function mockAdminClient(insertError: object | null = null) {
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: vi.fn().mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: insertError }),
    }),
  } as any);
}

// Restore env vars after each test so they don't bleed across.
const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getAuthenticatedProfile).mockResolvedValue(mockProfile);
  // Save and set required env vars.
  for (const k of ['PAYFAST_MERCHANT_ID', 'PAYFAST_MERCHANT_KEY', 'PAYFAST_PASSPHRASE',
                    'PAYFAST_MODE', 'NEXT_PUBLIC_APP_URL']) {
    savedEnv[k] = process.env[k];
  }
  process.env.PAYFAST_MERCHANT_ID = '10000100';
  process.env.PAYFAST_MERCHANT_KEY = 'mk_test_abc';
  process.env.PAYFAST_PASSPHRASE = 'test-passphrase';
  process.env.PAYFAST_MODE = 'sandbox';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/applications/[id]/pay', () => {
  it('returns 200 with PayFast processUrl and signed fields', async () => {
    mockServerClientWithApp(mockApplication);
    mockAdminClient();

    const res = await POST(makePostRequest(APP_ID), routeParams(APP_ID) as any);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.processUrl).toContain('sandbox.payfast.co.za');
    expect(body.fields.merchant_id).toBe('10000100');
    expect(body.fields.amount).toBe('250.00');
    // Signature must be a 32-char hex MD5.
    expect(body.fields.signature).toMatch(/^[a-f0-9]{32}$/);
  });

  it('return_url and notify_url are built from NEXT_PUBLIC_APP_URL', async () => {
    mockServerClientWithApp(mockApplication);
    mockAdminClient();

    const res = await POST(makePostRequest(APP_ID), routeParams(APP_ID) as any);
    const body = await res.json();

    expect(body.fields.return_url).toContain('http://localhost:3000');
    expect(body.fields.notify_url).toBe(
      'http://localhost:3000/api/payments/payfast/notify'
    );
  });

  it('inserts a pending payment record before returning', async () => {
    mockServerClientWithApp(mockApplication);
    const insertMock = vi.fn().mockResolvedValue({ error: null });
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue({ insert: insertMock }),
    } as any);

    await POST(makePostRequest(APP_ID), routeParams(APP_ID) as any);

    const rows = insertMock.mock.calls[0][0] as any[];
    expect(rows[0].application_id).toBe(APP_ID);
    expect(rows[0].amount_gross).toBe(250);
    expect(rows[0].status).toBe('pending');
  });

  it('returns 404 when the application does not exist', async () => {
    mockServerClientWithApp(null);

    const nonExistentId = 'c2ddcd11-1e2d-4ab0-dd8f-8dddbf502c33';
    const res = await POST(makePostRequest(nonExistentId), routeParams(nonExistentId) as any);
    const body = await res.json();

    expect(res.status).toBe(404);
    expect(body.error).toMatch(/not found/i);
  });

  it('returns 403 when the caller does not own the application', async () => {
    mockServerClientWithApp({ ...mockApplication, applicant_id: 'user-xyz' });

    const res = await POST(makePostRequest(APP_ID), routeParams(APP_ID) as any);
    const body = await res.json();

    expect(res.status).toBe(403);
    expect(body.error).toMatch(/own application/i);
  });

  it('returns 400 when the fee has already been paid', async () => {
    mockServerClientWithApp({ ...mockApplication, payment_status: 'paid' });

    const res = await POST(makePostRequest(APP_ID), routeParams(APP_ID) as any);
    const body = await res.json();

    expect(res.status).toBe(400);
    expect(body.error).toMatch(/already been paid/i);
  });

  it('returns 401 when not authenticated', async () => {
    vi.mocked(getAuthenticatedProfile).mockRejectedValue(new UnauthorizedError());
    vi.mocked(getSupabaseServerClient).mockResolvedValue({} as any);

    const res = await POST(makePostRequest(APP_ID), routeParams(APP_ID) as any);

    expect(res.status).toBe(401);
  });

  it('returns 503 when PAYFAST_MERCHANT_ID is not configured', async () => {
    delete process.env.PAYFAST_MERCHANT_ID;
    mockServerClientWithApp(mockApplication);

    const res = await POST(makePostRequest(APP_ID), routeParams(APP_ID) as any);
    const body = await res.json();

    expect(res.status).toBe(503);
    expect(body.error).toMatch(/not configured/i);
  });

  it('returns 503 when NEXT_PUBLIC_APP_URL is not configured', async () => {
    delete process.env.NEXT_PUBLIC_APP_URL;
    mockServerClientWithApp(mockApplication);

    const res = await POST(makePostRequest(APP_ID), routeParams(APP_ID) as any);
    const body = await res.json();

    expect(res.status).toBe(503);
  });

  it('returns 500 when inserting the payment record fails', async () => {
    mockServerClientWithApp(mockApplication);
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: { message: 'DB write error' } }),
      }),
    } as any);

    const res = await POST(makePostRequest(APP_ID), routeParams(APP_ID) as any);
    const body = await res.json();

    expect(res.status).toBe(500);
    // Raw DB message must NOT be forwarded to the client.
    expect(body.error).toBe('Something went wrong. Please try again.');
  });
});
