import { loadUsers, type DbClient } from './applicationAccess';
import type { AuthenticatedProfile } from './auth';
import { buildLeaseDocument, termsFromRow, type LeaseDocument, type LeaseParties, type LeaseStatus } from './lease';

// Database-facing helpers shared by the lease API routes. All take the
// service-role client: callers do their own permission checks via the
// `role` these return.

export const LEASE_COLUMNS =
  'id, application_id, property_id, landlord_id, tenant_id, status, monthly_rent, deposit, start_date, term_months, escalation_pct, rent_due_day, pets_allowed, utilities, special_conditions, parties, document_hash, sent_at, tenant_signature, landlord_signature, executed_at, pdf_path, created_at, updated_at';

export interface LeaseRow {
  id: string;
  application_id: string;
  property_id: string;
  landlord_id: string;
  tenant_id: string;
  status: LeaseStatus;
  parties: LeaseParties;
  document_hash: string | null;
  sent_at: string | null;
  tenant_signature: Record<string, unknown> | null;
  landlord_signature: Record<string, unknown> | null;
  executed_at: string | null;
  pdf_path: string | null;
  [key: string]: unknown;
}

export type LeaseRole = 'landlord' | 'tenant' | 'admin';

/**
 * The lease plus the caller's role on it, or null when the caller may not
 * see it. A tenant never sees a lease still in draft.
 */
export async function loadLeaseForCaller(
  admin: DbClient,
  leaseId: string,
  profile: AuthenticatedProfile
): Promise<{ lease: LeaseRow; role: LeaseRole } | null> {
  const { data, error } = await admin.from('leases').select(LEASE_COLUMNS).eq('id', leaseId).maybeSingle();
  if (error) throw new Error(`lease fetch failed: ${error.message}`);
  if (!data) return null;

  const lease = data as unknown as LeaseRow;
  if (lease.landlord_id === profile.id) return { lease, role: 'landlord' };
  if (lease.tenant_id === profile.id && lease.status !== 'draft') return { lease, role: 'tenant' };
  if (profile.role === 'admin') return { lease, role: 'admin' };
  return null;
}

export function documentForLease(lease: LeaseRow): LeaseDocument {
  return buildLeaseDocument(lease.parties, termsFromRow(lease));
}

/**
 * Snapshot of both parties for a new lease, taken from the application, the
 * property, and both accounts. The tenant's ID number falls back to the one
 * read off their ID document when they didn't type it on the application.
 */
export async function buildPartiesSnapshot(
  admin: DbClient,
  application: {
    id: string;
    applicant_id: string;
    first_name: string;
    last_name: string;
    id_number: string | null;
    phone: string | null;
    current_address: string | null;
    co_applicant_details: { firstName?: string; lastName?: string; idNumber?: string } | null;
  },
  property: { title: string; address: string; landlord_id: string }
): Promise<LeaseParties> {
  const [users, idExtraction] = await Promise.all([
    loadUsers(admin, [application.applicant_id, property.landlord_id]),
    application.id_number
      ? Promise.resolve(null)
      : admin
          .from('document_extractions')
          .select('extracted')
          .eq('application_id', application.id)
          .eq('document_type', 'id_document')
          .eq('status', 'complete')
          .order('created_at', { ascending: false })
          .limit(1)
          .maybeSingle(),
  ]);

  const tenantUser = users.get(application.applicant_id);
  const landlordUser = users.get(property.landlord_id);
  const extractedId = (idExtraction?.data?.extracted as { id_number?: string | null } | undefined)?.id_number ?? null;
  const co = application.co_applicant_details;
  const coName = [co?.firstName, co?.lastName].filter(Boolean).join(' ').trim();

  return {
    landlord: {
      name: landlordUser?.full_name || landlordUser?.email || 'The Landlord',
      email: landlordUser?.email ?? null,
      // Agents are stored as 'landlord' accounts at signup, so the lease
      // can't yet tell an agent from an owner.
      is_agent: false,
    },
    tenant: {
      name: `${application.first_name} ${application.last_name}`.trim(),
      id_number: application.id_number || extractedId,
      email: tenantUser?.email ?? null,
      phone: application.phone,
      current_address: application.current_address,
    },
    co_tenant: coName ? { name: coName, id_number: co?.idNumber ?? null } : null,
    property: { title: property.title, address: property.address },
  };
}

export async function notify(
  admin: DbClient,
  userId: string,
  notification: { type: string; title: string; body: string; link: string }
): Promise<void> {
  const { error } = await admin.from('notifications').insert([{ user_id: userId, ...notification }]);
  // A missed notification must never fail the lease action itself.
  if (error) console.error('notification insert failed', error.message);
}

export function requestMeta(headers: Headers): { ip: string | null; user_agent: string | null } {
  const forwarded = headers.get('x-forwarded-for') || headers.get('x-real-ip');
  return {
    ip: forwarded ? forwarded.split(',')[0].trim() : null,
    user_agent: headers.get('user-agent')?.slice(0, 300) ?? null,
  };
}
