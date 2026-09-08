# API Route Testing — Complete Setup Guide

**Goal**: Add integration tests for API routes to catch bugs before production

**Effort**: 2-3 hours for initial setup; ongoing 30 min per new route

**Files Provided**:
- `API_ROUTE_TESTING_GUIDE.md` — Comprehensive guide
- `frontend/tests/api/health.test.ts` — Example test file

---

## 🚀 Quick Start (15 minutes)

### Step 1: Create Test Directory

```bash
cd frontend
mkdir -p tests/api
mkdir -p tests/utils
```

### Step 2: Install Testing Dependencies

```bash
npm install --save-dev node-mocks-http @types/node-mocks-http
```

(vitest is already in `backend/package.json`, but we'll use it in frontend too)

### Step 3: Configure vitest for Frontend

Update `frontend/package.json`:

```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:api": "vitest run tests/api/",
    "test:api:watch": "vitest tests/api/"
  },
  "devDependencies": {
    "vitest": "^4.1.10"
  }
}
```

### Step 4: Create vitest Config

Create `frontend/vitest.config.ts`:

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx'],
    environment: 'node',
    globals: true,
  },
});
```

### Step 5: Run Example Test

```bash
cd frontend
npx vitest run tests/api/health.test.ts
```

Expected output:
```
✓ tests/api/health.test.ts (7 tests)
```

---

## 📋 File Structure

```
frontend/
├── vitest.config.ts              ← vitest configuration
├── package.json                  ← Add test scripts
├── app/
│   └── api/                      ← API routes to test
│       ├── health/
│       ├── applications/[id]/pay/
│       ├── payments/payfast/notify/
│       └── ...
├── tests/                        ← NEW: Test files
│   ├── api/
│   │   ├── health.test.ts       ← Example test
│   │   ├── applications-pay.test.ts
│   │   ├── payfast-notify.test.ts
│   │   └── ...
│   └── utils/
│       └── test-helpers.ts      ← Testing utilities
└── lib/
    └── supabaseServer.ts
```

---

## 🔧 Testing Utilities

Create `frontend/tests/utils/test-helpers.ts`:

```typescript
import { vi } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

/**
 * Mock a successful Supabase query
 */
export function mockSupabaseQuery(data: any, options: { error?: any } = {}) {
  return {
    data,
    error: options.error || null,
  };
}

/**
 * Mock a Supabase client
 */
export function createMockSupabaseClient(): SupabaseClient {
  return {
    from: vi.fn().mockReturnThis(),
    select: vi.fn().mockResolvedValue({ data: null, error: null }),
    insert: vi.fn().mockResolvedValue({ data: null, error: null }),
    update: vi.fn().mockResolvedValue({ data: null, error: null }),
    delete: vi.fn().mockResolvedValue({ data: null, error: null }),
    eq: vi.fn().mockResolvedValue({ data: null, error: null }),
    single: vi.fn().mockResolvedValue({ data: null, error: null }),
    maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
  } as any as SupabaseClient;
}

/**
 * Create a mock NextRequest
 */
