import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { escapeHtml, inviteEmail, leaseSentEmail, sendEmail } from '../lib/email';
import type { LeaseParties } from '../lib/lease';

const parties: LeaseParties = {
  landlord: { name: 'Lindiwe Dlamini', email: 'l@example.com', is_agent: false },
  tenant: { name: 'Thabo Mokoena', id_number: null, email: 't@example.com', phone: null, current_address: null },
  co_tenant: null,
  property: { title: 'Unit 4 <Sea Breeze>', address: '45 Main Road' },
};

const saved = { key: process.env.RESEND_API_KEY, from: process.env.EMAIL_FROM };

beforeEach(() => {
  vi.restoreAllMocks();
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  if (saved.key === undefined) delete process.env.RESEND_API_KEY; else process.env.RESEND_API_KEY = saved.key;
  if (saved.from === undefined) delete process.env.EMAIL_FROM; else process.env.EMAIL_FROM = saved.from;
});

describe('sendEmail', () => {
  const message = { to: 't@example.com', subject: 'Hi', text: 'Hello', html: '<p>Hello</p>' };

  it('skips without calling out when no provider is configured', async () => {
    delete process.env.RESEND_API_KEY;
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendEmail(message)).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('posts to Resend with the API key and sender', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'EasyRent24 <no-reply@easyrent24.co.za>';
    const fetchMock = vi.fn().mockResolvedValue({ ok: true });
    vi.stubGlobal('fetch', fetchMock);

    expect(await sendEmail(message)).toBe(true);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.resend.com/emails');
    expect(init.headers.Authorization).toBe('Bearer re_test');
    expect(JSON.parse(init.body)).toMatchObject({ from: 'EasyRent24 <no-reply@easyrent24.co.za>', to: ['t@example.com'], subject: 'Hi' });
  });

  it('returns false instead of throwing when the provider fails', async () => {
    process.env.RESEND_API_KEY = 're_test';
    process.env.EMAIL_FROM = 'x@example.com';
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 422 }));
    expect(await sendEmail(message)).toBe(false);

    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));
    expect(await sendEmail(message)).toBe(false);
  });
});

describe('templates', () => {
  it('invite email carries the link, fee and property, with HTML escaped', () => {
    const email = inviteEmail({
      to: 't@example.com',
      inviteeName: 'Thabo',
      inviterName: 'Lindiwe',
      property: parties.property,
      adminFee: 500,
      link: 'https://easyrent24.co.za/signup?invite=abc',
    });
    expect(email.text).toContain('https://easyrent24.co.za/signup?invite=abc');
    expect(email.text).toContain('R500,00');
    expect(email.html).toContain('Unit 4 &lt;Sea Breeze&gt;');
    expect(email.html).not.toContain('<Sea Breeze>');
  });

  it('lease email links to the lease', () => {
    const email = leaseSentEmail('t@example.com', parties, 'https://x/leases/1');
    expect(email.subject).toContain('ready to sign');
    expect(email.html).toContain('href="https://x/leases/1"');
  });

  it('escapeHtml neutralises markup and quotes', () => {
    expect(escapeHtml(`<a href="x" onclick='y'>&`)).toBe('&lt;a href=&quot;x&quot; onclick=&#39;y&#39;&gt;&amp;');
  });
});
