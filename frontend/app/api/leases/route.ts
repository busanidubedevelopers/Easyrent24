import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { leaseEndDate } from '@backend/lib/lease';
import type { LeaseParties } from '@backend/lib/lease';

interface LeaseListRow {
  id: string;
  application_id: string;
  landlord_id: string;
  tenant_id: string;
  status: string;
  monthly_rent: number | string;
  start_date: string;
  term_months: number;
  parties: LeaseParties;
  sent_at: string | null;
  executed_at: string | null;
  created_at: string;
}

/**
 * GET /api/leases
 *
 * Leases the caller is party to, newest first: as landlord/agent (all
 * statuses) or as tenant (once sent). Two explicit queries — the Postgres
 * client has no row-level security and no OR filters.
 */
export async function GET() {
  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const columns = 'id, application_id, landlord_id, tenant_id, status, monthly_rent, start_date, term_months, parties, sent_at, executed_at, created_at';
    const [asLandlord, asTenant] = await Promise.all([
      db.from('leases').select(columns).eq('landlord_id', profile.id),
      db.from('leases').select(columns).eq('tenant_id', profile.id).neq('status', 'draft'),
    ]);
    const error = asLandlord.error ?? asTenant.error;
    const byId = new Map<string, LeaseListRow>();
    for (const row of [...(asLandlord.data ?? []), ...(asTenant.data ?? [])] as LeaseListRow[]) byId.set(row.id, row);
    const data = [...byId.values()].sort((a, b) => b.created_at.localeCompare(a.created_at));

    if (error) {
      console.error('GET /api/leases: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const leases = (data ?? []).map((row) => {
      const parties = row.parties as LeaseParties;
      return {
        id: row.id,
        application_id: row.application_id,
        role: row.landlord_id === profile.id ? 'landlord' : 'tenant',
        status: row.status,
        monthly_rent: Number(row.monthly_rent),
        start_date: row.start_date,
        end_date: leaseEndDate(row.start_date, row.term_months),
        property: parties.property,
        tenant_name: parties.tenant.name,
        landlord_name: parties.landlord.name,
        sent_at: row.sent_at,
        executed_at: row.executed_at,
      };
    });

    return NextResponse.json({ leases });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
