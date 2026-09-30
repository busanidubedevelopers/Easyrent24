import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as cancel } from '../../app/api/leases/[id]/cancel/route';
import { POST as saveLease } from '../../app/api/applications/[id]/lease/route';
import { POST as extract } from '../../app/api/applications/[id]/extract/route';
import { PATCH as markRead } from '../../app/api/notifications/route';
import type { LeaseParties } from '../../../backend/lib/lease';

vi.mock('../../lib/serverDb', () => ({ getServerDb: vi.fn() }));
vi.mock('../../../backend/lib/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/auth')>();
  return { ...real, getAuthenticatedProfile: vi.fn(), requireAuthenticatedRole: vi.fn() };
});
vi.mock('../../../backend/lib/adminDb', () => ({ getAdminDb: vi.fn() }));
vi.mock('../../../backend/lib/security/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));
vi.mock('../../../backend/lib/extraction', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/extraction')>();
  return { ...real, extractDocument: vi.fn() };
});
vi.mock('../../../backend/lib/leaseRecords', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/leaseRecords')>();
  return { ...real, buildPartiesSnapshot: vi.fn() };
});

const { getServerDb } = await import('../../lib/serverDb');
const { getAuthenticatedProfile, requireAuthenticatedRole } = await import('../../../backend/lib/auth');
const { getAdminDb } = await import('../../../backend/lib/adminDb');
const { extractDocument } = await import('../../../backend/lib/extraction');
const { buildPartiesSnapshot } = await import('../../../backend/lib/leaseRecords');

const LEASE_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const APP_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const tenant = { id: 'tenant-1', full_name: 'Thabo Mokoena', role: 'tenant' as const, phone: null, is_verified: false };
const landlord = { id: 'landlord-1', full_name: 'Lindiwe Dlamini', role: 'landlord' as const, phone: null, is_verified: true };

const parties: LeaseParties = {
  landlord: { name: 'Lindiwe Dlamini', email: null, is_agent: false },
  tenant: { name: 'Thabo Mokoena', id_number: null, email: null, phone: null, current_address: null },
  co_tenant: null,
  property: { title: 'Unit 4', address: '45 Main Road' },
};

function leaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LEASE_ID, application_id: APP_ID, property_id: 'prop-1', landlord_id: landlord.id, tenant_id: tenant.id,
    status: 'sent', parties, document_hash: null, tenant_signature: null, landlord_signature: null, pdf_path: null,
    monthly_rent: '12500.00', deposit: '12500.00', start_date: '2026-11-01', term_months: 12, escalation_pct: '8.00',
    rent_due_day: 1, pets_allowed: false, utilities: 'tenant_prepaid', special_conditions: null,
    ...overrides,
  };
}

/** Chainable query mock; the chain and .single/.maybeSingle resolve to `result`. */
function query(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: any = {};
  for (const m of ['select', 'eq', 'is', 'neq', 'in', 'order', 'limit', 'insert', 'update']) chain[m] = vi.fn(() => chain);
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  chain.then = (res: any, rej: any) => Promise.resolve(resolved).then(res, rej);
  return chain;
}

function mockAdmin(overrides: Record<string, any[]>, storage: any = {}) {
  // Separate property/user lookups (no joins in the Postgres client) default to fixtures.
  const tables: Record<string, any[]> = {
    properties: [query({ data: { id: 'prop-1', title: 'Unit 4', address: '45 Main Road', price: 12500, landlord_id: landlord.id } })],
    users: [query({ data: [] })],
    ...overrides,
  };
  const from = vi.fn((table: string) => {
    const queue = tables[table];
    if (!queue?.length) throw new Error(`Unexpected admin query on ${table}`);
    return queue.length > 1 ? queue.shift() : queue[0];
  });
  vi.mocked(getAdminDb).mockReturnValue({ from, storage: { from: vi.fn(() => storage) } } as any);
  return from;
}

