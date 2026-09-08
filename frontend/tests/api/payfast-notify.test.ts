import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '../../app/api/payments/payfast/notify/route';
import { generateSignature } from '../../../backend/lib/payfast';

// The notify route calls validateWithPayfast() — an outbound HTTP request to
// PayFast's servers that cannot run in tests. We mock the whole payfast module
// but keep the real generateSignature so we can build valid signatures.
vi.mock('../../../backend/lib/payfast', async (importOriginal) => {
  const real = await importOriginal<typeof import('../../../backend/lib/payfast')>();
  return {
    ...real,
    validateWithPayfast: vi.fn(),
  };
});

vi.mock('../../../backend/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const { validateWithPayfast } = await import('../../../backend/lib/payfast');
const { getSupabaseAdmin } = await import('../../../backend/lib/supabaseAdmin');

// ── ITN body builder ──────────────────────────────────────────────────────────

const PASSPHRASE = 'test-passphrase';

/**
 * Build a URL-encoded ITN body with a valid signature, matching how PayFast
 * would POST to our endpoint. Overrides let individual tests tamper with
 * specific fields to trigger error paths.
 */
function buildItnBody(
  mPaymentId: string,
  amountGross: string,
  paymentStatus: 'COMPLETE' | 'FAILED',
  overrides: Record<string, string> = {}
): string {
  const fields: [string, string][] = [
    ['m_payment_id', mPaymentId],
    ['pf_payment_id', 'pf-99'],
    ['payment_status', paymentStatus],
    ['item_name', 'EasyRent24 Application Fee'],
    ['amount_gross', amountGross],
    ['amount_fee', '10.00'],
    ['amount_net', String(parseFloat(amountGross) - 10)],
    ['name_first', 'Alice'],
    ['name_last', 'Applicant'],
    ['email_address', 'alice@example.com'],
    ...Object.entries(overrides).filter(([k]) => k !== 'signature'),
  ];

  const sig = overrides.signature ?? generateSignature(fields, PASSPHRASE);
  fields.push(['signature', sig]);

  return fields.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
}

function makeItnRequest(body: string): NextRequest {
  return new NextRequest('http://localhost:3000/api/payments/payfast/notify', {
    method: 'POST',
    body,
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
  });
}

// ── Supabase admin mock helpers ───────────────────────────────────────────────

const mockPayment = {
  id: 'pay-001',
  application_id: 'app-001',
  amount_gross: 250,
  status: 'pending',
};

function mockAdminWithPayment(
  payment: object | null,
  dbError: object | null = null
) {
  const updateEqMock = vi.fn().mockResolvedValue({ error: null });
  const updateMock = vi.fn().mockReturnValue({ eq: updateEqMock });

  const maybeSingleMock = vi.fn().mockResolvedValue({ data: payment, error: dbError });
  const appMaybeSingleMock = vi.fn().mockResolvedValue({
    data: { status: 'pending' },
    error: null,
  });

  const fromMock = vi.fn((table: string) => {
    if (table === 'payments') {
      return {
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle: maybeSingleMock }),
        }),
        update: updateMock,
      };
    }
    // applications table
    return {
      select: vi.fn().mockReturnValue({
        eq: vi.fn().mockReturnValue({ maybeSingle: appMaybeSingleMock }),
      }),
      update: updateMock,
    };
  });

  vi.mocked(getSupabaseAdmin).mockReturnValue({ from: fromMock } as any);
  return { updateMock, updateEqMock };
}

