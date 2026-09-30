import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as sign } from '../../app/api/leases/[id]/sign/route';
import { POST as send } from '../../app/api/leases/[id]/send/route';
import { GET as getLease } from '../../app/api/leases/[id]/route';
import { POST as extract } from '../../app/api/applications/[id]/extract/route';
import { buildLeaseDocument, hashLeaseDocument, type LeaseParties } from '../../../backend/lib/lease';

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
vi.mock('../../../backend/lib/localExtraction', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/localExtraction')>();
  return { ...real, extractDocumentLocally: vi.fn() };
});
vi.mock('../../../backend/lib/extraction', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/extraction')>();
  return { ...real, extractDocument: vi.fn() };
});

const { getServerDb } = await import('../../lib/serverDb');
const { getAuthenticatedProfile } = await import('../../../backend/lib/auth');
const { getAdminDb } = await import('../../../backend/lib/adminDb');
const { extractDocument } = await import('../../../backend/lib/extraction');
const { extractDocumentLocally } = await import('../../../backend/lib/localExtraction');

const LEASE_ID = 'c1eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const APP_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';

const tenant = { id: 'tenant-1', full_name: 'Thabo Mokoena', role: 'tenant' as const, phone: null, is_verified: false };
const landlord = { id: 'landlord-1', full_name: 'Lindiwe Dlamini', role: 'landlord' as const, phone: null, is_verified: true };

const parties: LeaseParties = {
  landlord: { name: 'Lindiwe Dlamini', email: 'l@example.com', is_agent: false },
  tenant: { name: 'Thabo Mokoena', id_number: null, email: 't@example.com', phone: null, current_address: null },
  co_tenant: null,
  property: { title: 'Unit 4', address: '45 Main Road' },
};
const terms = {
  monthly_rent: '12500.00', deposit: '12500.00', start_date: '2026-11-01', term_months: 12, escalation_pct: '8.00',
  rent_due_day: 1, pets_allowed: false, utilities: 'tenant_prepaid', special_conditions: null,
};
const HASH = hashLeaseDocument(
  buildLeaseDocument(parties, { ...terms, monthly_rent: 12500, deposit: 12500, escalation_pct: 8, utilities: 'tenant_prepaid' })
);

function leaseRow(overrides: Record<string, unknown> = {}) {
  return {
    id: LEASE_ID, application_id: APP_ID, property_id: 'prop-1', landlord_id: landlord.id, tenant_id: tenant.id,
    status: 'sent', parties, document_hash: HASH, tenant_signature: null, landlord_signature: null, pdf_path: null,
    ...terms, ...overrides,
  };
}

