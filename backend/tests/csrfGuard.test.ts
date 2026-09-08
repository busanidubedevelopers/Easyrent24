import { describe, it, expect } from 'vitest';
import { verifyCsrfOrigin } from '../lib/security/csrfGuard';

describe('CSRF & Origin Verification Guard', () => {
  it('allows safe HTTP GET and HEAD requests without Origin', () => {
    const resGet = verifyCsrfOrigin('GET', {}, '/api/properties');
    expect(resGet.valid).toBe(true);

    const resHead = verifyCsrfOrigin('HEAD', {}, '/api/properties');
    expect(resHead.valid).toBe(true);
  });

  it('allows state-changing requests when Origin matches configured host', () => {
    const headers = {
      origin: 'https://easyrent.co.za',
      host: 'easyrent.co.za',
    };

    const res = verifyCsrfOrigin('POST', headers, '/api/applications', {
      allowedOrigins: ['https://easyrent.co.za'],
    });

    expect(res.valid).toBe(true);
  });

  it('allows state-changing requests matching Host header', () => {
    const headers = {
      origin: 'http://localhost:3000',
      host: 'localhost:3000',
    };

    const res = verifyCsrfOrigin('POST', headers, '/api/applications');
    expect(res.valid).toBe(true);
  });

  it('blocks state-changing requests with unauthorized cross-origin', () => {
    const headers = {
      origin: 'https://attacker-phishing-site.com',
      host: 'easyrent.co.za',
    };

    const res = verifyCsrfOrigin('POST', headers, '/api/applications', {
      allowedOrigins: ['https://easyrent.co.za'],
    });

    expect(res.valid).toBe(false);
    expect(res.reason).toContain('is not authorized');
  });

  it('whitelists third-party webhooks such as PayFast notify', () => {
    const headers = {
      origin: 'https://sandbox.payfast.co.za',
      host: 'easyrent.co.za',
    };

    const res = verifyCsrfOrigin('POST', headers, '/api/payments/payfast/notify');
    expect(res.valid).toBe(true);
  });
});
