// ============================================================================
// Adaptive Rate Limiting Layer
//
// Protects endpoints against brute-force attacks, DDoS, and automated spam.
// Supports:
// 1. High-performance in-memory sliding window (zero-dependency, perfect for
//    standalone container / dev environments).
// 2. Distributed Upstash Redis (activated if UPSTASH_REDIS_REST_URL is configured).
// ============================================================================

export type RateLimitTier = 'AUTH' | 'PAYMENTS' | 'MUTATIONS' | 'READS';

export interface RateLimitConfig {
  limit: number;
  windowMs: number;
}

export const RATE_LIMIT_TIERS: Record<RateLimitTier, RateLimitConfig> = {
  AUTH: { limit: 5, windowMs: 60 * 1000 },       // 5 per minute (login, register, token refresh)
  PAYMENTS: { limit: 5, windowMs: 60 * 1000 },   // 5 per minute (checkout initiation)
  MUTATIONS: { limit: 30, windowMs: 60 * 1000 }, // 30 per minute (POST, PATCH, DELETE)
  READS: { limit: 100, windowMs: 60 * 1000 },    // 100 per minute (GET)
};

export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  reset: number; // Unix timestamp (ms) when current window expires
  retryAfterSeconds: number;
}

// In-Memory sliding-window storage
interface WindowEntry {
  timestamps: number[];
}

const memoryStore = new Map<string, WindowEntry>();
const MAX_ENTRIES = 5000;

// Periodic cleanup of stale records every 5 minutes to prevent memory leaks
let lastCleanup = Date.now();
function cleanupStaleEntries(now: number, maxWindow: number) {
  if (now - lastCleanup < 60 * 1000) return;
  lastCleanup = now;

  for (const [key, entry] of memoryStore.entries()) {
    const valid = entry.timestamps.filter((ts) => now - ts < maxWindow);
    if (valid.length === 0) {
      memoryStore.delete(key);
    } else {
      entry.timestamps = valid;
    }
  }

  // If still above cap, drop oldest keys
  if (memoryStore.size > MAX_ENTRIES) {
    const keysToDelete = Array.from(memoryStore.keys()).slice(0, 1000);
    for (const k of keysToDelete) {
      memoryStore.delete(k);
    }
  }
}

/**
 * Checks if an identifier (IP address, user ID, or composite key) is allowed
 * under the specified rate limit tier.
 */
export async function checkRateLimit(
  identifier: string,
  tier: RateLimitTier = 'READS',
  customConfig?: Partial<RateLimitConfig>
): Promise<RateLimitResult> {
  const config: RateLimitConfig = {
    ...RATE_LIMIT_TIERS[tier],
    ...customConfig,
  };

  // Prevent unit test suites from hitting throttling unless testing rate limits explicitly
  if (process.env.NODE_ENV === 'test' && !customConfig?.limit) {
    config.limit = 10000;
  }

  const now = Date.now();
  const windowStart = now - config.windowMs;
  const key = `${tier}:${identifier}`;

  // Check Upstash Redis if configured
  const redisUrl = process.env.UPSTASH_REDIS_REST_URL;
  const redisToken = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (redisUrl && redisToken) {
    try {
      return await checkRedisRateLimit(redisUrl, redisToken, key, config, now);
    } catch (err) {
      // Fallback to in-memory on Redis connection failure (fail-open for transient network errors)
      console.warn('Upstash rate limit fallback to memory store:', err);
    }
  }

  // In-Memory Sliding Window
  cleanupStaleEntries(now, 10 * 60 * 1000);

  let entry = memoryStore.get(key);
  if (!entry) {
    entry = { timestamps: [] };
    memoryStore.set(key, entry);
  }

  // Keep only timestamps within the sliding window
  entry.timestamps = entry.timestamps.filter((ts) => ts > windowStart);

  const count = entry.timestamps.length;
  const allowed = count < config.limit;
  const remaining = Math.max(0, config.limit - count - (allowed ? 1 : 0));

  const oldestTimestamp = entry.timestamps[0] ?? now;
  const reset = oldestTimestamp + config.windowMs;
  const retryAfterSeconds = Math.max(1, Math.ceil((reset - now) / 1000));

  if (allowed) {
    entry.timestamps.push(now);
  }

  return {
    allowed,
    limit: config.limit,
    remaining,
    reset,
    retryAfterSeconds: allowed ? 0 : retryAfterSeconds,
  };
}

/**
 * Distributed rate limiter via Upstash REST API
 */
async function checkRedisRateLimit(
  url: string,
  token: string,
  key: string,
  config: RateLimitConfig,
  now: number
): Promise<RateLimitResult> {
  const expireSeconds = Math.ceil(config.windowMs / 1000);

  // Multi-exec pipeline via Upstash REST: ZREMRANGEBYSCORE, ZADD, ZCARD, EXPIRE
  const pipeline = [
    ['ZREMRANGEBYSCORE', key, 0, now - config.windowMs],
    ['ZADD', key, now, `${now}-${Math.random()}`],
    ['ZCARD', key],
    ['EXPIRE', key, expireSeconds],
  ];

  const res = await fetch(`${url}/pipeline`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(pipeline),
  });

  if (!res.ok) {
    throw new Error(`Upstash error: ${res.statusText}`);
  }

  const data = (await res.json()) as Array<{ result?: number }>;
  const count = data[2]?.result ?? 1;

  const allowed = count <= config.limit;
  const remaining = Math.max(0, config.limit - count);
  const reset = now + config.windowMs;
  const retryAfterSeconds = allowed ? 0 : Math.ceil(config.windowMs / 1000);

  return {
    allowed,
    limit: config.limit,
    remaining,
    reset,
    retryAfterSeconds,
  };
}

/**
 * Returns standard rate limit headers to attach to HTTP responses.
 */
export function getRateLimitHeaders(result: RateLimitResult): Record<string, string> {
  const headers: Record<string, string> = {
    'X-RateLimit-Limit': String(result.limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.reset / 1000)),
  };

  if (!result.allowed) {
    headers['Retry-After'] = String(result.retryAfterSeconds);
  }

  return headers;
}

/**
 * Helper to reset in-memory store (for unit tests).
 */
export function _resetMemoryStore(): void {
  memoryStore.clear();
}