export function createMockRequest(
  method: string = 'GET',
  url: string = 'http://localhost:3000/api/test',
  options: { body?: any; headers?: Record<string, string> } = {}
) {
  return new Request(url, {
    method,
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
}

/**
 * Create mock profile (authenticated user)
 */
export function createMockProfile(overrides: Partial<any> = {}) {
  return {
    id: 'test-user-id',
    email: 'test@example.com',
    role: 'tenant',
    ...overrides,
  };
}

/**
 * Create mock application
 */
export function createMockApplication(overrides: Partial<any> = {}) {
  return {
    id: 'test-app-id',
    applicant_id: 'test-user-id',
    application_fee_amount: 250.00,
    payment_status: 'pending',
    status: 'pending',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone: '0711234567',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Extract JSON from response
 */
export async function getResponseJson(response: Response) {
  const text = await response.clone().text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}
```

---

## 📝 Example: Test Payment Route

Create `frontend/tests/api/applications-pay.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/applications/[id]/pay/route';
import {
  createMockRequest,
  createMockProfile,
  createMockApplication,
  getResponseJson,
} from '../utils/test-helpers';

vi.mock('@/lib/supabaseServer');
vi.mock('@backend/lib/auth');
vi.mock('@backend/lib/supabaseAdmin');

describe('POST /api/applications/[id]/pay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.PAYFAST_MERCHANT_ID = '10000100';
    process.env.PAYFAST_MERCHANT_KEY = 'mk_test_123';
    process.env.PAYFAST_PASSPHRASE = 'test-passphrase';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  });

  describe('Happy Path', () => {
    it('returns 200 with payment form when user can pay', async () => {
      // Arrange
      const { getSupabaseServerClient } = await import('@/lib/supabaseServer');
      const { getAuthenticatedProfile } = await import('@backend/lib/auth');
      const { getSupabaseAdmin } = await import('@backend/lib/supabaseAdmin');

      const profile = createMockProfile();
      const application = createMockApplication({
        applicant_id: profile.id,
      });

      vi.mocked(getAuthenticatedProfile).mockResolvedValue(profile);
      vi.mocked(getSupabaseServerClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi
            .fn()
            .mockResolvedValueOnce({ data: application, error: null })
            .mockResolvedValueOnce({ data: application, error: null }), // For update
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: application, error: null }),
          update: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      } as any);

      vi.mocked(getSupabaseAdmin).mockReturnValue({
        from: vi.fn().mockReturnValue({
          insert: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      } as any);

      const request = createMockRequest('POST', `http://localhost:3000/api/applications/${application.id}/pay`);

      // Act
      const response = await POST(request as any, {
        params: Promise.resolve({ id: application.id }),
      } as any);

      // Assert
      expect(response.status).toBe(200);
      const data = await getResponseJson(response);
      expect(data.processUrl).toBeDefined();
      expect(data.fields).toBeDefined();
      expect(data.fields.merchant_id).toBe('10000100');
      expect(data.fields.amount).toBe('250.00');
      expect(data.fields.signature).toBeDefined();
    });
  });

  describe('Authorization Errors', () => {
    it('returns 401 when user is not authenticated', async () => {
      // Arrange
      const { getAuthenticatedProfile } = await import('@backend/lib/auth');
      vi.mocked(getAuthenticatedProfile).mockRejectedValue(new Error('Unauthorized'));

      const request = createMockRequest('POST', 'http://localhost:3000/api/applications/123/pay');

      // Act
      const response = await POST(request as any, {
        params: Promise.resolve({ id: '123' }),
      } as any);

      // Assert
      expect(response.status).toBe(401);
    });

    it('returns 403 when user does not own the application', async () => {
      // Arrange
      const { getSupabaseServerClient } = await import('@/lib/supabaseServer');
      const { getAuthenticatedProfile } = await import('@backend/lib/auth');

      const userProfile = createMockProfile({ id: 'user-1' });
      const application = createMockApplication({ applicant_id: 'user-2' });

      vi.mocked(getAuthenticatedProfile).mockResolvedValue(userProfile);
      vi.mocked(getSupabaseServerClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: application, error: null }),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: application, error: null }),
        }),
      } as any);

      const request = createMockRequest('POST', `http://localhost:3000/api/applications/${application.id}/pay`);

      // Act
      const response = await POST(request as any, {
        params: Promise.resolve({ id: application.id }),
      } as any);

      // Assert
      expect(response.status).toBe(403);
      const data = await getResponseJson(response);
      expect(data.error).toContain('own application');
    });
  });

  describe('Business Logic Errors', () => {
    it('returns 400 when application fee already paid', async () => {
      // Arrange
      const { getSupabaseServerClient } = await import('@/lib/supabaseServer');
      const { getAuthenticatedProfile } = await import('@backend/lib/auth');

      const profile = createMockProfile();
      const application = createMockApplication({
        applicant_id: profile.id,
        payment_status: 'paid',
      });

      vi.mocked(getAuthenticatedProfile).mockResolvedValue(profile);
      vi.mocked(getSupabaseServerClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: application, error: null }),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: application, error: null }),
        }),
      } as any);

      const request = createMockRequest('POST', `http://localhost:3000/api/applications/${application.id}/pay`);

      // Act
      const response = await POST(request as any, {
        params: Promise.resolve({ id: application.id }),
      } as any);

      // Assert
      expect(response.status).toBe(400);
      const data = await getResponseJson(response);
      expect(data.error).toContain('already been paid');
    });

    it('returns 404 when application not found', async () => {
      // Arrange
      const { getSupabaseServerClient } = await import('@/lib/supabaseServer');
      const { getAuthenticatedProfile } = await import('@backend/lib/auth');

      const profile = createMockProfile();
      vi.mocked(getAuthenticatedProfile).mockResolvedValue(profile);
      vi.mocked(getSupabaseServerClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: null, error: null }),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: null, error: null }),
        }),
      } as any);

      const request = createMockRequest('POST', 'http://localhost:3000/api/applications/nonexistent/pay');

      // Act
      const response = await POST(request as any, {
        params: Promise.resolve({ id: 'nonexistent' }),
      } as any);

      // Assert
      expect(response.status).toBe(404);
      const data = await getResponseJson(response);
      expect(data.error).toContain('not found');
    });
  });

  describe('Configuration Errors', () => {
    it('returns 503 when PayFast is not configured', async () => {
      // Arrange
      delete process.env.PAYFAST_MERCHANT_ID;

      const { getSupabaseServerClient } = await import('@/lib/supabaseServer');
      const { getAuthenticatedProfile } = await import('@backend/lib/auth');

      const profile = createMockProfile();
      const application = createMockApplication({ applicant_id: profile.id });

      vi.mocked(getAuthenticatedProfile).mockResolvedValue(profile);
      vi.mocked(getSupabaseServerClient).mockResolvedValue({
        from: vi.fn().mockReturnValue({
          select: vi.fn().mockResolvedValue({ data: application, error: null }),
          eq: vi.fn().mockReturnThis(),
          maybeSingle: vi.fn().mockResolvedValue({ data: application, error: null }),
        }),
      } as any);

      const request = createMockRequest('POST', `http://localhost:3000/api/applications/${application.id}/pay`);

      // Act
      const response = await POST(request as any, {
        params: Promise.resolve({ id: application.id }),
      } as any);

      // Assert
      expect(response.status).toBe(503);
      const data = await getResponseJson(response);
      expect(data.error).toContain('not configured');
    });
  });
});
```

---

## 🏃 Running Tests

### Run all API tests
```bash
npm run test:api
```

### Run specific test file
```bash
npx vitest run tests/api/health.test.ts
```

### Watch mode (re-run on file changes)
```bash
npm run test:api:watch
```

### Coverage report
```bash
npx vitest run --coverage tests/api/
```

---

## ✅ Coverage Checklist

For each API route, test:

- [ ] **Happy path** — Valid request, authorized user → 200 with expected response
- [ ] **Authentication** — No auth → 401
- [ ] **Authorization** — Auth but not allowed → 403  
- [ ] **Not found** — Resource doesn't exist → 404
- [ ] **Invalid input** — Bad data → 400
- [ ] **Configuration error** — Missing env vars → 503
- [ ] **Database error** — Query fails → 500
- [ ] **Idempotency** — Same request twice → safe to repeat

---

## 📊 Critical Routes to Test First

### Tier 1: Security-Critical (Week 1)
```
POST   /api/auth/me                       Authentication check
POST   /api/applications/[id]/pay         Payment initiation
POST   /api/payments/payfast/notify       ITN callback (already has manual tests)
```

### Tier 2: Business Logic (Week 2)
```
POST   /api/applications                  Submit application
GET    /api/applications/[id]             Get application details
PATCH  /api/applications/[id]             Update application
GET    /api/applications                  List applications
```

### Tier 3: Nice-to-Have (Week 3+)
```
GET    /api/properties                    List properties
POST   /api/properties                    Create property
GET    /api/landlord/dashboard            Dashboard data
```

---

## 🎯 Integration with CI/CD

Once tests are working, add to GitHub Actions (or your CI):

```yaml
# .github/workflows/test.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: |
          cd backend && npm ci
          cd ../frontend && npm ci
      
      - name: Run unit tests
        run: cd backend && npm test
      
      - name: Run API route tests
        run: cd frontend && npm run test:api
