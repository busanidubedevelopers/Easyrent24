import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as manualFigures } from '../../app/api/applications/[id]/manual-figures/route';
import { GET as review } from '../../app/api/applications/[id]/extract/route';

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

const { getServerDb } = await import('../../lib/serverDb');
const { getAuthenticatedProfile } = await import('../../../backend/lib/auth');
const { getAdminDb } = await import('../../../backend/lib/adminDb');

const APP_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const landlord = { id: 'landlord-1', full_name: 'Lindiwe Dlamini', role: 'landlord' as const, phone: null, is_verified: true };
const tenant = { id: 'tenant-1', full_name: 'Thabo Mokoena', role: 'tenant' as const, phone: null, is_verified: false };

const application = {
  id: APP_ID, applicant_id: tenant.id, property_id: 'prop-1', first_name: 'Thabo', last_name: 'Mokoena',
  id_number: '8001015009087', employer_name: 'Acme Logistics', monthly_income: '40000.00', current_rent: '8500.00',
  co_applicant_details: null, documents: {},
};
const property = { id: 'prop-1', title: 'Chic City Center Studio', address: '88 Bree Street', price: '9500.00', landlord_id: landlord.id };

function query(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: any = {};
  for (const m of ['select', 'eq', 'is', 'neq', 'in', 'order', 'limit', 'insert', 'update']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  chain.then = (res: any, rej: any) => Promise.resolve(resolved).then(res, rej);
  return chain;
}

/** Admin DB whose document_extractions returns whatever was inserted (so the review sees it). */
function mockAdmin() {
  const inserted: any[] = [];
  const extractions: any = query();
  extractions.insert = vi.fn((rows: any[]) => {
    inserted.push(...rows.map((r) => ({ ...r, created_at: new Date().toISOString(), error: null })));
    return query();
  });
  extractions.then = (res: any, rej: any) => Promise.resolve({ data: [...inserted].reverse(), error: null }).then(res, rej);
  const from = vi.fn((table: string) => {
    if (table === 'applications') return query({ data: application });
    if (table === 'properties') return query({ data: property });
    if (table === 'document_extractions') return extractions;
    throw new Error(`Unexpected table ${table}`);
  });
  vi.mocked(getAdminDb).mockReturnValue({ from } as any);
  return { inserted, extractions };
}

const post = (body: unknown) =>
  new NextRequest(`http://localhost:3000/api/applications/${APP_ID}/manual-figures`, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
const params = { params: Promise.resolve({ id: APP_ID }) };

const figures = {
  name_confirmed: true,
  payslip: { gross_pay: 40000, net_pay: 31000, pay_date: '2026-08-25', employer_name: 'Acme Logistics', garnishee_order: false },
  bank: {
    months: 3,
    average_monthly_income: 31000,
    current_rent: 8500,
    debt_repayments: [{ description: 'WesBank vehicle finance', monthly_amount: 2000 }],
    returned_debit_orders: 0,
    gambling_transactions: 0,
    lowest_balance: 900,
  },
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerDb).mockResolvedValue({} as any);
});

describe('POST /api/applications/[id]/manual-figures', () => {
  it('stores the agent\'s figures as manual extractions and returns an approve recommendation', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const { inserted } = mockAdmin();

    const res = await manualFigures(post(figures), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(inserted.map((r) => r.document_type).sort()).toEqual(['bank_statement', 'payslip']);
    expect(inserted.every((r) => r.model === `manual:${landlord.id}` && r.storage_path === 'manual-entry')).toBe(true);
    const bank = inserted.find((r) => r.document_type === 'bank_statement').extracted;
    expect(bank.rent_payments).toHaveLength(3);
    expect(bank.income_deposits).toHaveLength(3);
    expect(bank.account_holder).toBe('Thabo Mokoena');

    expect(body.assessment.recommendation).toBe('approve');
    expect(body.assessment.figures.gross_income).toBe(40000);
    expect(body.assessment.figures.current_rent).toBe(8500);
    expect(body.assessment.figures.current_rent_source).toBe('bank_statement');
    expect(body.assessment.figures.debt_repayments).toBe(2000);
    expect(body.verification.checks.find((c: any) => c.key === 'declared_income').status).toBe('pass');
  });

  it('does not let the applicant enter their own figures', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    const { inserted } = mockAdmin();
    const res = await manualFigures(post(figures), params);
    expect(res.status).toBe(404);
    expect(inserted).toHaveLength(0);
  });

  it('requires payslip or bank figures', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    mockAdmin();
    const res = await manualFigures(post({ name_confirmed: true }), params);
    expect(res.status).toBe(400);
  });

  it('leaves names unconfirmed when the agent did not check them', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const { inserted } = mockAdmin();
    await manualFigures(post({ ...figures, name_confirmed: false }), params);
    expect(inserted.find((r) => r.document_type === 'payslip').extracted.employee_name).toBeNull();
  });
});

describe('GET /api/applications/[id]/extract (review)', () => {
  it('returns an indicative "need more information" assessment on declared income only', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    mockAdmin();

    const res = await review(new NextRequest(`http://localhost:3000/api/applications/${APP_ID}/extract`), params);
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.assessment.recommendation).toBe('insufficient_information');
    expect(body.assessment.figures.income_basis).toBe('declared');
    expect(body.assessment.figures.current_rent_source).toBe('declared');
    expect(body.assessment.figures.proposed_rent).toBe(9500);
  });
});
