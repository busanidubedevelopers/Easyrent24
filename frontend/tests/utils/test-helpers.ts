/**
 * Testing Utilities for API Route Tests
 * 
 * Provides helper functions for mocking Supabase, creating test data,
 * and making assertions on API responses.
 */

import { vi, expect } from 'vitest';
import type { SupabaseClient } from '@supabase/supabase-js';

// ============================================================================
// Mock Data Builders
// ============================================================================

/**
 * Create a mock user profile
 */
export function createMockProfile(overrides: Record<string, any> = {}) {
  return {
    id: 'test-user-' + Math.random().toString(36).slice(2, 9),
    email: 'test@example.com',
    role: 'tenant' as const,
    full_name: null,
    phone: null,
    is_verified: false,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock application
 */
export function createMockApplication(overrides: Record<string, any> = {}) {
  const userId = overrides.applicant_id || createMockProfile().id;
  return {
    id: 'app-' + Math.random().toString(36).slice(2, 9),
    applicant_id: userId,
    application_fee_amount: 250.0,
    payment_status: 'pending',
    status: 'pending',
    first_name: 'John',
    last_name: 'Doe',
    email: 'john@example.com',
    phone: '0711234567',
    employment_status: 'employed',
    monthly_income: 15000,
    references: 1,
    co_applicant_details: null,
    documents: [],
    payment_at: null,
    paid_at: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock payment record
 */
export function createMockPayment(overrides: Record<string, any> = {}) {
  return {
    id: 'payment-' + Math.random().toString(36).slice(2, 9),
    application_id: createMockApplication().id,
    m_payment_id: 'APP-' + Date.now(),
    pf_payment_id: null,
    amount_gross: 250.0,
    amount_net: 240.0,
    amount_fee: 10.0,
    status: 'pending',
    raw_itn_payload: null,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

/**
 * Create a mock property
 */
export function createMockProperty(overrides: Record<string, any> = {}) {
  return {
    id: 'prop-' + Math.random().toString(36).slice(2, 9),
    landlord_id: createMockProfile().id,
    title: 'Test Property',
    description: 'A test property',
    address: '123 Test St',
    city: 'Test City',
    province: 'TC',
    postal_code: '1234',
    price_monthly: 5000,
    bedrooms: 2,
    bathrooms: 1,
    parking: 1,
    features: [],
    images: [],
    status: 'active',
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

// ============================================================================
// Request/Response Helpers
// ============================================================================

/**
 * Create a mock NextRequest for testing
 */
export function createMockRequest(
  method: string = 'GET',
  url: string = 'http://localhost:3000/api/test',
  options: {
    body?: any;
    headers?: Record<string, string>;
    cookies?: Record<string, string>;
  } = {}
): Request {
  const headers = new Headers({
    'Content-Type': 'application/json',
    ...options.headers,
  });

  // Add cookies if provided
  if (options.cookies) {
    const cookieString = Object.entries(options.cookies)
      .map(([key, value]) => `${key}=${value}`)
      .join('; ');
    headers.set('Cookie', cookieString);
  }

  return new Request(url, {
    method,
    body: options.body ? JSON.stringify(options.body) : undefined,
    headers,
  });
}

/**
 * Extract JSON from a Response
 */
export async function getResponseJson(response: Response): Promise<any> {
  const text = await response.clone().text();
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/**
 * Extract text from a Response
 */
export async function getResponseText(response: Response): Promise<string> {
  return response.clone().text();
}

// ============================================================================
// Supabase Mocking
// ============================================================================

/**
 * Create a mock Supabase query response
 */
export function mockSupabaseResponse(
  data: any = null,
  error: any = null
) {
  return { data, error };
}

/**
 * Create a mock Supabase client with configurable behavior
 */
export function createMockSupabaseClient(config: {
  selectData?: any;
  insertData?: any;
  updateData?: any;
  deleteData?: any;
  selectError?: any;
  insertError?: any;
  updateError?: any;
  deleteError?: any;
} = {}): any {
  const {
    selectData = null,
    insertData = null,
    updateData = null,
    deleteData = null,
    selectError = null,
    insertError = null,
    updateError = null,
    deleteError = null,
  } = config;

  const mockFrom = vi.fn();
  const mockSelect = vi.fn();
  const mockInsert = vi.fn();
  const mockUpdate = vi.fn();
  const mockDelete = vi.fn();
  const mockEq = vi.fn();
  const mockSingle = vi.fn();
  const mockMaybeSingle = vi.fn();

  // Chain mocking: from().select() or from().insert() etc.
  mockSelect.mockResolvedValue({ data: selectData, error: selectError });
  mockInsert.mockResolvedValue({ data: insertData, error: insertError });
  mockUpdate.mockResolvedValue({ data: updateData, error: updateError });
  mockDelete.mockResolvedValue({ data: deleteData, error: deleteError });

  // Chaining: select().eq() or select().single()
  mockSingle.mockResolvedValue({ data: selectData, error: selectError });
  mockMaybeSingle.mockResolvedValue({ data: selectData, error: selectError });
  mockEq.mockReturnThis();

  // select().eq() chain
  mockSelect.mockReturnValue({
    eq: mockEq,
    single: mockSingle,
    maybeSingle: mockMaybeSingle,
  });

  // from() returns object with select, insert, etc.
  mockFrom.mockReturnValue({
    select: mockSelect,
    insert: mockInsert,
    update: mockUpdate,
    delete: mockDelete,
    eq: mockEq,
  });

  return {
    from: mockFrom,
    auth: {
      getUser: vi.fn().mockResolvedValue({ data: { user: null }, error: null }),
    },
  } as any;
}

// ============================================================================
// Assertion Helpers
// ============================================================================

/**
 * Assert that a response is a successful JSON response
 */
export async function assertSuccessResponse(
  response: Response,
  expectedStatus: number = 200
) {
  expect(response.status).toBe(expectedStatus);
  expect(response.headers.get('content-type')).toContain('application/json');
  
  const data = await getResponseJson(response);
  expect(data).toBeDefined();
  expect(data).not.toBeNull();
  
  return data;
}

/**
 * Assert that a response is an error response
 */
export async function assertErrorResponse(
  response: Response,
  expectedStatus: number,
  expectedError?: string
) {
  expect(response.status).toBe(expectedStatus);
  
  const data = await getResponseJson(response);
  expect(data.error).toBeDefined();
  
  if (expectedError) {
    expect(data.error).toContain(expectedError);
  }
  
  return data;
}

/**
 * Assert that a response has a specific shape
 */
export async function assertResponseShape(
  response: Response,
  expectedKeys: string[]
) {
  const data = await getResponseJson(response);
  
  for (const key of expectedKeys) {
    expect(data).toHaveProperty(key);
  }
  
  return data;
}

// ============================================================================
// Environment Helpers
// ============================================================================

/**
 * Set up default environment variables for testing
 */
export function setupTestEnv() {
  process.env.PAYFAST_MERCHANT_ID = '10000100';
  process.env.PAYFAST_MERCHANT_KEY = 'mk_test_123';
  process.env.PAYFAST_PASSPHRASE = 'test-passphrase';
  process.env.PAYFAST_MODE = 'sandbox';
  process.env.NEXT_PUBLIC_APP_URL = 'http://localhost:3000';
  process.env.NEXT_PUBLIC_SUPABASE_URL = 'http://localhost:54321';
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-anon-key';
  process.env.SUPABASE_URL = 'http://localhost:54321';
  process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-service-role-key';
}

/**
 * Clean up environment variables after testing
 */
export function cleanupTestEnv() {
  const envVars = [
    'PAYFAST_MERCHANT_ID',
    'PAYFAST_MERCHANT_KEY',
    'PAYFAST_PASSPHRASE',
    'PAYFAST_MODE',
    'NEXT_PUBLIC_APP_URL',
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_URL',
    'SUPABASE_SERVICE_ROLE_KEY',
  ];

  for (const key of envVars) {
    delete process.env[key];
  }
}

// ============================================================================
// Common Mock Patterns
// ============================================================================

/**
 * Mock successful authentication
 */
export async function mockAuthSuccess(profile: any = {}) {
  const { getAuthenticatedProfile } = await import('@backend/lib/auth');
  const mockProfile = createMockProfile(profile);
  vi.mocked(getAuthenticatedProfile).mockResolvedValue(mockProfile);
  return mockProfile;
}

/**
 * Mock authentication failure
 */
export async function mockAuthFailure(error: string = 'Unauthorized') {
  const { getAuthenticatedProfile } = await import('@backend/lib/auth');
  vi.mocked(getAuthenticatedProfile).mockRejectedValue(new Error(error));
}

/**
 * Mock Supabase server client
 */
export async function mockSupabaseServer(config: any = {}) {
  const { getSupabaseServerClient } = await import('@/lib/supabaseServer');
  const mockClient = createMockSupabaseClient(config);
  vi.mocked(getSupabaseServerClient).mockResolvedValue(mockClient);
  return mockClient;
}

/**
 * Mock Supabase admin client
 */
export async function mockSupabaseAdmin(config: any = {}) {
  const { getSupabaseAdmin } = await import('@backend/lib/supabaseAdmin');
  const mockClient = createMockSupabaseClient(config);
  vi.mocked(getSupabaseAdmin).mockReturnValue(mockClient);
  return mockClient;
}

// ============================================================================
// Error Factories
// ============================================================================

/**
 * Create a Supabase error
 */
export function createSupabaseError(
  message: string = 'Database error',
  code: string = 'INTERNAL_ERROR'
): any {
  return {
    message,
    code,
    details: '',
  };
}

/**
 * Create an auth error
 */
export function createAuthError(message: string = 'Unauthorized'): Error {
  return new Error(message);
}

/**
 * Create a forbidden error
 */
export async function createForbiddenError(message: string = 'Forbidden'): Promise<any> {
  const { ForbiddenError } = await import('@backend/lib/auth');
  return new ForbiddenError(message);
}
