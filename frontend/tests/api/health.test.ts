import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET } from '../../app/api/health/route';

vi.mock('../../../backend/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

const { getSupabaseAdmin } = await import('../../../backend/lib/supabaseAdmin');

/**
 * Build a mock Supabase admin client whose from().select().limit() chain
 * resolves to the given { data, error } result.  The health route does:
 *   supabase.from('profiles').select('id').limit(1)
 */
function mockAdmin(result: { data: unknown; error: unknown }) {
  vi.mocked(getSupabaseAdmin).mockReturnValue({
    from: vi.fn().mockReturnValue({
      select: vi.fn().mockReturnValue({
        limit: vi.fn().mockResolvedValue(result),
      }),
    }),
  } as any);
}

beforeEach(() => vi.clearAllMocks());

describe('GET /api/health', () => {
  it('returns 200 with status ok when the database is reachable', async () => {
    mockAdmin({ data: [{ id: 'some-id' }], error: null });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.backendImportWorking).toBe(true);
    expect(typeof body.timestamp).toBe('string');
  });

  it('returns a valid ISO timestamp', async () => {
    mockAdmin({ data: [{ id: 'some-id' }], error: null });

    const res = await GET();
    const { timestamp } = await res.json();

    expect(new Date(timestamp).getTime()).toBeGreaterThan(0);
  });

  it('returns 200 when the database query returns no rows (empty table)', async () => {
    // An empty result is still a successful query — the table exists and
    // the connection works, which is all the health check cares about.
    mockAdmin({ data: [], error: null });

    const res = await GET();
    expect(res.status).toBe(200);
    expect((await res.json()).status).toBe('ok');
  });

  it('returns 500 with stage "database" when the query fails', async () => {
    mockAdmin({ data: null, error: { message: 'Connection refused' } });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.status).toBe('error');
    expect(body.stage).toBe('database');
    expect(body.message).toBe('Connection refused');
  });

  it('returns 500 with stage "config" when getSupabaseAdmin throws', async () => {
    vi.mocked(getSupabaseAdmin).mockImplementation(() => {
      throw new Error('SUPABASE_URL not configured');
    });

    const res = await GET();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(body.status).toBe('error');
    expect(body.stage).toBe('config');
    expect(body.message).toBe('SUPABASE_URL not configured');
  });
});
