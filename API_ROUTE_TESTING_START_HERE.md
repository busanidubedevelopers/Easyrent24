# API Route Testing — Start Here

**Problem**: No tests for API routes (only unit tests of business logic)  
**Solution**: Add integration tests using vitest  
**Time to first test**: 15 minutes  
**Time for comprehensive coverage**: 8-10 hours

---

## ⚡ 5-Minute Overview

### What We're Testing
- Next.js API route handlers
- Authentication and authorization
- Error handling and validation
- Business logic through HTTP

### Why It Matters
- Unit tests verify functions in isolation ✅
- API tests verify routes work together ✅
- They catch real bugs before users hit them ✅

### How It Works
1. Create a test file (e.g., `health.test.ts`)
2. Mock Supabase and external dependencies
3. Call the route handler
4. Assert the response is correct
5. Run all tests in < 5 seconds

---

## 🚀 Get Started in 15 Minutes

### Step 1: Install vitest
```bash
cd frontend
npm install --save-dev vitest
```

### Step 2: Create test config
Create `frontend/vitest.config.ts`:
```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    globals: true,
  },
});
```

### Step 3: Add test scripts
In `frontend/package.json`:
```json
{
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest",
    "test:api": "vitest run tests/api/"
  }
}
```

### Step 4: Create test directory
```bash
mkdir -p frontend/tests/api
mkdir -p frontend/tests/utils
```

### Step 5: Copy example test
Copy `frontend/tests/api/health.test.ts` (already created for you)

### Step 6: Copy test utilities
Copy `frontend/tests/utils/test-helpers.ts` (already created for you)

### Step 7: Run it!
```bash
npm run test:api
```

Expected output:
```
✓ tests/api/health.test.ts (10 tests)

Test Files  1 passed (1)
     Tests  10 passed (10)
  Start at  14:32:05
  Duration  350ms
```

---

## 📚 Full Documentation

Once the example passes, read these (in order):

1. **`API_ROUTE_TESTING_SUMMARY.md`** (5 min) — Overview of what you're getting
2. **`API_ROUTE_TESTING_SETUP.md`** (20 min) — Step-by-step setup + examples
3. **`API_ROUTE_TESTING_GUIDE.md`** (30 min) — Comprehensive patterns and practices

---

## 📝 What's in the Box

### Files You Get
- ✅ `frontend/tests/api/health.test.ts` — Working example (10 tests)
- ✅ `frontend/tests/utils/test-helpers.ts` — Reusable utilities
- ✅ `API_ROUTE_TESTING_GUIDE.md` — Comprehensive guide (30 pages)
- ✅ `API_ROUTE_TESTING_SETUP.md` — Implementation walkthrough
- ✅ `API_ROUTE_TESTING_SUMMARY.md` — Package overview

### What They Cover
- ✅ How to mock Supabase
- ✅ How to test authentication
- ✅ How to test authorization
- ✅ How to test error scenarios
- ✅ How to test business logic
- ✅ How to organize tests
- ✅ How to add to CI/CD

---

## 🎯 Quick Example

Here's what a test looks like:

```typescript
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { GET } from '@/app/api/health/route';

// Mock the Supabase admin client
vi.mock('@backend/lib/supabaseAdmin', () => ({
  getSupabaseAdmin: vi.fn(),
}));

describe('GET /api/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 when database is reachable', async () => {
    // Arrange: Set up mock to return success
    const { getSupabaseAdmin } = await import('@backend/lib/supabaseAdmin');
    vi.mocked(getSupabaseAdmin).mockReturnValue({
      from: vi.fn().mockReturnValue({
        select: vi.fn().mockResolvedValue({
          data: [{ id: 'test' }],
          error: null,
        }),
      }),
    } as any);

    // Act: Call the endpoint
    const response = await GET();

    // Assert: Check the response
    expect(response.status).toBe(200);
    const data = await response.json();
    expect(data.status).toBe('ok');
  });
});
```

See? Not that scary. 🙂

---

## 🎓 Learning Path

**Time**: 2-3 hours  
**Outcome**: Can test any API route

### Hour 1: Foundation
- [ ] Run example test (15 min)
- [ ] Read API_ROUTE_TESTING_SUMMARY.md (5 min)
- [ ] Read API_ROUTE_TESTING_SETUP.md Quick Start (10 min)
- [ ] Understand the AAA pattern (5 min)
- [ ] Review test helpers file (10 min)

