import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { rankApplicantsByRisk, type RankOrder } from '@backend/lib/landlordDashboard';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/landlord/properties/[id]/applicants
 *
 * The actual "risk report aggregation" this task is named for: every
 * applicant for one specific property, ranked by their Task 8 risk
 * assessment, so a landlord can compare candidates side by side instead of
 * reviewing applications one at a time in submission order.
 *
 * Query param: order = 'best_first' (default) | 'attention_first'
 *
 * Landlord (owner of this property) or admin only.
 */
export async function GET(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const profile = await getAuthenticatedProfile(supabase);

    const { data: property, error: propertyError } = await supabase
      .from('properties')
      .select('id, landlord_id, title')
      .eq('id', id)
      .maybeSingle();

    if (propertyError) {
      console.error(`GET /api/landlord/properties/${id}/applicants: property query error`, propertyError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!property) {
      return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }
    if (property.landlord_id !== profile.id && profile.role !== 'admin') {
      throw new ForbiddenError('You can only view applicants for your own properties.');
    }

    const { data: applicants, error: applicantsError } = await supabase
      .from('applications')
      .select('id, first_name, last_name, status, risk_score, risk_level, monthly_income, created_at')
      .eq('property_id', id);

    if (applicantsError) {
      console.error(`GET /api/landlord/properties/${id}/applicants: applicants query error`, applicantsError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const orderParam = request.nextUrl.searchParams.get('order');
    const order: RankOrder = orderParam === 'attention_first' ? 'attention_first' : 'best_first';

    const ranked = rankApplicantsByRisk(applicants ?? [], order);

    return NextResponse.json({
      property: { id: property.id, title: property.title },
      order,
      applicants: ranked,
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