const savedEnv: Record<string, string | undefined> = {};
beforeEach(() => {
  vi.clearAllMocks();
  for (const k of ['PAYFAST_PASSPHRASE', 'PAYFAST_MODE']) savedEnv[k] = process.env[k];
  process.env.PAYFAST_PASSPHRASE = PASSPHRASE;
  process.env.PAYFAST_MODE = 'sandbox';
  // Default: server-to-server validation passes.
  vi.mocked(validateWithPayfast).mockResolvedValue(true);
});
afterEach(() => {
  for (const [k, v] of Object.entries(savedEnv)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

// ─────────────────────────────────────────────────────────────────────────────
describe('POST /api/payments/payfast/notify', () => {

  describe('Happy path — COMPLETE payment', () => {
    it('returns 200 { received: true } and updates payment + application', async () => {
      const { updateMock } = mockAdminWithPayment(mockPayment);
      const body = buildItnBody('PAY-001', '250.00', 'COMPLETE');

      const res = await POST(makeItnRequest(body));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.received).toBe(true);
      // Payment row must have been updated to 'complete'.
      const paymentUpdate = updateMock.mock.calls.find(
        (c) => c[0]?.status === 'complete'
      );
      expect(paymentUpdate).toBeDefined();
    });

    it('advances the application status to reviewing', async () => {
      const { updateMock } = mockAdminWithPayment(mockPayment);
      const body = buildItnBody('PAY-001', '250.00', 'COMPLETE');

      await POST(makeItnRequest(body));

      const appUpdate = updateMock.mock.calls.find(
        (c) => c[0]?.status === 'reviewing'
      );
      expect(appUpdate).toBeDefined();
    });
  });

  describe('Happy path — FAILED payment', () => {
    it('marks payment as failed and does NOT advance application', async () => {
      const { updateMock } = mockAdminWithPayment(mockPayment);
      const body = buildItnBody('PAY-001', '250.00', 'FAILED');

      const res = await POST(makeItnRequest(body));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.received).toBe(true);

      const payFailed = updateMock.mock.calls.find((c) => c[0]?.status === 'failed');
      expect(payFailed).toBeDefined();

      const advancing = updateMock.mock.calls.find((c) => c[0]?.status === 'reviewing');
      expect(advancing).toBeUndefined();
    });
  });

  describe('Idempotency', () => {
    it('returns 200 { alreadyProcessed: true } when payment is already complete', async () => {
      mockAdminWithPayment({ ...mockPayment, status: 'complete' });
      const body = buildItnBody('PAY-001', '250.00', 'COMPLETE');

      const res = await POST(makeItnRequest(body));
      const json = await res.json();

      expect(res.status).toBe(200);
      expect(json.alreadyProcessed).toBe(true);
    });
  });

  describe('Signature validation', () => {
    it('returns 400 when the signature does not match', async () => {
      mockAdminWithPayment(mockPayment);
      const body = buildItnBody('PAY-001', '250.00', 'COMPLETE', {
        signature: 'deadbeefdeadbeefdeadbeefdeadbeef',
      });

      const res = await POST(makeItnRequest(body));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/invalid signature/i);
    });

    it('returns 400 when the signature field is missing entirely', async () => {
      mockAdminWithPayment(mockPayment);
      // Build without signature override — then strip it manually.
      const fields = 'm_payment_id=PAY-001&amount_gross=250.00&payment_status=COMPLETE';

      const res = await POST(makeItnRequest(fields));
      expect(res.status).toBe(400);
    });
  });

  describe('Server-to-server validation', () => {
    it('returns 400 when PayFast server-to-server validation fails', async () => {
      mockAdminWithPayment(mockPayment);
      vi.mocked(validateWithPayfast).mockResolvedValue(false);
      const body = buildItnBody('PAY-001', '250.00', 'COMPLETE');

      const res = await POST(makeItnRequest(body));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/validate with payfast/i);
    });
  });

  describe('Amount matching', () => {
    it('returns 400 and marks payment failed when amounts do not match', async () => {
      const { updateMock } = mockAdminWithPayment(mockPayment); // payment has amount 250
      // ITN claims 999.99 was paid — mismatch
      const body = buildItnBody('PAY-001', '999.99', 'COMPLETE');

      const res = await POST(makeItnRequest(body));
      const json = await res.json();

      expect(res.status).toBe(400);
      expect(json.error).toMatch(/amount mismatch/i);
      // Payment row must be updated to failed.
      const failedUpdate = updateMock.mock.calls.find((c) => c[0]?.status === 'failed');
      expect(failedUpdate).toBeDefined();
    });
  });

  describe('Unknown payment reference', () => {
    it('returns 404 when no payment record matches m_payment_id', async () => {
      mockAdminWithPayment(null); // no record found
      const body = buildItnBody('PAY-GHOST', '250.00', 'COMPLETE');

      const res = await POST(makeItnRequest(body));
      const json = await res.json();

      expect(res.status).toBe(404);
      expect(json.error).toMatch(/unknown payment/i);
    });
  });

  describe('Missing m_payment_id', () => {
    it('returns 400 when m_payment_id is absent from the ITN body', async () => {
      mockAdminWithPayment(null);
      // Build a body without m_payment_id field
      const fields: [string, string][] = [
        ['payment_status', 'COMPLETE'],
        ['amount_gross', '250.00'],
      ];
      const sig = generateSignature(fields, PASSPHRASE);
      const rawBody = [...fields, ['signature', sig]]
        .map(([k, v]) => `${k}=${encodeURIComponent(v)}`)
        .join('&');

      const res = await POST(makeItnRequest(rawBody));
      expect(res.status).toBe(400);
    });
  });
});
