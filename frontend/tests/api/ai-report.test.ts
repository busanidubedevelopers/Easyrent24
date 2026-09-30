import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET, POST } from '../../app/api/applications/[id]/ai-report/route';

vi.mock('../../lib/serverDb', () => ({ getServerDb: vi.fn() }));
vi.mock('../../../backend/lib/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/auth')>();
  return { ...real, getAuthenticatedProfile: vi.fn() };
});
vi.mock('../../../backend/lib/adminDb', () => ({ getAdminDb: vi.fn() }));
vi.mock('../../../backend/lib/security/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock('../../../backend/lib/aiAnalyst', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/aiAnalyst')>();
  return { ...real, analyseAffordability: vi.fn() };
});

const { getServerDb } = await import('../../lib/serverDb');
const { getAuthenticatedProfile } = await import('../../../backend/lib/auth');
const { getAdminDb } = await import('../../../backend/lib/adminDb');
const { analyseAffordability } = await import('../../../backend/lib/aiAnalyst');

const APP_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const landlord = { id: 'landlord-1', full_name: 'Lindiwe Dlamini', role: 'landlord' as const, phone: null, is_verified: true };
const tenant = { id: 'tenant-1', full_name: 'Thabo Mokoena', role: 'tenant' as const, phone: null, is_verified: false };

const application = {
  id: APP_ID, applicant_id: tenant.id, property_id: 'prop-1', first_name: 'Thabo', last_name: 'Mokoena',
  id_number: null, employer_name: null, monthly_income: '40000.00', current_rent: null, co_applicant_details: null,
  consent_bank_statements: true,
  documents: {
    payslip: { path: 'u/a/payslip.pdf', contentType: 'application/pdf' },
    bank_statement: { path: 'u/a/bank.pdf', contentType: 'application/pdf' },
    id_document: { path: 'u/a/id.pdf', contentType: 'application/pdf' },
  },
};

function query(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: any = {};
  for (const m of ['select', 'eq', 'is', 'neq', 'in', 'order', 'limit', 'insert', 'update']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  chain.then = (res: any, rej: any) => Promise.resolve(resolved).then(res, rej);
  return chain;
}

function mockAdmin(app = application) {
  const reports = query({ data: { id: 'r1', status: 'complete', report: { summary: 'ok' }, error: null, created_at: '2026-09-30T10:00:00Z' } });
  const download = vi.fn().mockResolvedValue({ data: Buffer.from('%PDF'), error: null });
  vi.mocked(getAdminDb).mockReturnValue({
    from: vi.fn((t: string) =>
      t === 'applications' ? query({ data: app })
      : t === 'properties' ? query({ data: { id: 'prop-1', title: 'Studio', address: '88 Bree', price: '9500.00', landlord_id: landlord.id } })
      : t === 'document_extractions' ? query({ data: [] })
      : t === 'affordability_reports' ? reports
      : (() => { throw new Error(t); })()),
    storage: { from: vi.fn(() => ({ download })) },
  } as any);
  return { reports, download };
}

const params = { params: Promise.resolve({ id: APP_ID }) };
const url = `http://localhost:3000/api/applications/${APP_ID}/ai-report`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerDb).mockResolvedValue({} as any);
  process.env.ANTHROPIC_API_KEY = 'test-key';
});
afterEach(() => {
  delete process.env.ANTHROPIC_API_KEY;
});

describe('POST /api/applications/[id]/ai-report', () => {
  it('sends the payslip and bank statement (not the ID) to the analyst and saves the report', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    vi.mocked(analyseAffordability).mockResolvedValue({ summary: 'ok' } as any);
    const { reports, download } = mockAdmin();

    const res = await POST(new NextRequest(url, { method: 'POST' }), params);

    expect(res.status).toBe(201);
    expect(download.mock.calls.map((c) => c[0])).toEqual(['u/a/payslip.pdf', 'u/a/bank.pdf']);
    const input = vi.mocked(analyseAffordability).mock.calls[0][0];
    expect(input.documents.map((d) => d.label)).toEqual(['Thabo Mokoena — payslip', 'Thabo Mokoena — bank statement']);
    expect(input.proposedRent).toBe(9500);
    expect(input.assessment.recommendation).toBeDefined();
    expect(reports.insert.mock.calls[0][0][0]).toMatchObject({ application_id: APP_ID, status: 'complete', requested_by: landlord.id });
  });

  it('explains how to switch it on when there is no API key', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const res = await POST(new NextRequest(url, { method: 'POST' }), params);
    expect(res.status).toBe(503);
    expect((await res.json()).error).toMatch(/ANTHROPIC_API_KEY/);
  });

  it('is not available to the applicant', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    mockAdmin();
    const res = await POST(new NextRequest(url, { method: 'POST' }), params);
    expect(res.status).toBe(404);
    expect(analyseAffordability).not.toHaveBeenCalled();
  });

  it('respects the applicant\'s consent', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    mockAdmin({ ...application, consent_bank_statements: false });
    const res = await POST(new NextRequest(url, { method: 'POST' }), params);
    expect(res.status).toBe(409);
    expect(analyseAffordability).not.toHaveBeenCalled();
  });
});

describe('GET /api/applications/[id]/ai-report', () => {
  it('reports whether the analyst is configured and returns the latest report', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    mockAdmin();
    const res = await GET(new NextRequest(url), params);
    const body = await res.json();
    expect(body.configured).toBe(true);
    expect(body.latest.report.summary).toBe('ok');
  });
});