function post(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: body === undefined ? undefined : JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}
const params = (id = LEASE_ID) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.mocked(getServerDb).mockResolvedValue({} as any);
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/leases/[id]/cancel', () => {
  const cancelUrl = `http://localhost:3000/api/leases/${LEASE_ID}/cancel`;

  it('withdraws a sent lease and tells the tenant', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const update = query({ data: leaseRow({ status: 'cancelled' }) });
    const notifications = query();
    mockAdmin({ leases: [query({ data: leaseRow({ status: 'sent' }) }), update], notifications: [notifications] });

    const res = await cancel(post(cancelUrl), params());

    expect(res.status).toBe(200);
    expect(update.update.mock.calls[0][0]).toMatchObject({ status: 'cancelled' });
    expect(update.eq).toHaveBeenCalledWith('status', 'sent');
    expect(notifications.insert.mock.calls[0][0][0]).toMatchObject({ user_id: tenant.id, type: 'lease_cancelled' });
  });

  it('does not notify the tenant about a draft they never saw', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const from = mockAdmin({ leases: [query({ data: leaseRow({ status: 'draft' }) }), query({ data: leaseRow({ status: 'cancelled' }) })] });
    const res = await cancel(post(cancelUrl), params());
    expect(res.status).toBe(200);
    expect(from).not.toHaveBeenCalledWith('notifications');
  });

  it('refuses to withdraw an executed lease', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    mockAdmin({ leases: [query({ data: leaseRow({ status: 'executed' }) })] });
    const res = await cancel(post(cancelUrl), params());
    expect(res.status).toBe(409);
  });

  it('does not let the tenant withdraw', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    mockAdmin({ leases: [query({ data: leaseRow() })] });
    const res = await cancel(post(cancelUrl), params());
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/applications/[id]/lease (re-issue after withdrawal)', () => {
  const body = {
    monthly_rent: 13000, deposit: 13000, start_date: '2026-12-01', term_months: 12, escalation_pct: 8,
    rent_due_day: 1, pets_allowed: false, utilities: 'tenant_prepaid', special_conditions: null,
  };
  const application = {
    id: APP_ID, applicant_id: tenant.id, status: 'approved', first_name: 'Thabo', last_name: 'Mokoena', id_number: null,
    phone: null, current_address: null, co_applicant_details: null, property_id: 'prop-1',
    properties: { id: 'prop-1', title: 'Unit 4', address: '45 Main Road', price: 12500, landlord_id: landlord.id },
  };
  const url = `http://localhost:3000/api/applications/${APP_ID}/lease`;

  beforeEach(() => {
    vi.mocked(requireAuthenticatedRole).mockResolvedValue(landlord);
    vi.mocked(buildPartiesSnapshot).mockResolvedValue(parties);
  });

  it('turns a withdrawn lease back into a clean draft with the new terms', async () => {
    const update = query({ data: leaseRow({ status: 'draft' }) });
    mockAdmin({
      applications: [query({ data: application })],
      leases: [query({ data: { id: LEASE_ID, status: 'cancelled' } }), update],
    });

    const res = await saveLease(post(url, body), params(APP_ID));

    expect(res.status).toBe(200);
    expect(update.update.mock.calls[0][0]).toMatchObject({
      monthly_rent: 13000,
      status: 'draft',
      document_hash: null,
      tenant_signature: null,
      landlord_signature: null,
      pdf_path: null,
    });
    expect(update.eq).toHaveBeenCalledWith('status', 'cancelled');
  });

  it('still refuses to edit a lease that is out for signature', async () => {
    mockAdmin({
      applications: [query({ data: application })],
      leases: [query({ data: { id: LEASE_ID, status: 'sent' } })],
    });
    const res = await saveLease(post(url, body), params(APP_ID));
    expect(res.status).toBe(409);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('co-applicant document consent', () => {
  it("uses the co-applicant's own consent for their documents", async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const appQueries = [
      query({ data: { id: APP_ID } }),
      query({ data: { first_name: 'Thabo', last_name: 'Mokoena', id_number: null, employer_name: null, monthly_income: null, co_applicant_details: null, documents: {}, properties: { price: 12500 } } }),
    ];
    vi.mocked(getServerDb).mockResolvedValue({
      from: vi.fn((table: string) => (table === 'applications' ? appQueries.shift() : query({ data: [] }))),
    } as any);
    vi.mocked(extractDocument).mockResolvedValue({ document_matches_type: true } as any);
    mockAdmin(
      {
        applications: [query({ data: {
          id: APP_ID,
          applicant_id: tenant.id,
          property_id: 'prop-1',
          first_name: 'Thabo',
          last_name: 'Mokoena',
          id_number: null,
          employer_name: null,
          monthly_income: null,
          documents: { payslip: 'u/a/payslip-1.pdf', co_payslip: 'u/a/co_payslip-1.pdf', co_id_document: 'u/a/co_id_document-1.pdf' },
          consent_id_check: true,
          consent_bank_statements: true,
          co_applicant_details: { firstName: 'Naledi', consentIdVerification: false, consentBankStatements: true },
        } })],
        document_extractions: [query()],
      },
      { download: vi.fn().mockResolvedValue({ data: new Blob(['%PDF']), error: null }) }
    );

    const res = await extract(post(`http://localhost:3000/api/applications/${APP_ID}/extract`, {}), params(APP_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    // Main + co-applicant payslip, both read with the payslip schema.
    expect(vi.mocked(extractDocument).mock.calls.map((c) => c[0])).toEqual(['payslip', 'payslip']);
    expect(body.skipped).toEqual([{ document_type: 'co_id_document', reason: expect.stringMatching(/consented/) }]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PATCH /api/notifications', () => {
  it("only marks the caller's own notifications read", async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    const q = query();
    vi.mocked(getServerDb).mockResolvedValue({ from: vi.fn(() => q) } as any);

    const res = await markRead(new NextRequest('http://localhost:3000/api/notifications', { method: 'PATCH', body: '{}' }));

    expect(res.status).toBe(200);
    expect(q.update).toHaveBeenCalledWith({ is_read: true });
    expect(q.eq).toHaveBeenCalledWith('user_id', tenant.id);
  });
});