### Hour 2: First Test
- [ ] Test a simple route (`/api/health`) (30 min)
- [ ] Modify example to understand patterns (15 min)
- [ ] Create your own simple test (15 min)

### Hour 3: Scale Up
- [ ] Test a protected route (`/api/applications/[id]/pay`) (45 min)
- [ ] Use test helpers for mocking (15 min)

### Beyond
- [ ] Test more routes (30 min each)
- [ ] Add to CI/CD pipeline (1 hour)
- [ ] Get to 80% coverage (ongoing)

---

## 🚦 Critical Routes to Test First

**Tier 1: Security** (Do this week)
- `/api/health` ✅ (example provided)
- `/api/auth/me` — Auth check
- `/api/applications/[id]/pay` — Payment initiation

**Tier 2: Business Logic** (Do next week)
- `/api/applications` — Submit application
- `/api/applications/[id]` — Get/update application
- `/api/payments/payfast/notify` — PayFast callback

**Tier 3: Everything Else** (Nice to have)
- `/api/properties` — CRUD operations
- `/api/landlord/dashboard` — Data aggregation
- etc.

---

## 🎉 You're All Set

### What You Have
✅ Working example test  
✅ Reusable test utilities  
✅ Comprehensive guides  
✅ Setup instructions  
✅ Best practices  

### What You Can Do NOW
```bash
# Run the example test
cd frontend
npx vitest run tests/api/health.test.ts

# See it pass ✅
```

### What Comes Next
1. Read the guides (1 hour)
2. Create your first test (30 min)
3. Test critical routes (3-4 hours)
4. Add to CI/CD (1 hour)

---

## 📖 Document Map

| Need | Read |
|------|------|
| "What do I do?" | This file (you're reading it!) |
| "How do I start?" | `API_ROUTE_TESTING_SETUP.md` Quick Start |
| "Show me patterns" | `API_ROUTE_TESTING_GUIDE.md` |
| "What's included?" | `API_ROUTE_TESTING_SUMMARY.md` |
| "I'm stuck" | Check troubleshooting in Setup guide |

---

## ❓ Common Questions

**Q: Is 15 minutes realistic?**  
A: Yes! Only if vitest is already installed. If not, add 5 min to install.

**Q: Can I test without mocking?**  
A: You could, but you'd need a test database. That's complex. Mocking is simpler.

**Q: Will this break existing tests?**  
A: No! These are NEW tests. Your backend unit tests are unaffected.

**Q: How much will it slow down development?**  
A: First test: 1 hour. Second: 30 min. Third: 20 min. By 10th: automatic and fast.

**Q: Do I need this right now?**  
A: Yes! It's in the audit's "High Priority" section. Critical for preventing regressions.

---

## 🏃 Next Action

Pick one:

### Option A: "I want to learn from the example" (30 min)
1. Run: `npm run test:api`
2. Read: `frontend/tests/api/health.test.ts` code comments
3. Change something in the test
4. See it fail, then fix it
5. Understand the pattern

### Option B: "I want the full walkthrough" (2 hours)
1. Read: `API_ROUTE_TESTING_SETUP.md` (20 min)
2. Follow: Step-by-step setup (15 min)
3. Read: `API_ROUTE_TESTING_GUIDE.md` (30 min)
4. Create: Your first test (45 min)
5. Celebrate: It works! 🎉

### Option C: "I want the executive summary" (10 min)
1. Read: `API_ROUTE_TESTING_SUMMARY.md`
2. Run: `npm run test:api`
3. See: Example test works
4. Plan: When you'll add tests for critical routes

---

## 🚀 Let's Go

**Simplest first step**:
```bash
cd frontend
npm run test:api
```

If it fails due to missing vitest:
```bash
npm install --save-dev vitest
npm run test:api
```

Should see:
```
✓ tests/api/health.test.ts (10 tests)
```

**Then**: Read `API_ROUTE_TESTING_SETUP.md` to understand how it works.

**Then**: Create your first test for `/api/applications/[id]/pay`.

---

## 💬 Summary

You now have:
- ✅ A working example test
- ✅ Reusable testing utilities
- ✅ Comprehensive documentation
- ✅ Clear implementation steps
- ✅ Best practices and patterns

**What to do now**:
1. Run the example: `npm run test:api` (1 min)
2. Read the setup guide (20 min)
3. Create your first test (30 min)
4. Test critical routes (4-5 hours)

**Total: Less than 8 hours to comprehensive coverage**

---

**Ready? Let's test some APIs! 🚀**

