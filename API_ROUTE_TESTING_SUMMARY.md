# API Route Testing — Complete Package

**Status**: ✅ Ready to implement  
**Effort**: 2-3 hours for initial setup; 30 min per new route thereafter  
**Impact**: Catch regressions in API logic before production

---

## 📦 What You've Got

### 1. **`API_ROUTE_TESTING_GUIDE.md`** (Comprehensive Reference)
- Overview of test pyramid and why API tests matter
- Two testing approaches (supertest vs node-mocks-http)
- Example tests for protected routes
- Test patterns and best practices
- Critical routes to test (prioritized)
- Common pitfalls and how to avoid them

### 2. **`API_ROUTE_TESTING_SETUP.md`** (Implementation Guide)
- Quick start (15 min setup)
- File structure and organization
- Complete configuration walkthrough
- Testing utilities explanation
- Example test files you can copy
- Running tests and CI/CD integration
- Time estimates per route

### 3. **`frontend/tests/api/health.test.ts`** (Working Example)
- Complete, runnable test file
- Tests success case, error cases, edge cases
- Shows all testing patterns
- Can be used as template for other routes
- Includes assertions for:
  - Status codes
  - Response shape
  - Error messages
  - Edge cases
  - Type safety

### 4. **`frontend/tests/utils/test-helpers.ts`** (Reusable Utilities)
- Data builders (mock profile, application, payment, property)
- Request/response helpers
- Supabase mocking utilities
- Assertion helpers
- Environment setup/cleanup
- Common mock patterns
- Error factories

---

## 🚀 Quick Start (15 minutes)

### Step 1: Create directories
```bash
mkdir -p frontend/tests/api frontend/tests/utils
```

### Step 2: Install vitest in frontend
```bash
cd frontend
npm install --save-dev vitest
```

### Step 3: Create vitest config
```bash
# Copy from API_ROUTE_TESTING_SETUP.md → "Step 4"
touch vitest.config.ts
```

### Step 4: Run example test
```bash
npx vitest run tests/api/health.test.ts
```

**Expected output**:
```
✓ tests/api/health.test.ts (10)  350ms
```

---

## 📝 Test Structure

Every test follows the **AAA Pattern**:

```typescript
describe('POST /api/endpoint', () => {
  it('does something when conditions are met', async () => {
    // Arrange: Set up mocks and test data
    const mockData = createMockApplication();
    vi.mocked(getSupabaseServerClient).mockResolvedValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({ data: mockData, error: null }),
      }),
    } as any);

    // Act: Call the endpoint
    const request = createMockRequest('POST', '/api/applications');
    const response = await POST(request as any);

    // Assert: Check results
    expect(response.status).toBe(200);
    const data = await getResponseJson(response);
    expect(data.id).toBe(mockData.id);
  });
});
```

---

## 🎯 Coverage Checklist

For each route, test:

**Status Codes**
- [ ] 200 — Success (happy path)
- [ ] 400 — Bad request (invalid input)
- [ ] 401 — Unauthorized (no auth)
- [ ] 403 — Forbidden (auth but not allowed)
- [ ] 404 — Not found (resource missing)
- [ ] 500 — Server error (unexpected failure)
- [ ] 503 — Service unavailable (config missing)

**Happy Path**
- [ ] Valid input + authorized user → correct response

**Authorization**
- [ ] No authentication → 401
- [ ] Wrong user → 403
- [ ] Wrong role → 403

**Validation**
- [ ] Missing required fields → 400
- [ ] Invalid field values → 400
- [ ] Unexpected field types → 400

**Business Logic**
- [ ] Resource doesn't exist → 404
- [ ] Resource already has action (e.g., paid) → 400
- [ ] Database error → 500

---

## 🔥 Critical Routes to Test First

### Week 1: Security-Critical
```
✅ GET    /api/health                    (example provided)
⚠️  POST   /api/auth/me                   (existing endpoint)
⚠️  POST   /api/applications/[id]/pay     (payment security)
⚠️  POST   /api/payments/payfast/notify   (ITN callback)
```

### Week 2: Business Logic
```
⚠️  POST   /api/applications              (submission)
⚠️  GET    /api/applications/[id]         (retrieval)
⚠️  PATCH  /api/applications/[id]         (updates)
⚠️  GET    /api/applications              (listing)
```

### Week 3+: Everything Else
```
⚠️  GET    /api/properties
⚠️  POST   /api/properties
⚠️  GET    /api/landlord/dashboard
⚠️  ... etc
```

---

## 📊 File Layout

```
frontend/
├── vitest.config.ts
│   └── Vitest configuration
│
├── tests/
│   ├── api/
│   │   ├── health.test.ts          ✅ Example test (READY TO RUN)
│   │   ├── applications-pay.test.ts    Pattern: protected route with business logic
│   │   ├── auth-me.test.ts             Pattern: auth endpoint
│   │   └── ... (add more)
│   │
│   └── utils/
│       └── test-helpers.ts         ✅ Reusable test utilities
│
├── app/api/
│   ├── health/route.ts             ✅ Simple endpoint (tested first)
│   ├── auth/me/route.ts
│   ├── applications/[id]/pay/route.ts
│   └── ... (other routes)
│
└── package.json
    └── Add test scripts
```

---

## 💻 Commands You'll Use

```bash
# Run all API tests
npm run test:api

# Run specific test file
npx vitest run tests/api/health.test.ts

# Watch mode (re-run on changes)
npm run test:api:watch

# With coverage
npx vitest run --coverage tests/api/

# Debug mode
npx vitest --inspect-brk tests/api/health.test.ts
```

