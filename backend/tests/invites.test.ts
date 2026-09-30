import { describe, it, expect } from 'vitest';
import {
  buildInviteLink,
  claimBlocker,
  createInviteSchema,
  emailsMatch,
  generateInviteToken,
  isInviteExpired,
  isValidInviteToken,
  type TenantInvite,
} from '../lib/invites';

const PROPERTY_ID = 'a0eebc99-9c0b-4ef8-bb6d-6bb9bd380a11';
const NOW = new Date('2026-09-28T12:00:00Z');

function makeInvite(overrides: Partial<TenantInvite> = {}): TenantInvite {
  return {
    id: 'invite-1',
    token: generateInviteToken(),
    inviter_id: 'landlord-1',
    property_id: PROPERTY_ID,
    invitee_name: 'Jane Doe',
    invitee_email: 'jane@example.com',
    admin_fee_amount: 500,
    status: 'pending',
    tenant_id: null,
    expires_at: '2026-10-12T12:00:00Z',
    ...overrides,
  };
}

describe('generateInviteToken / isValidInviteToken', () => {
  it('generates unique 43-char base64url tokens that pass validation', () => {
    const a = generateInviteToken();
    const b = generateInviteToken();
    expect(a).not.toBe(b);
    expect(a).toHaveLength(43);
    expect(isValidInviteToken(a)).toBe(true);
  });

  it('rejects property IDs, short strings and URL-unsafe characters', () => {
    expect(isValidInviteToken(PROPERTY_ID)).toBe(false);
    expect(isValidInviteToken('abc')).toBe(false);
    expect(isValidInviteToken('a'.repeat(42) + '/')).toBe(false);
  });
});

describe('createInviteSchema', () => {
  const valid = {
    property_id: PROPERTY_ID,
    invitee_name: 'Jane Doe',
    invitee_email: ' Jane@Example.com ',
  };

  it('accepts valid input and normalises the email', () => {
    const parsed = createInviteSchema.parse(valid);
    expect(parsed.invitee_email).toBe('jane@example.com');
  });

  it('ignores any fee the inviter sends — every tenant pays the same fee', () => {
    const parsed = createInviteSchema.parse({ ...valid, admin_fee_amount: 1 });
    expect(parsed).not.toHaveProperty('admin_fee_amount');
  });

  it('accepts hand-seeded property IDs that are valid Postgres UUIDs but not RFC-4122 variants', () => {
    // The demo seed uses IDs like this; they failed the old strict regex.
    expect(createInviteSchema.safeParse({ ...valid, property_id: 'cccccccc-cccc-4ccc-cccc-cccccccccccc' }).success).toBe(true);
  });

  it('rejects a missing/invalid property, email or name', () => {
    expect(createInviteSchema.safeParse({ ...valid, property_id: '101' }).success).toBe(false);
    expect(createInviteSchema.safeParse({ ...valid, invitee_email: 'nope' }).success).toBe(false);
    expect(createInviteSchema.safeParse({ ...valid, invitee_name: 'J' }).success).toBe(false);
  });
});

describe('isInviteExpired / emailsMatch', () => {
  it('treats expires_at as exclusive', () => {
    expect(isInviteExpired({ expires_at: '2026-09-28T12:00:00Z' }, NOW)).toBe(true);
    expect(isInviteExpired({ expires_at: '2026-09-28T12:00:01Z' }, NOW)).toBe(false);
  });

  it('compares emails case- and whitespace-insensitively, never matching empty values', () => {
    expect(emailsMatch('Jane@Example.com', ' jane@example.com')).toBe(true);
    expect(emailsMatch('jane@example.com', 'john@example.com')).toBe(false);
    expect(emailsMatch(null, null)).toBe(false);
  });
});

describe('claimBlocker', () => {
  const jane = { id: 'tenant-1', email: 'jane@example.com' };

  it('allows the invited email to claim a pending invite', () => {
    expect(claimBlocker(makeInvite(), jane, NOW)).toBeNull();
  });

  it('refuses a different email (forwarded link)', () => {
    expect(claimBlocker(makeInvite(), { id: 'x', email: 'someone@else.com' }, NOW)).toMatch(/different email/);
  });

  it('refuses an invite claimed by another account', () => {
    expect(claimBlocker(makeInvite({ tenant_id: 'other', status: 'registered' }), jane, NOW)).toMatch(/already been used/);
  });

  it('lets the same account re-claim (idempotent), even after expiry or payment', () => {
    const mine = { tenant_id: 'tenant-1', expires_at: '2026-01-01T00:00:00Z' };
    expect(claimBlocker(makeInvite({ ...mine, status: 'registered' }), jane, NOW)).toBeNull();
    expect(claimBlocker(makeInvite({ ...mine, status: 'paid' }), jane, NOW)).toBeNull();
  });

  it('refuses expired and revoked invites', () => {
    expect(claimBlocker(makeInvite({ expires_at: '2026-09-01T00:00:00Z' }), jane, NOW)).toMatch(/expired/);
    expect(claimBlocker(makeInvite({ status: 'revoked', tenant_id: 'tenant-1' }), jane, NOW)).toMatch(/revoked/);
  });
});

describe('buildInviteLink', () => {
  it('points at signup with the token, tolerating a trailing slash', () => {
    expect(buildInviteLink('https://easyrent24.co.za/', 'tok')).toBe('https://easyrent24.co.za/signup?invite=tok');
  });
});
