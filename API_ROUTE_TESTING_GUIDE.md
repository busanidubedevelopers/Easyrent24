# API Route Testing Guide

**Goal**: Add integration tests for Next.js API routes to catch regressions and ensure correct behavior.

**Current Status**: ❌ No API route tests (only unit tests of business logic)

**Why It Matters**: 
- Unit tests verify functions work in isolation (good!)
- But they don't test:
  - Middleware behavior (authentication, role checks)
  - Request/response handling
  - HTTP status codes
  - Error scenarios through actual endpoints
  - Integration between multiple functions

---

## 📋 Overview: What We're Testing

### Test Pyramid

```
                    /\
                   /  \         E2E Tests
                  /    \        (Slow, realistic)
                 /------\
                /        \      Integration Tests
               /          \     (API routes)
              /----------  \
             /              \   Unit Tests
            /________________\ (Fast, isolated)
           INTEGRATION        UNIT
```

We have ✅ **Unit tests** (bottom).  
We need ✅ **Integration tests** (middle).  
We don't need ❌ **E2E tests yet** (top).

---

## 🛠️ Recommended Stack

### Testing Framework: vitest (already installed!)
- Already used for backend unit tests
- Same syntax for route tests
- Fast and modern

### Mocking Supabase
We'll use `vitest`'s built-in mocking to avoid hitting real databases.

### Testing Utilities
- `supertest` — HTTP assertions (optional, we can build our own)
- Or use Next.js testing utilities directly

---

## Option 1: Using supertest (Recommended for HTTP Testing)

### Step 1: Install Dependencies

```bash
cd frontend
npm install --save-dev supertest @types/supertest
```

### Step 2: Create Test Helper

Create `frontend/tests/api-test-utils.ts`:

```typescript
import { createRequest, createResponse } from 'node-mocks-http';
import type { NextRequest, NextResponse } from 'next/server';

/**
 * Helper to test Next.js API routes
 * Mocks NextRequest and NextResponse objects
 */
export function createMockNextRequest(
  method: string,
  url: string,
  options: {
    body?: any;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}
): NextRequest {
  const urlObj = new URL(url, 'http://localhost:3000');
  
  return new Request(urlObj, {
    method,
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  }) as unknown as NextRequest;
}

/**
 * Helper to extract response data from NextResponse
 */
export async function getResponseData(response: Response) {
  const text = await response.text();
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
```

### Step 3: Create Your First Route Test

Create `frontend/tests/api/health.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/health/route';
import type { NextResponse } from 'next/server';

// Mock the Supabase admin client
vi.mock('@backend/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with status ok when database is reachable', async () => {
    // Arrange: Mock Supabase to return success
    const { getSupabaseAdmin } = await import('@backend/lib/supabaseAdmin');
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'test-id' }],
          error: null,
        }),
      }),
    } as any);

    // Act: Call the route handler
    const response = (await GET()) as Response;

    // Assert: Check response
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
    expect(data.backendImportWorking).toBe(true);
  });

  it('returns 500 with error when database query fails', async () => {
    // Arrange: Mock Supabase to return error
    const { getSupabaseAdmin } = await import('@backend/lib/supabaseAdmin');
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: null,
          error: { message: 'Connection refused' },
        }),
      }),
    } as any);

    // Act: Call the route handler
    const response = (await GET()) as Response;

    // Assert: Check response
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.status).toBe('error');
    expect(data.stage).toBe('database');
  });

  it('returns 500 when Supabase client initialization fails', async () => {
    // Arrange: Mock getSupabaseAdmin to throw
    const { getSupabaseAdmin } = await import('@backend/lib/supabaseAdmin');
    vi.mocked(getSupabaseAdmin).mockImplementation(() => {
      throw new Error('SUPABASE_URL not configured');
    });

    // Act: Call the route handler
    const response = (await GET()) as Response;

    // Assert: Check response
    expect(response.status).toBe(500);
    const data = await response.json();
    expect(data.status).toBe('error');
    expect(data.stage).toBe('config');
  });
});
```

### Step 4: Run Tests

```bash
cd frontend
npx vitest run tests/api/health.test.ts
```

---

## Option 2: Using node-mocks-http (Simpler, No Dependencies)

If you prefer not to add `supertest`, use `node-mocks-http`:

### Step 1: Install

```bash
cd frontend
npm install --save-dev node-mocks-http @types/node-mocks-http
```

### Step 2: Create Test Utilities

Create `frontend/tests/api-utils.ts`:

