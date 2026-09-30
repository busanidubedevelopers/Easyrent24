import type { AuthenticatedProfile } from './auth';

// The Postgres client (postgresClient.ts) has no row-level security and no
// embedded selects, so routes can't rely on the database to hide rows or
// join properties. This loads an application and its property in two plain
// queries and decides the caller's relationship to it in code.

/** Minimal query surface shared by the Postgres client and test mocks. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type DbClient = { from: (table: string) => any };

export interface PropertySummary {
  id: string;
  title: string;
  address: string;
  price: number;
  landlord_id: string;
}

export type ApplicationRole = 'applicant' | 'landlord' | 'admin';

export async function loadProperty(db: DbClient, propertyId: string | null | undefined): Promise<PropertySummary | null> {
  if (!propertyId) return null;
  const { data, error } = await db
    .from('properties')
    .select('id, title, address, price, landlord_id')
    .eq('id', propertyId)
    .maybeSingle();
  if (error) throw new Error(`property fetch failed: ${error.message}`);
  return data ? { ...data, price: Number(data.price) } : null;
}

/**
 * The application, its property, and the caller's role on it — or null when
 * the caller is neither the applicant, the property's landlord/agent, nor an
 * admin (callers report that as 404 so IDs can't be probed).
 */
export async function loadApplicationForCaller(
  db: DbClient,
  applicationId: string,
  profile: Pick<AuthenticatedProfile, 'id' | 'role'>
): Promise<{ application: Record<string, any>; property: PropertySummary | null; role: ApplicationRole } | null> { // eslint-disable-line @typescript-eslint/no-explicit-any
  const { data: application, error } = await db.from('applications').select('*').eq('id', applicationId).maybeSingle();
  if (error) throw new Error(`application fetch failed: ${error.message}`);
  if (!application) return null;

  const property = await loadProperty(db, application.property_id);

  if (property && property.landlord_id === profile.id) return { application, property, role: 'landlord' };
  if (application.applicant_id === profile.id) return { application, property, role: 'applicant' };
  if (profile.role === 'admin') return { application, property, role: 'admin' };
  return null;
}

/** Looks up display names and emails for a set of user IDs. */
export async function loadUsers(
  db: DbClient,
  ids: string[]
): Promise<Map<string, { id: string; email: string | null; full_name: string | null }>> {
  const unique = [...new Set(ids.filter(Boolean))];
  if (unique.length === 0) return new Map();
  const { data, error } = await db.from('users').select('id, email, full_name').in('id', unique);
  if (error) throw new Error(`users fetch failed: ${error.message}`);
  return new Map((data ?? []).map((u: { id: string; email: string | null; full_name: string | null }) => [u.id, u]));
}
