import { NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { requireAuthenticatedRole } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { buildDashboardSummary, type ApplicationLite, type PropertyLite } from '@backend/lib/landlordDashboard';

/**
 * GET /api/landlord/dashboard
 *
 * Top-level overview for a landlord: property counts by status, application
 * counts by status and by risk level, and a "needs attention" queue of
 * applications still awaiting a decision.
 *
 * Landlord or admin only. RLS already scopes `properties` and
 * `applications` to what this caller is allowed to see, so no explicit
 * landlord_id filter is needed in the queries below — the database only
 * ever returns this landlord's own rows.
 */
export async function GET() {
  try {
    const db = await getServerDb();
    const profile = await requireAuthenticatedRole(db, ['landlord', 'admin']);

    const { data: properties, error: propertiesError } = await db
      .from('properties')
      .select('id, status, landlord_id')
      .eq('landlord_id', profile.id);

    if (propertiesError) {
      console.error('GET /api/landlord/dashboard: properties query error', propertiesError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const propertyIds = (properties ?? []).map((property: { id: string }) => property.id).filter(Boolean);

    let applications: ApplicationLite[] = [];
    if (propertyIds.length > 0) {
      const { data: applicationsData, error: applicationsError } = await db
        .from('applications')
        .select('id, status, risk_level, property_id')
        .in('property_id', propertyIds);

      if (applicationsError) {
        console.error('GET /api/landlord/dashboard: applications query error', applicationsError);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }

      applications = (applicationsData ?? []) as ApplicationLite[];
    }

    const summary = buildDashboardSummary((properties ?? []) as PropertyLite[], applications);

    return NextResponse.json({ summary });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