```

---

## 🚦 Status

### What You Can Do Now
- ✅ Test `/api/health` (example provided)
- ✅ Test any route using the pattern
- ✅ Mock Supabase client
- ✅ Test authorization/authentication
- ✅ Test error scenarios

### What You Can't Do Yet
- ❌ Test actual database (would need real Supabase setup)
- ❌ Test PayFast callbacks (already covered by manual testing)
- ❌ Test real authentication (Supabase auth flow is complex)

---

## 📚 Learning Resources

- [vitest Docs](https://vitest.dev/)
- [Next.js API Routes](https://nextjs.org/docs/pages/building-your-application/routing/api-routes)
- [Unit Testing Best Practices](https://github.com/goldbergyoni/javascript-testing-best-practices)
- [Mock Patterns](https://vitest.dev/guide/mocking.html)

---

## ⏱️ Time Estimates

- **Setup** (install deps, create config): 15 min
- **Learn pattern** (read guide, review example): 30 min
- **Test one route** (health endpoint): 15 min
- **Test payment route**: 45 min
- **Test auth/application routes**: 1-2 hours per route

**Total for comprehensive coverage**: 8-10 hours

---

## 🎉 You're Ready

Start with:
1. Follow "Quick Start" above (15 min)
2. Run the example test: `npm run test:api tests/api/health.test.ts`
3. Read `API_ROUTE_TESTING_GUIDE.md` for patterns
4. Create tests for critical routes using the examples
5. Add to CI/CD

**Let's go! 🚀**

