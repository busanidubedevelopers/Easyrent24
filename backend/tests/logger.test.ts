import { describe, it, expect } from 'vitest';
import { redactSensitiveData } from '../lib/security/logger';

describe('Secure Logger PII Redaction', () => {
  it('masks South African 13-digit ID numbers', () => {
    const text = 'User submitted application with ID 9202205009087 for verification';
    const redacted = redactSensitiveData(text);
    expect(redacted).not.toContain('9202205009087');
    expect(redacted).toContain('[REDACTED_SA_ID]');
  });

  it('masks credit card numbers', () => {
    const text = 'Transaction failed for card 4111 2222 3333 4444';
    const redacted = redactSensitiveData(text);
    expect(redacted).not.toContain('4111 2222 3333 4444');
    expect(redacted).toContain('[REDACTED_CARD]');
  });

  it('masks sensitive dictionary keys like password and passphrase', () => {
    const payload = {
      user: 'alice',
      password: 'SuperSecretPassword123!',
      nested: {
        passphrase: 'payfast-passphrase-xyz',
        merchant_key: 'secret-key',
      },
    };

    const redacted = redactSensitiveData(payload) as any;
    expect(redacted.password).toBe('[REDACTED_SECRET]');
    expect(redacted.nested.passphrase).toBe('[REDACTED_SECRET]');
    expect(redacted.nested.merchant_key).toBe('[REDACTED_SECRET]');
    expect(redacted.user).toBe('alice');
  });

  it('masks email prefixes while retaining domain for debugging', () => {
    const text = 'Notification sent to john.doe@example.com successfully';
    const redacted = redactSensitiveData(text);
    expect(redacted).not.toContain('john.doe@example.com');
    expect(redacted).toContain('***@example.com');
  });
});
