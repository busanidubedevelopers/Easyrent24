import { describe, it, expect, beforeEach } from 'vitest';
import {
  checkRateLimit,
  getRateLimitHeaders,
  _resetMemoryStore,
} from '../lib/security/rateLimiter';

describe('Adaptive Rate Limiter', () => {
  beforeEach(() => {
    _resetMemoryStore();
  });

  it('allows requests within the limit', async () => {
    const customConfig = { limit: 3, windowMs: 1000 };

    const res1 = await checkRateLimit('user1', 'AUTH', customConfig);
    expect(res1.allowed).toBe(true);
    expect(res1.remaining).toBe(2);

    const res2 = await checkRateLimit('user1', 'AUTH', customConfig);
    expect(res2.allowed).toBe(true);
    expect(res2.remaining).toBe(1);

    const res3 = await checkRateLimit('user1', 'AUTH', customConfig);
    expect(res3.allowed).toBe(true);
    expect(res3.remaining).toBe(0);
  });

  it('blocks requests that exceed the limit with 429 semantics', async () => {
    const customConfig = { limit: 2, windowMs: 1000 };

    await checkRateLimit('user2', 'PAYMENTS', customConfig);
    await checkRateLimit('user2', 'PAYMENTS', customConfig);

    const blocked = await checkRateLimit('user2', 'PAYMENTS', customConfig);
    expect(blocked.allowed).toBe(false);
    expect(blocked.remaining).toBe(0);
    expect(blocked.retryAfterSeconds).toBeGreaterThan(0);
  });

  it('generates standard rate limit headers', async () => {
    const customConfig = { limit: 1, windowMs: 1000 };

    const allowed = await checkRateLimit('user3', 'READS', customConfig);
    const allowedHeaders = getRateLimitHeaders(allowed);
    expect(allowedHeaders['X-RateLimit-Limit']).toBe('1');
    expect(allowedHeaders['X-RateLimit-Remaining']).toBe('0');
    expect(allowedHeaders['Retry-After']).toBeUndefined();

    const blocked = await checkRateLimit('user3', 'READS', customConfig);
    const blockedHeaders = getRateLimitHeaders(blocked);
    expect(blockedHeaders['X-RateLimit-Limit']).toBe('1');
    expect(blockedHeaders['X-RateLimit-Remaining']).toBe('0');
    expect(Number(blockedHeaders['Retry-After'])).toBeGreaterThan(0);
  });

  it('tracks distinct rate limits for different identifiers', async () => {
    const customConfig = { limit: 1, windowMs: 1000 };

    const resA = await checkRateLimit('userA', 'MUTATIONS', customConfig);
    expect(resA.allowed).toBe(true);

    const resB = await checkRateLimit('userB', 'MUTATIONS', customConfig);
    expect(resB.allowed).toBe(true);

    // userA should now be blocked, but userC still allowed
    const resABlocked = await checkRateLimit('userA', 'MUTATIONS', customConfig);
    expect(resABlocked.allowed).toBe(false);

    const resC = await checkRateLimit('userC', 'MUTATIONS', customConfig);
    expect(resC.allowed).toBe(true);
  });
});
