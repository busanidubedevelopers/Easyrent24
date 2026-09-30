// ============================================================================
// Input Validation, Sanitization & Payload Sizing Layer
//
// Defends against SQL injection, XSS, prototype pollution, parameter tampering,
// and memory exhaustion attacks via oversized request bodies.
// ============================================================================

import { z } from 'zod';

export class ValidationError extends Error {
  public details: Record<string, string[]>;

  constructor(message: string, details: Record<string, string[]> = {}) {
    super(message);
    this.name = 'ValidationError';
    this.details = details;
  }
}

// ── UUID Regex ───────────────────────────────────────────────────────────────
// Canonical 8-4-4-4-12 hex, the same format Postgres' uuid type accepts (and
// the same check as frontend/lib/validation.ts isValidUUID). Deliberately not
// restricted to RFC-4122 version/variant bits: rows seeded with hand-written
// IDs (e.g. the demo properties) are valid Postgres UUIDs and must pass.
export const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Validates that a route or query parameter is a canonical UUID.
 * Throws ValidationError if malformed or containing path traversal characters.
 */
export function validateUuid(id: unknown, paramName = 'id'): string {
  if (typeof id !== 'string' || !UUID_REGEX.test(id.trim())) {
    throw new ValidationError(`Invalid ${paramName}: must be a valid UUID`);
  }
  return id.trim();
}

// ── HTML & XSS Sanitizer ────────────────────────────────────────────────────
/**
 * Neutralizes potential HTML tags, javascript: protocols, and event handlers
 * from user-supplied free-text fields (review comments, descriptions, notes).
 */
export function sanitizeText(input: string): string {
  if (!input) return '';
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '') // Remove <script>...</script>
    .replace(/<[^>]+>/g, '') // Strip remaining HTML tags
    .replace(/javascript:/gi, '') // Strip javascript: schemes
    .replace(/on\w+\s*=/gi, '') // Strip inline event handlers like onclick=
    .trim();
}

// ── Payload Size Cap ────────────────────────────────────────────────────────
export const MAX_BODY_SIZE_BYTES = 1024 * 1024; // 1MB standard limit

/**
 * Validates request body size against maximum allowable bytes to prevent
 * memory exhaustion and buffer overflow DoS attacks.
 */
export function validatePayloadSize(contentLengthHeader: string | null | undefined, maxBytes = MAX_BODY_SIZE_BYTES): void {
  if (contentLengthHeader) {
    const size = parseInt(contentLengthHeader, 10);
    if (!isNaN(size) && size > maxBytes) {
      throw new ValidationError(
        `Payload too large: content length of ${size} bytes exceeds maximum allowed limit of ${maxBytes} bytes.`
      );
    }
  }
}

// ── Zod Schemas for API Mutations ───────────────────────────────────────────

/** South African National ID: 13 digits */
export const saIdNumberSchema = z
  .string()
  .regex(/^\d{13}$/, 'South African ID number must be exactly 13 digits')
  .optional()
  .nullable();

/** Tenant Application Payload Schema */
export const applicationPayloadSchema = z
  .object({
    property_id: z.string().regex(UUID_REGEX, 'property_id must be a valid UUID').nullable().optional(),
    first_name: z.string().min(1, 'First name is required').max(100),
    last_name: z.string().min(1, 'Last name is required').max(100),
    id_number: z.string().max(20).optional().nullable(),
    current_address: z.string().max(300).optional().nullable(),
    phone: z.string().max(30).optional().nullable(),
    employer_name: z.string().max(150).optional().nullable(),
    job_title: z.string().max(150).optional().nullable(),
    employment_type: z.string().max(50).optional().nullable(),
    monthly_income: z.number().nonnegative().optional().nullable(),
    bank_name: z.string().max(100).optional().nullable(),
    account_number: z.string().max(50).optional().nullable(),
    account_type: z.string().max(50).optional().nullable(),
    co_applicant_details: z
      .object({
        firstName: z.string().max(100).optional(),
        lastName: z.string().max(100).optional(),
        idNumber: z.string().max(20).optional(),
        email: z.string().email('Invalid co-applicant email').optional().or(z.literal('')),
        phone: z.string().max(30).optional(),
      })
      .optional()
      .nullable(),
    consent_credit: z.boolean().optional(),
    consent_id_check: z.boolean().optional(),
    consent_bank_statements: z.boolean().optional(),
  })
  .passthrough(); // allows document metadata if passed

/** Peer Review Submission Schema */
export const reviewPayloadSchema = z.object({
  reviewer_role: z.enum(['tenant', 'landlord']),
  target_role: z.enum(['tenant', 'landlord']),
  target_name: z.string().min(2, 'Name must be at least 2 characters').max(150),
  rating: z.number().int().min(1).max(5),
  comment: z.string().min(5, 'Comment must be at least 5 characters').max(2000),
});

/** Maintenance Request Submission Schema */
export const maintenanceRequestSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(150),
  description: z.string().min(5, 'Description must be at least 5 characters').max(3000),
  priority: z.enum(['low', 'medium', 'high', 'emergency']),
  property_id: z.string().regex(UUID_REGEX, 'property_id must be a valid UUID').optional().or(z.literal('')),
});

/** Market Price Comparison Query Schema */
export const marketComparisonQuerySchema = z.object({
  address: z.string().min(3).max(300),
  price: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Price must be a valid numeric amount'),
  property_type: z.string().max(50).optional().nullable(),
  bedrooms: z.string().regex(/^\d+$/, 'Bedrooms must be a non-negative integer').optional().nullable(),
  size: z.string().regex(/^\d+(\.\d{1,2})?$/, 'Size must be a valid number').optional().nullable(),
});

/**
 * Validates an input object against a Zod schema, formatting any errors
 * into a clean ValidationError.
 */
export function validateSchema<T>(schema: z.ZodSchema<T>, data: unknown): T {
  const result = schema.safeParse(data);
  if (!result.success) {
    const details: Record<string, string[]> = {};
    for (const issue of result.error.issues) {
      const path = issue.path.join('.') || '_root';
      if (!details[path]) details[path] = [];
      details[path].push(issue.message);
    }
    const message = `Validation failed: ${result.error.issues.map((i) => i.message).join('; ')}`;
    throw new ValidationError(message, details);
  }
  return result.data;
}
