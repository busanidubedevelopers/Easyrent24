import { describe, it, expect } from 'vitest';
import {
  validateUuid,
  sanitizeText,
  validatePayloadSize,
  validateSchema,
  reviewPayloadSchema,
  ValidationError,
} from '../lib/security/validation';

describe('Security Validation & Sanitization', () => {
  describe('validateUuid', () => {
    it('accepts valid UUIDs', () => {
      const valid = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
      expect(validateUuid(valid)).toBe(valid);
    });

    it('rejects path traversal or injection in UUID param', () => {
      expect(() => validateUuid('../../etc/passwd')).toThrow(ValidationError);
      expect(() => validateUuid('12345')).toThrow(ValidationError);
      expect(() => validateUuid("'; DROP TABLE users; --")).toThrow(ValidationError);
    });
  });

  describe('sanitizeText', () => {
    it('removes script tags completely', () => {
      const malicious = 'Hello <script>alert("hacked")</script> World';
      expect(sanitizeText(malicious)).toBe('Hello  World');
    });

    it('removes inline event handlers and javascript: URLs', () => {
      const malicious = '<img src="x" onerror="stealCookies()"> Click <a href="javascript:doBad()">here</a>';
      expect(sanitizeText(malicious)).toBe('Click here');
    });

    it('preserves clean text', () => {
      const clean = 'Great apartment, clean and quiet location.';
      expect(sanitizeText(clean)).toBe(clean);
    });
  });

  describe('validatePayloadSize', () => {
    it('accepts payloads within limit', () => {
      expect(() => validatePayloadSize('5000', 10000)).not.toThrow();
    });

    it('rejects payloads exceeding the limit', () => {
      expect(() => validatePayloadSize('15000', 10000)).toThrow(ValidationError);
    });
  });

  describe('validateSchema', () => {
    it('validates correct review data', () => {
      const data = {
        reviewer_role: 'tenant',
        target_role: 'landlord',
        target_name: 'John Doe',
        rating: 5,
        comment: 'Responsive landlord, highly recommended.',
      };
      const valid = validateSchema(reviewPayloadSchema, data);
      expect(valid.target_name).toBe('John Doe');
      expect(valid.rating).toBe(5);
    });

    it('rejects invalid ratings or short comments', () => {
      const invalid = {
        reviewer_role: 'tenant',
        target_role: 'landlord',
        target_name: 'John',
        rating: 10, // Invalid: rating must be 1-5
        comment: 'Bad', // Invalid: min 5 chars
      };
      expect(() => validateSchema(reviewPayloadSchema, invalid)).toThrow(ValidationError);
    });
  });
});