---

## 🎓 Learning Path

### 1. Understand the Basics (30 min)
- Read: `API_ROUTE_TESTING_GUIDE.md` → Overview & Basic Concepts
- Skim: Example test file to see structure

### 2. Set Up Environment (15 min)
- Follow: `API_ROUTE_TESTING_SETUP.md` → Quick Start section
- Run: Example test
- See it pass ✅

### 3. Learn by Doing (45 min)
- Copy example test as template
- Modify for `/api/health` endpoint
- Run and see it pass
- Add a new test case yourself

### 4. Scale Up (2 hours)
- Test `/api/applications/[id]/pay` route
- Use test helpers for mocking
- Cover error scenarios
- Add your own patterns

### 5. Integrate (30 min)
- Add test scripts to package.json
- Set up CI/CD to run tests
- Block PR merges if tests fail

**Total time: 3-4 hours to get started; ongoing 30 min per route**

---

## ✨ Key Features

### What's Included
✅ Complete example test file  
✅ Reusable test utilities  
✅ Mock data builders  
✅ Assertion helpers  
✅ Vitest configuration  
✅ Environment setup  
✅ CI/CD examples  

### What You'll Get
✅ Catch bugs before production  
✅ Confidence in API behavior  
✅ Regression prevention  
✅ Documentation in tests  
✅ Faster development  
✅ Ready for code review  

### What You Won't Need
❌ Selenium/Playwright (E2E tests)  
❌ Real database setup  
❌ PayFast integration in tests  
❌ Complex test infrastructure  

---

## 🔍 Example Test (What You're Testing)

```typescript
// From frontend/tests/api/health.test.ts

describe('GET /api/health', () => {
  it('returns 200 when database is reachable', async () => {
    const { getSupabaseAdmin } = await import('@backend/lib/supabaseAdmin');
    
    // Mock: Database is working
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'test' }],
          error: null,
        }),
      }),
    } as any);

    // Call endpoint
    const response = await GET();

    // Verify response
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});
```

---

## 🚨 Common Questions

**Q: Do I need a real database?**  
A: No! We mock Supabase, so tests run in milliseconds with no dependencies.

**Q: Will these tests replace E2E tests?**  
A: Mostly. Unit tests + API tests = ~80% coverage. E2E tests (Playwright) add the final 20%.

**Q: What if my route calls a PayFast API?**  
A: Mock it! In tests, we don't call external APIs. Use `vi.fn()` to fake responses.

**Q: How long until I see ROI?**  
A: First test takes 1 hour. By test #3, you're 10x faster. By test #10, regressions are caught automatically.

**Q: Can I test without vitest?**  
A: Yes, but vitest is perfect for this. Don't add unnecessary complexity.

---

## ✅ Checklist to Get Started

- [ ] Read `API_ROUTE_TESTING_GUIDE.md` (understand what you're doing)
- [ ] Read `API_ROUTE_TESTING_SETUP.md` (quick start section)
- [ ] Install vitest in frontend
- [ ] Create vitest.config.ts
- [ ] Copy `frontend/tests/api/health.test.ts`
- [ ] Copy `frontend/tests/utils/test-helpers.ts`
- [ ] Run example test: `npm run test:api`
- [ ] See it pass ✅
- [ ] Create first new test for a simple route
- [ ] Run and see it pass ✅
- [ ] Add to package.json scripts
- [ ] Plan which routes to test first

---

## 🎯 Success Metrics

**After 1 hour**: Example test passes  
**After 3 hours**: 3-5 routes tested  
**After 8 hours**: Comprehensive coverage for critical routes  
**After 1 week**: All high-risk routes tested  
**After 2 weeks**: Most routes tested  

---

## 🚀 Next Steps

1. **Today**: Read guides and run example test
2. **Tomorrow**: Test first route (`/api/applications/[id]/pay`)
3. **This week**: Test critical routes (security, payments)
4. **Next week**: Test business logic routes
5. **Add to CI/CD**: Prevent regressions automatically

---

## 📞 Key Resources

| Need | File |
|------|------|
| Comprehensive guide | `API_ROUTE_TESTING_GUIDE.md` |
| Step-by-step setup | `API_ROUTE_TESTING_SETUP.md` |
| Working example | `frontend/tests/api/health.test.ts` |
| Reusable utilities | `frontend/tests/utils/test-helpers.ts` |
| vitest docs | [vitest.dev](https://vitest.dev) |

---

## 💡 Pro Tips

1. **Start simple**: Test `/api/health` first (no auth, no DB).
2. **Use helpers**: Copy test-helpers.ts and reuse it everywhere.
3. **Test errors first**: Write error cases before happy path.
4. **Keep it fast**: Tests should run in < 5 seconds total.
5. **Don't test frameworks**: Test YOUR logic, not Next.js internals.
6. **Mock aggressively**: Never hit real APIs in tests.
7. **Run often**: Get fast feedback while coding.

---

## 🎉 You're Ready

Everything you need is in place:
- ✅ Guides explaining what to do
- ✅ Setup instructions step-by-step
- ✅ Working example you can run immediately
- ✅ Reusable utilities for all tests
- ✅ Best practices and patterns

**Next action**: Run the example test!

```bash
cd frontend
npm install --save-dev vitest  # If not already installed
npx vitest run tests/api/health.test.ts
```

See it pass. Then follow the guides to add more tests.

**Good luck! 🚀**

