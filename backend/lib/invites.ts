import crypto from 'crypto';
import type { DbClient } from './applicationAccess';
import { z } from 'zod';
import { UUID_REGEX } from './security/validation';

export type InviteStatus = 'pending' | 'registered' | 'paid' | 'revoked';

export interface TenantInvite {
  id: string;
  token: string;
  inviter_id: string;
  property_id: string | null;
  invitee_name: string;
  invitee_email: string;
  admin_fee_amount: number | string;
  status: InviteStatus;
  tenant_id: string | null;
  expires_at: string;
}

// The admin fee is no longer set per invite: every tenant pays TENANT_FEE_ZAR.
export const createInviteSchema = z.object({
  property_id: z.string().regex(UUID_REGEX, 'property_id must be a valid UUID'),
  invitee_name: z.string().trim().min(2, 'Tenant name must be at least 2 characters').max(150),
  invitee_email: z.string().trim().toLowerCase().email('Tenant email must be a valid email address').max(254),
});

export type CreateInviteInput = z.infer<typeof createInviteSchema>;

/**
 * 32 random bytes, base64url — the token IS the credential for tenant
 * signup, so it must be unguessable (the old invite link used the property
 * ID, which anyone could read off a public listing).
 */
export function generateInviteToken(): string {
  return crypto.randomBytes(32).toString('base64url');
}

const TOKEN_RE = /^[A-Za-z0-9_-]{43}$/;

export function isValidInviteToken(token: string): boolean {
  return TOKEN_RE.test(token);
}

export function isInviteExpired(invite: Pick<TenantInvite, 'expires_at'>, now = new Date()): boolean {
  return new Date(invite.expires_at).getTime() <= now.getTime();
}

export function emailsMatch(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a || !b) return false;
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

/**
 * Why a given user can't register with this invite, or null if they can.
 * An invite already claimed by this same user is fine (retrying after a
 * failed redirect must not lock them out); anyone else is refused.
 */
export function claimBlocker(
  invite: TenantInvite,
  user: { id: string; email: string | null | undefined },
  now = new Date()
): string | null {
  if (invite.status === 'revoked') return 'This invite has been revoked.';
  if (invite.tenant_id && invite.tenant_id !== user.id) return 'This invite has already been used.';
  if (invite.tenant_id === user.id) return null;
  if (isInviteExpired(invite, now)) return 'This invite has expired. Ask your agent or landlord for a new link.';
  if (!emailsMatch(invite.invitee_email, user.email)) {
    return 'This invite was sent to a different email address.';
  }
  return null;
}

/**
 * True once the tenant has paid the admin fee on the invite they registered
 * with. Filters on tenant_id explicitly (the Postgres client has no RLS);
 * only the PayFast ITN handler ever marks an invite paid.
 */
export async function hasPaidAdminFee(db: DbClient, tenantId: string): Promise<boolean> {
  const { data, error } = await db
    .from('tenant_invites')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('status', 'paid')
    .limit(1);

  if (error) throw new Error(`Admin fee lookup failed: ${error.message}`);
  return (data?.length ?? 0) > 0;
}

export function buildInviteLink(appUrl: string, token: string): string {
  return `${appUrl.replace(/\/$/, '')}/signup?invite=${token}`;
}
