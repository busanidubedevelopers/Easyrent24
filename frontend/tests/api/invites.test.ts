import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST as createInvite } from '../../app/api/invites/route';
import { GET as previewInvite } from '../../app/api/invites/[token]/route';
import { POST as claimInvite } from '../../app/api/invites/[token]/claim/route';
import { POST as payInvite } from '../../app/api/invites/[token]/pay/route';
import { POST as notify } from '../../app/api/payments/payfast/notify/route';
import { ForbiddenError } from '../../../backend/lib/auth';
import { generateSignature } from '../../../backend/lib/payfast';
import { generateInviteToken } from '../../../backend/lib/invites';

vi.mock('../../lib/serverDb', () => ({
  getServerDb: vi.fn(),
}));

vi.mock('../../../backend/lib/auth', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/auth')>();
  return { ...real, getAuthenticatedProfile: vi.fn(), requireAuthenticatedRole: vi.fn() };
});

vi.mock('../../../backend/lib/adminDb', () => ({
  getAdminDb: vi.fn(),
}));

vi.mock('../../../backend/lib/security/rateLimiter', () => ({
  checkRateLimit: vi.fn().mockResolvedValue({ allowed: true }),
  getRateLimitHeaders: vi.fn().mockReturnValue({}),
}));

vi.mock('../../../backend/lib/payfast', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/payfast')>();
  return { ...real, validateWithPayfast: vi.fn().mockResolvedValue(true) };
});

const { getServerDb } = await import('../../lib/serverDb');
const { getAuthenticatedProfile, requireAuthenticatedRole } = await import('../../../backend/lib/auth');
const { getAdminDb } = await import('../../../backend/lib/adminDb');

// ── fixtures ────────────────────────────────────────────────────────────────

const PROPERTY_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const TOKEN = generateInviteToken();

const landlord = { id: 'landlord-1', full_name: 'Lindiwe Landlord', role: 'landlord' as const, phone: null, is_verified: true };
const tenant = { id: 'tenant-1', full_name: 'Jane Doe', role: 'tenant' as const, phone: null, is_verified: false };

const pendingInvite = {
  id: 'invite-1',
  token: TOKEN,
  inviter_id: landlord.id,
  property_id: PROPERTY_ID,
  invitee_name: 'Jane Doe',
  invitee_email: 'jane@example.com',
  admin_fee_amount: '500.00',
  status: 'pending',
  tenant_id: null as string | null,
  expires_at: '2099-01-01T00:00:00Z',
};

/**
 * A chainable Supabase query mock: every builder method returns the chain,
 * and the chain itself (or .single/.maybeSingle) resolves to `result`.
 */
function query(result: { data?: unknown; error?: unknown } = {}) {
  const resolved = { data: result.data ?? null, error: result.error ?? null };
  const chain: any = {};
  for (const m of ['select', 'eq', 'is', 'neq', 'in', 'order', 'limit', 'insert', 'update']) {
    chain[m] = vi.fn(() => chain);
  }
  chain.single = vi.fn().mockResolvedValue(resolved);
  chain.maybeSingle = vi.fn().mockResolvedValue(resolved);
  chain.then = (res: any, rej: any) => Promise.resolve(resolved).then(res, rej);
  return chain;
}

/**
 * Admin client whose from(table) returns queries in call order per table.
 * Property and user lookups (separate queries — the Postgres client has no
 * joins) get sensible defaults unless a test overrides them.
 */
function mockAdmin(overrides: Record<string, any[]>) {
  const tables: Record<string, any[]> = {
    properties: [query({ data: { id: PROPERTY_ID, title: 'Sea Point Flat', address: '45 Main Road', price: 12500, landlord_id: landlord.id } })],
    users: [query({ data: [{ id: landlord.id, full_name: 'Lindiwe Landlord', email: 'lindiwe@example.com' }] })],
    ...overrides,
  };
  const from = vi.fn((table: string) => {
    const queue = tables[table];
    if (!queue?.length) throw new Error(`Unexpected admin query on ${table}`);
    return queue.length > 1 ? queue.shift() : queue[0];
  });
  vi.mocked(getAdminDb).mockReturnValue({ from } as any);
  return from;
}

function mockServer(tables: Record<string, any> = {}, email = 'jane@example.com') {
  vi.mocked(getServerDb).mockResolvedValue({
    from: vi.fn((table: string) => tables[table]),
    auth: { getUser: vi.fn().mockResolvedValue({ data: { user: { id: tenant.id, email } } }) },
  } as any);
}

function post(url: string, body?: unknown) {
  return new NextRequest(url, {
    method: 'POST',
    body: body ? JSON.stringify(body) : undefined,
    headers: { 'Content-Type': 'application/json' },
  });
}

const tokenParams = (token = TOKEN) => ({ params: Promise.resolve({ token }) });