```typescript
import { createRequest, createResponse } from 'node-mocks-http';
import type { NextRequest, NextResponse } from 'next/server';

export interface MockRequest {
  headers: Record<string, string>;
  method: string;
  url: string;
  cookies: Record<string, string>;
}

export function createMockRequest(
  method: string,
  url: string,
  options: { body?: any; headers?: Record<string, string> } = {}
): NextRequest {
  const req = createRequest({
    method,
    url,
    body: options.body,
    headers: {
      'Content-Type': 'application/json',
      ...options.headers,
    },
  });
  return req as any as NextRequest;
}

export function createMockResponse() {
  return createResponse() as any as NextResponse;
}
```

---

## 🎯 Pattern: Testing Protected Routes

Most API routes require authentication. Here's how to test them:

### Example: Testing `/api/applications/[id]/pay`

Create `frontend/tests/api/applications-pay.test.ts`:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from '@/app/api/applications/[id]/pay/route';

// Mock the auth and Supabase modules
vi.mock('@/lib/supabaseServer', () => ({
  getSupabaseServerClient: vi.fn(),
}));

vi.mock('@backend/lib/auth', () => ({
  getAuthenticatedProfile: vi.fn(),
  ForbiddenError: class ForbiddenError extends Error {},
}));

vi.mock('@backend/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe('POST /api/applications/[id]/pay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 401 when user is not authenticated', async () => {
    // Arrange
    const { getSupabaseServerClient } = await import('@/lib/supabaseServer');
    const { getAuthenticatedProfile } = await import('@backend/lib/auth');
    
    vi.mocked(getAuthenticatedProfile).mockRejectedValue(
      new Error('Unauthorized')
    );

    // Create mock request
    const request = new Request('http://localhost:3000/api/applications/123/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

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
    const { getAuthenticatedProfile, ForbiddenError } = await import('@backend/lib/auth');
    
    // User authenticated but doesn't own application
    vi.mocked(getAuthenticatedProfile).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'tenant',
    });

    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: {
            id: '123',
            applicant_id: 'user-2', // Different user
            application_fee_amount: 250,
            payment_status: 'pending',
            first_name: 'Test',
            last_name: 'User',
          },
          error: null,
        }),
      }),
    });

    const request = new Request('http://localhost:3000/api/applications/123/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Act
    const response = await POST(request as any, {
      params: Promise.resolve({ id: '123' }),
    } as any);

    // Assert
    expect(response.status).toBe(403);
  });

  it('returns 400 when application fee already paid', async () => {
    // Arrange
    const { getSupabaseServerClient } = await import('@/lib/supabaseServer');
    const { getAuthenticatedProfile } = await import('@backend/lib/auth');
    
    vi.mocked(getAuthenticatedProfile).mockResolvedValue({
      id: 'user-1',
      email: 'user@example.com',
      role: 'tenant',
    });

    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: {
            id: '123',
            applicant_id: 'user-1',
            application_fee_amount: 250,
            payment_status: 'paid', // Already paid
            first_name: 'Test',
            last_name: 'User',
          },
          error: null,
        }),
      }),
    });

    const request = new Request('http://localhost:3000/api/applications/123/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Act
    const response = await POST(request as any, {
      params: Promise.resolve({ id: '123' }),
    } as any);

    // Assert
    expect(response.status).toBe(400);
    const data = await response.json();
    expect(data.error).toContain('already been paid');
  });

  it('returns payment form fields when all conditions met', async () => {
    // Arrange
    const { getSupabaseServerClient } = await import('@/lib/supabaseServer');
    const { getAuthenticatedProfile } = await import('@backend/lib/auth');
    const { getSupabaseAdmin } = await import('@backend/lib/supabaseAdmin');
    
    vi.mocked(getAuthenticatedProfile).mockResolvedValue({
      id: 'user-1',
      email: 'test@example.com',
      role: 'tenant',
    });

    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: {
            id: '123',
            applicant_id: 'user-1',
            application_fee_amount: 250,
            payment_status: 'pending',
            first_name: 'John',
            last_name: 'Doe',
          },
          error: null,
        }),
        update: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue({
        insert: vi.fn().mockResolvedValue({ error: null }),
      }),
    });

    // Set PayFast environment variables
    process.env.PAYFAST_MERCHANT_ID = '10000100';
    process.env.PAYFAST_MERCHANT_KEY = 'mk_test_123';
    process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';

    const request = new Request('http://localhost:3000/api/applications/123/pay', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
    });

    // Act
    const response = await POST(request as any, {
      params: Promise.resolve({ id: '123' }),
    } as any);

    // Assert
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.processUrl).toBeDefined();
    expect(data.fields).toBeDefined();
    expect(data.fields.merchant_id).toBe('10000100');
    expect(data.fields.amount).toBe('250.00');
    expect(data.fields.signature).toBeDefined();
  });
});
```

---

## 📊 Test Structure

Follow the **AAA pattern** (Arrange → Act → Assert):

```typescript
it('does something when condition is met', async () => {
  // Arrange: Set up mocks and data
  const mockFn = vi.fn().mockResolvedValue({ data: null, error: null });
  
  // Act: Call the function/endpoint
  const result = await myFunction();
  
  // Assert: Check the result
  expect(result).toBe(expected);
});
```

---

## 🎯 Testing Checklist for Each Route

### Happy Path
- ✅ Valid input + authorized user → 200 with expected data

### Error Cases
- ✅ Unauthorized (no auth) → 401
- ✅ Forbidden (auth but not authorized) → 403
- ✅ Not found (resource doesn't exist) → 404
- ✅ Invalid input (bad data) → 400
- ✅ Database error → 500

### Edge Cases
- ✅ Duplicate requests (idempotency)
- ✅ Concurrent requests
- ✅ Malformed input
- ✅ Missing required fields

---

## 🚀 Getting Started

### Step 1: Set Up Test Infrastructure

```bash
# Create test directory
mkdir -p frontend/tests/api

