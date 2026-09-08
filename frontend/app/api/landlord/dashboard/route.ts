import { NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireAuthenticatedRole } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { buildDashboardSummary } from '@backend/lib/landlordDashboard';

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
    const supabase = await getSupabaseServerClient();
    await requireAuthenticatedRole(supabase, ['landlord', 'admin']);

    const [{ data: properties, error: propertiesError }, { data: applications, error: applicationsError }] =
      await Promise.all([
        supabase.from('properties').select('id, status'),
        supabase.from('applications').select('id, status, risk_level, property_id'),
      ]);

    if (propertiesError) {
      console.error('GET /api/landlord/dashboard: properties query error', propertiesError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (applicationsError) {
      console.error('GET /api/landlord/dashboard: applications query error', applicationsError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const summary = buildDashboardSummary(properties ?? [], applications ?? []);

    return NextResponse.json({ summary });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