const savedEnv: Record<string, string | undefined> = {};
const ENV = {
  PAYFAST_MERCHANT_ID: '10000100',
  PAYFAST_MERCHANT_KEY: 'mk_test_abc',
  PAYFAST_PASSPHRASE: 'test-passphrase',
  PAYFAST_MODE: 'sandbox',
  NEXT_PUBLIC_APP_URL: 'http://localhost:3000',
};

beforeEach(() => {
  vi.clearAllMocks();
  for (const [k, v] of Object.entries(ENV)) {
    savedEnv[k] = process.env[k];
    process.env[k] = v;
  }
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/invites', () => {
  const validBody = {
    property_id: PROPERTY_ID,
    invitee_name: 'Jane Doe',
    invitee_email: 'Jane@Example.com',
    admin_fee_amount: 500,
  };

  beforeEach(() => {
    vi.mocked(requireAuthenticatedRole).mockResolvedValue(landlord);
  });

  it('creates an invite with a server-generated token and returns the signup link', async () => {
    mockServer({ properties: query({ data: { id: PROPERTY_ID, landlord_id: landlord.id, title: 'Sea Point Flat', address: '45 Main Road' } }) });
    const inviteInsert = query({ data: { id: 'invite-1', invitee_name: 'Jane Doe', invitee_email: 'jane@example.com', admin_fee_amount: 500, status: 'pending' } });
    mockAdmin({ tenant_invites: [inviteInsert] });

    const res = await createInvite(post('http://localhost:3000/api/invites', { ...validBody, token: 'attacker-chosen' }));
    const body = await res.json();

    expect(res.status).toBe(201);
    expect(body.link).toMatch(/^http:\/\/localhost:3000\/signup\?invite=[A-Za-z0-9_-]{43}$/);

    const row = inviteInsert.insert.mock.calls[0][0][0];
    expect(row.inviter_id).toBe(landlord.id);
    expect(row.invitee_email).toBe('jane@example.com');
    // Every tenant pays the same fee, whatever the inviter sends.
    expect(row.admin_fee_amount).toBe(150);
    expect(row.token).not.toBe('attacker-chosen');
    expect(row).not.toHaveProperty('status');
  });

  it('refuses to invite to a property the caller does not own', async () => {
    mockServer({ properties: query({ data: { id: PROPERTY_ID, landlord_id: 'someone-else' } }) });
    const from = mockAdmin({});

    const res = await createInvite(post('http://localhost:3000/api/invites', validBody));

    expect(res.status).toBe(403);
    expect(from).not.toHaveBeenCalled();
  });

  it('returns 403 for tenants', async () => {
    vi.mocked(requireAuthenticatedRole).mockRejectedValue(new ForbiddenError());
    mockServer();
    const res = await createInvite(post('http://localhost:3000/api/invites', validBody));
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('GET /api/invites/[token]', () => {
  it('returns a public preview without internal ids or the token', async () => {
    mockAdmin({ tenant_invites: [query({ data: pendingInvite })] });

    const res = await previewInvite(new NextRequest(`http://localhost:3000/api/invites/${TOKEN}`), tokenParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invite).toMatchObject({
      invitee_email: 'jane@example.com',
      admin_fee_amount: 500,
      expired: false,
      property: { title: 'Sea Point Flat' },
      inviter_name: 'Lindiwe Landlord',
    });
    expect(JSON.stringify(body)).not.toContain(TOKEN);
    expect(body.invite).not.toHaveProperty('id');
  });

  it('returns 404 for a malformed token without touching the database', async () => {
    const from = mockAdmin({});
    const res = await previewInvite(new NextRequest('http://localhost:3000/api/invites/101'), tokenParams('101'));
    expect(res.status).toBe(404);
    expect(from).not.toHaveBeenCalled();
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/invites/[token]/claim', () => {
  beforeEach(() => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
  });

  it('links the invite to the signed-in tenant, guarded against a concurrent claim', async () => {
    mockServer();
    const fetchQ = query({ data: pendingInvite });
    const updateQ = query({ data: [{ id: 'invite-1' }] });
    mockAdmin({ tenant_invites: [fetchQ, updateQ] });

    const res = await claimInvite(post(`http://localhost:3000/api/invites/${TOKEN}/claim`), tokenParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.invite.status).toBe('registered');
    expect(updateQ.update.mock.calls[0][0]).toMatchObject({ tenant_id: tenant.id, status: 'registered' });
    expect(updateQ.is).toHaveBeenCalledWith('tenant_id', null);
  });

  it('refuses a user whose email differs from the invited email', async () => {
    mockServer({}, 'mallory@example.com');
    mockAdmin({ tenant_invites: [query({ data: pendingInvite })] });

    const res = await claimInvite(post(`http://localhost:3000/api/invites/${TOKEN}/claim`), tokenParams());

    expect(res.status).toBe(409);
    expect((await res.json()).error).toMatch(/different email/);
  });

  it('returns 409 when another account won the race', async () => {
    mockServer();
    mockAdmin({ tenant_invites: [query({ data: pendingInvite }), query({ data: [] })] });

    const res = await claimInvite(post(`http://localhost:3000/api/invites/${TOKEN}/claim`), tokenParams());
    expect(res.status).toBe(409);
  });

  it('is idempotent for the tenant who already claimed it', async () => {
    mockServer();
    const from = mockAdmin({ tenant_invites: [query({ data: { ...pendingInvite, status: 'paid', tenant_id: tenant.id } })] });

    const res = await claimInvite(post(`http://localhost:3000/api/invites/${TOKEN}/claim`), tokenParams());

    expect(res.status).toBe(200);
    expect((await res.json()).invite.status).toBe('paid');
    expect(from.mock.calls.filter(([t]) => t === 'tenant_invites')).toHaveLength(1); // no update
  });

  it('rejects landlord accounts', async () => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(landlord);
    mockServer();
    const res = await claimInvite(post(`http://localhost:3000/api/invites/${TOKEN}/claim`), tokenParams());
    expect(res.status).toBe(403);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/invites/[token]/pay', () => {
  const claimed = { ...pendingInvite, status: 'registered', tenant_id: tenant.id };

  beforeEach(() => {
    vi.mocked(getAuthenticatedProfile).mockResolvedValue(tenant);
    mockServer();
  });

  it('charges the R150 tenant fee and records a pending payment', async () => {
    const paymentInsert = query();
    mockAdmin({ tenant_invites: [query({ data: claimed })], payments: [paymentInsert] });

    const res = await payInvite(post(`http://localhost:3000/api/invites/${TOKEN}/pay`, { amount: 1 }), tokenParams());
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.processUrl).toContain('sandbox.payfast.co.za');
    expect(body.fields.amount).toBe('150.00');
    expect(body.fields.item_name).toBe('EasyRent24 Admin Fee');
    expect(body.fields.return_url).toBe(`http://localhost:3000/register/payment-success?invite=${TOKEN}`);

    const row = paymentInsert.insert.mock.calls[0][0][0];
    expect(row).toMatchObject({ invite_id: 'invite-1', amount_gross: 150, status: 'pending' });
    expect(row.m_payment_id).toMatch(/^INV-invite-1-\d+$/);
    expect(row.m_payment_id).toBe(body.fields.m_payment_id);
  });

  it('returns 403 when the invite belongs to another tenant', async () => {
    mockAdmin({ tenant_invites: [query({ data: { ...claimed, tenant_id: 'other' } })] });
    const res = await payInvite(post(`http://localhost:3000/api/invites/${TOKEN}/pay`), tokenParams());
    expect(res.status).toBe(403);
  });

  it('returns 400 when the admin fee is already paid', async () => {
    mockAdmin({ tenant_invites: [query({ data: { ...claimed, status: 'paid' } })] });
    const res = await payInvite(post(`http://localhost:3000/api/invites/${TOKEN}/pay`), tokenParams());
    expect(res.status).toBe(400);
  });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('PayFast ITN for an admin fee payment', () => {
  function itnRequest(status: 'COMPLETE' | 'FAILED') {
    const fields: [string, string][] = [
      ['m_payment_id', 'INV-invite-1-1'],
      ['pf_payment_id', 'pf-1'],
      ['payment_status', status],
      ['item_name', 'EasyRent24 Admin Fee'],
      ['amount_gross', '500.00'],
    ];
    fields.push(['signature', generateSignature(fields, ENV.PAYFAST_PASSPHRASE)]);
    return new NextRequest('http://localhost:3000/api/payments/payfast/notify', {
      method: 'POST',
      body: fields.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&'),
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    });
  }

  const payment = { id: 'pay-1', application_id: null, invite_id: 'invite-1', amount_gross: 500, status: 'pending' };

  it('marks the invite paid on a COMPLETE notification', async () => {
    const inviteUpdate = query();
    mockAdmin({ payments: [query({ data: payment }), query()], tenant_invites: [inviteUpdate] });

    const res = await notify(itnRequest('COMPLETE'));

    expect(res.status).toBe(200);
    expect(inviteUpdate.update.mock.calls[0][0]).toMatchObject({ status: 'paid' });
    expect(inviteUpdate.eq).toHaveBeenCalledWith('id', 'invite-1');
    expect(inviteUpdate.neq).toHaveBeenCalledWith('status', 'revoked');
  });

  it('leaves the invite untouched on a FAILED notification', async () => {
    const from = mockAdmin({ payments: [query({ data: payment }), query()] });

    const res = await notify(itnRequest('FAILED'));

    expect(res.status).toBe(200);
    expect(from).not.toHaveBeenCalledWith('tenant_invites');
  });
});