# Install testing dependencies
cd frontend
npm install --save-dev vitest node-mocks-http @types/node-mocks-http
```

### Step 2: Create Test Utils

Create `frontend/tests/api-test-utils.ts` with helper functions.

### Step 3: Test One Route

Start with a simple route like `/api/health`, follow the examples above.

### Step 4: Run Tests

```bash
cd frontend
npx vitest run tests/api/
```

### Step 5: Add to CI/CD

Later, when you set up CI/CD (Task 2), add to your pipeline:

```bash
npm run test:api
```

And update `frontend/package.json`:

```json
{
  "scripts": {
    "test:api": "vitest run tests/api/",
    "test:api:watch": "vitest tests/api/"
  }
}
```

---

## 📝 Example Test File Structure

```typescript
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';

// Import route and dependencies to mock
import { POST } from '@/app/api/route';

// Mock all external dependencies
vi.mock('@/lib/supabaseServer');
vi.mock('@backend/lib/auth');
vi.mock('@backend/lib/supabaseAdmin');

describe('POST /api/endpoint', () => {
  // Clean up before each test
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return 200 when request is valid', async () => {
    // Arrange: Set up mocks
    // Act: Call endpoint
    // Assert: Check result
  });

  it('should return 401 when unauthenticated', async () => {
    // Arrange
    // Act
    // Assert
  });

  it('should return 400 when input is invalid', async () => {
    // Arrange
    // Act
    // Assert
  });
});
```

---

## 🔗 Critical Routes to Test

Priority order for test coverage:

### Tier 1: Security-Critical (Do First)
- ✅ `POST /api/auth/me` — Auth check
- ✅ `POST /api/applications/[id]/pay` — Payment initiation
- ✅ `POST /api/payments/payfast/notify` — ITN callback (already has manual tests)

### Tier 2: Business Logic
- ✅ `POST /api/applications` — Application submission
- ✅ `GET /api/applications/[id]` — Application retrieval
- ✅ `PATCH /api/applications/[id]` — Application updates

### Tier 3: Nice-to-Have
- ✅ `GET /api/properties` — Property listing
- ✅ `POST /api/properties` — Property creation
- ✅ `GET /api/landlord/dashboard` — Dashboard data

---

## ⚠️ Common Pitfalls

### ❌ Don't
- Hit real database in tests (use mocks)
- Test external APIs (PayFast, etc. — mock them)
- Skip authentication tests
- Ignore error cases
- Use hardcoded IDs (use factories or fixtures)

### ✅ Do
- Mock all external dependencies
- Test happy path + error paths
- Test authorization and authentication
- Use descriptive test names
- Use data factories for complex objects

---

## 🎓 Next Steps

1. **Set up test infrastructure** (30 min)
   - Install dependencies
   - Create test utils
   - Configure vitest for frontend

2. **Test critical routes** (2-3 hours)
   - `/api/auth/me`
   - `/api/applications/[id]/pay`
   - `/api/payments/payfast/notify`

3. **Test business logic routes** (4-5 hours)
   - `/api/applications`
   - `/api/properties`
   - etc.

4. **Add to CI/CD** (1 hour)
   - Run tests on every PR
   - Block merge if tests fail

**Total effort**: 8-10 hours to get comprehensive coverage

---

## 📚 Resources

- [vitest Documentation](https://vitest.dev/)
- [Next.js Testing](https://nextjs.org/docs/testing)
- [Node Mocks HTTP](https://github.com/darrylwest/node-mocks-http)
- [Testing Best Practices](https://testingjavascript.com/)