/** Chainable query mock; the chain and .single/.maybeSingle resolve to `result`. */
function query(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: any = {};
  for (const m of ['select', 'eq', 'is', 'neq', 'order', 'limit', 'insert', 'update']) chain[m] = vi.fn(() => chain);
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
    headers: { 'Content-Type': 'application/json', 'x-forwarded-for': '41.1.2.3, 10.0.0.1', 'user-agent': 'vitest' },
  });
}
const params = (id = LEASE_ID) => ({ params: Promise.resolve({ id }) });
const signUrl = `http://localhost:3000/api/leases/${LEASE_ID}/sign`;

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(getServerDb).mockResolvedValue({} as any);
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/leases/[id]', () => {
  it('hides a draft lease from the tenant', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    mockAdmin({ leases: [query({ data: leaseRow({ status: 'draft' }) })] });
    const res = await getLease(new NextRequest(`http://localhost:3000/api/leases/${LEASE_ID}`), params());
    expect(res.status).toBe(404);
  });

  it('tells the tenant it is their turn to sign, without exposing the storage path', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    mockAdmin({ leases: [query({ data: leaseRow({ pdf_path: 'secret/path.pdf' }) })] });
    const res = await getLease(new NextRequest(`http://localhost:3000/api/leases/${LEASE_ID}`), params());
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.role).toBe('tenant');
    expect(body.can_sign).toBe(true);
    expect(body.lease.pdf_path).toBeUndefined();
    expect(body.document.sections.length).toBeGreaterThan(5);
  });

  it('returns 404 to an unrelated user', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue({ ...tenant, id: 'someone-else' });
    mockAdmin({ leases: [query({ data: leaseRow() })] });
    const res = await getLease(new NextRequest(`http://localhost:3000/api/leases/${LEASE_ID}`), params());
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/leases/[id]/send', () => {
  it('freezes the text hash, approves the application and notifies the tenant', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const update = query({ data: leaseRow() });
    const appUpdate = query();
    const notifications = query();
    mockAdmin({
      leases: [query({ data: leaseRow({ status: 'draft', document_hash: null }) }), update],
      applications: [query({ data: { status: 'reviewing', payment_status: 'paid' } }), appUpdate],
      notifications: [notifications],
    });

    const res = await send(post(`http://localhost:3000/api/leases/${LEASE_ID}/send`), params());

    expect(res.status).toBe(200);
    expect(update.update.mock.calls[0][0]).toMatchObject({ status: 'sent', document_hash: HASH });
    expect(update.eq).toHaveBeenCalledWith('status', 'draft');
    expect(appUpdate.update).toHaveBeenCalledWith({ status: 'approved' });
    expect(notifications.insert.mock.calls[0][0][0]).toMatchObject({ user_id: tenant.id, link: `/leases/${LEASE_ID}` });
  });

  it('refuses to approve while the application fee is unpaid', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const from = mockAdmin({
      leases: [query({ data: leaseRow({ status: 'draft', document_hash: null }) })],
      applications: [query({ data: { status: 'reviewing', payment_status: 'unpaid' } })],
    });

    const res = await send(post(`http://localhost:3000/api/leases/${LEASE_ID}/send`), params());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/application fee/);
    expect(from.mock.calls.filter(([t]) => t === 'leases')).toHaveLength(1); // not updated
  });

  it('does not let the tenant send', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    mockAdmin({ leases: [query({ data: leaseRow() })] });
    const res = await send(post(`http://localhost:3000/api/leases/${LEASE_ID}/send`), params());
    expect(res.status).toBe(404);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/leases/[id]/sign', () => {
  it('records the tenant signature with IP, user agent and the lease hash', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    const update = query({ data: leaseRow({ status: 'tenant_signed' }) });
    mockAdmin({ leases: [query({ data: leaseRow() }), update], notifications: [query()] });

    const res = await sign(post(signUrl, { full_name: ' thabo  mokoena ', accept: true }), params());

    expect(res.status).toBe(200);
    const fields = update.update.mock.calls[0][0];
    expect(fields.status).toBe('tenant_signed');
    expect(fields.tenant_signature).toMatchObject({ name: 'Thabo Mokoena', ip: '41.1.2.3', user_agent: 'vitest', document_hash: HASH });
    expect(update.eq).toHaveBeenCalledWith('status', 'sent');
  });

  it('rejects a typed name that does not match the lease', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    mockAdmin({ leases: [query({ data: leaseRow() })] });
    const res = await sign(post(signUrl, { full_name: 'Someone Else', accept: true }), params());
    expect(res.status).toBe(400);
    expect((await res.json()).error).toContain('Thabo Mokoena');
  });

  it('requires explicit acceptance', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    mockAdmin({ leases: [query({ data: leaseRow() })] });
    const res = await sign(post(signUrl, { full_name: 'Thabo Mokoena', accept: false }), params());
    expect(res.status).toBe(400);
  });

  it('refuses to sign if the lease text no longer matches what was sent', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockAdmin({ leases: [query({ data: leaseRow({ document_hash: 'f'.repeat(64) }) })] });
    const res = await sign(post(signUrl, { full_name: 'Thabo Mokoena', accept: true }), params());
    expect(res.status).toBe(409);
  });

  it('does not let the landlord sign before the tenant', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    mockAdmin({ leases: [query({ data: leaseRow() })] });
    const res = await sign(post(signUrl, { full_name: 'Lindiwe Dlamini', accept: true }), params());
    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/tenant must sign first/);
  });

  it('executes on the landlord countersignature: stores the signed PDF, then updates the lease', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const tenantSig = { name: 'Thabo Mokoena', signed_at: '2026-10-01T10:00:00Z', ip: '41.1.2.3', user_agent: 'x', document_hash: HASH };
    const update = query({ data: leaseRow({ status: 'executed' }) });
    const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn() };
    mockAdmin(
      { leases: [query({ data: leaseRow({ status: 'tenant_signed', tenant_signature: tenantSig }) }), update], notifications: [query()] },
      storage
    );

    const res = await sign(post(signUrl, { full_name: 'Lindiwe Dlamini', accept: true }), params());

    expect(res.status).toBe(200);
    const [path, pdf, opts] = storage.upload.mock.calls[0];
    expect(path).toMatch(new RegExp(`^${LEASE_ID}/lease-executed-\\d+\\.pdf$`));
    expect(Buffer.from(pdf.slice(0, 5)).toString()).toBe('%PDF-');
    expect(opts.contentType).toBe('application/pdf');
    expect(update.update.mock.calls[0][0]).toMatchObject({ status: 'executed', pdf_path: path });
    expect(update.eq).toHaveBeenCalledWith('status', 'tenant_signed');
    expect(storage.remove).not.toHaveBeenCalled();
  });

  it('cleans up the uploaded PDF if someone else executed it first', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    const storage = { upload: vi.fn().mockResolvedValue({ error: null }), remove: vi.fn().mockResolvedValue({}) };
    mockAdmin(
      { leases: [query({ data: leaseRow({ status: 'tenant_signed', tenant_signature: { signed_at: '2026-10-01T10:00:00Z', name: 'x', ip: null, user_agent: null, document_hash: HASH } }) }), query({ data: null })] },
      storage
    );

    const res = await sign(post(signUrl, { full_name: 'Lindiwe Dlamini', accept: true }), params());

    expect(res.status).toBe(409);
    expect(storage.remove).toHaveBeenCalledWith([storage.upload.mock.calls[0][0]]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/applications/[id]/extract', () => {
  const extractUrl = `http://localhost:3000/api/applications/${APP_ID}/extract`;

  beforeEach(() => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
  });

  function mockCallerClient() {
    const applicationQueries = [
      query({ data: { id: APP_ID } }), // visibility check
      query({ data: { first_name: 'Thabo', last_name: 'Mokoena', id_number: null, employer_name: null, monthly_income: null, documents: {}, properties: { price: 12500 } } }),
    ];
    vi.mocked(getServerDb).mockResolvedValue({
      from: vi.fn((table: string) => (table === 'applications' ? applicationQueries.shift() : query({ data: [] }))),
    } as any);
  }

  it('only sends documents the applicant consented to, and records each result', async () => {
    mockCallerClient();
    vi.mocked(extractDocument).mockResolvedValue({ document_matches_type: true } as any);
    const inserts = query();
    const storage = { download: vi.fn().mockResolvedValue({ data: new Blob(['%PDF']), error: null }) };
    mockAdmin(
      {
        applications: [query({ data: {
          id: APP_ID,
          applicant_id: tenant.id, property_id: 'prop-1', first_name: 'Thabo', last_name: 'Mokoena', id_number: null, employer_name: null, monthly_income: null, co_applicant_details: null, 
          documents: { id_document: 'u/a/id_document-1.pdf', payslip: 'u/a/payslip-1.pdf' },
          consent_id_check: true,
          consent_bank_statements: false,
        } })],
        document_extractions: [inserts],
      },
      storage
    );

    const res = await extract(post(extractUrl, {}), params(APP_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(extractDocument).toHaveBeenCalledTimes(1);
    expect(vi.mocked(extractDocument).mock.calls[0][0]).toBe('id_document');
    expect(body.skipped).toEqual([{ document_type: 'payslip', reason: expect.stringMatching(/consented/) }]);
    expect(inserts.insert.mock.calls[0][0][0]).toMatchObject({ document_type: 'id_document', status: 'complete' });
  });

  it('stores a safe failure message when a document cannot be read', async () => {
    mockCallerClient();
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.mocked(extractDocument).mockRejectedValue(new Error('connection reset with internal detail'));
    const inserts = query();
    mockAdmin(
      {
        applications: [query({ data: { id: APP_ID, applicant_id: tenant.id, property_id: 'prop-1', first_name: 'Thabo', last_name: 'Mokoena', id_number: null, employer_name: null, monthly_income: null, co_applicant_details: null, documents: { payslip: 'u/a/payslip-1.pdf' }, consent_id_check: true, consent_bank_statements: true } })],
        document_extractions: [inserts],
      },
      { download: vi.fn().mockResolvedValue({ data: new Blob(['%PDF']), error: null }) }
    );

    const res = await extract(post(extractUrl, {}), params(APP_ID));

    expect(res.status).toBe(200);
    const row = inserts.insert.mock.calls[0][0][0];
    expect(row.status).toBe('failed');
    expect(row.error).not.toContain('internal detail');
  });

  it('falls back to the built-in reader for PDFs when Claude fails (e.g. no credit)', async () => {
    process.env.ANTHROPIC_API_KEY = 'test-key';
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockCallerClient();
    vi.mocked(extractDocument).mockRejectedValue(new Error('credit balance is too low'));
    vi.mocked(extractDocumentLocally).mockResolvedValue({ document_matches_type: true, notes: 'Read by the built-in text reader.' } as any);
    const inserts = query();
    mockAdmin(
      {
        applications: [query({ data: {
          id: APP_ID, applicant_id: tenant.id, property_id: 'prop-1', first_name: 'Thabo', last_name: 'Mokoena',
          id_number: null, employer_name: null, monthly_income: null, co_applicant_details: null,
          documents: { payslip: 'u/a/payslip-1.pdf' }, consent_id_check: true, consent_bank_statements: true,
        } })],
        document_extractions: [inserts],
      },
      { download: vi.fn().mockResolvedValue({ data: Buffer.from('%PDF'), error: null }) }
    );

    const res = await extract(post(extractUrl, {}), params(APP_ID));

    expect(res.status).toBe(200);
    const row = inserts.insert.mock.calls[0][0][0];
    expect(row).toMatchObject({ document_type: 'payslip', status: 'complete', model: 'builtin-text-reader' });
    expect(row.extracted.notes).toMatch(/^AI reader unavailable/);
  });

  it('without an API key, reads PDFs with the built-in reader and skips photos', async () => {
    delete process.env.ANTHROPIC_API_KEY;
    mockCallerClient();
    vi.mocked(extractDocumentLocally).mockResolvedValue({ document_matches_type: true } as any);
    const inserts = query();
    mockAdmin(
      {
        applications: [query({ data: {
          id: APP_ID, applicant_id: tenant.id, property_id: 'prop-1', first_name: 'Thabo', last_name: 'Mokoena',
          id_number: null, employer_name: null, monthly_income: null, co_applicant_details: null,
          documents: { payslip: 'u/a/payslip-1.pdf', id_document: 'u/a/id_document-1.jpg' },
          consent_id_check: true, consent_bank_statements: true,
        } })],
        document_extractions: [inserts],
      },
      { download: vi.fn().mockResolvedValue({ data: Buffer.from('%PDF'), error: null }) }
    );

    const res = await extract(post(extractUrl, {}), params(APP_ID));
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(extractDocument).not.toHaveBeenCalled();
    expect(vi.mocked(extractDocumentLocally).mock.calls.map((c) => c[0])).toEqual(['payslip']);
    expect(inserts.insert.mock.calls[0][0][0]).toMatchObject({ document_type: 'payslip', model: 'builtin-text-reader', status: 'complete' });
    expect(body.skipped).toEqual([{ document_type: 'id_document', reason: expect.stringMatching(/Photos can only be read by the AI reader/) }]);
    expect(body.assessment).toBeDefined();
  });
});
