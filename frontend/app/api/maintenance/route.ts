import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';

/**
 * POST /api/maintenance
 *
 * Logs a new maintenance request. Tenant-only. Resolves the current user
 * from the JWT cookie (via getServerDb / getAuthenticatedProfile)
 * — no real Supabase SDK required.
 *
 * Routing logic: without a subscription_tier column in the Docker schema,
 * all requests default to 'landlord'. The field is kept so the dashboard
 * can filter correctly once the column exists in production.
 */
export async function POST(request: NextRequest) {
  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    if (profile.role !== 'tenant') {
      throw new ForbiddenError('Only tenants can log maintenance requests.');
    }

    const body = await request.json();
    const { title, description, priority, property_id } = body;

    if (!title || !description || !property_id) {
      return NextResponse.json({ error: 'title, description and property_id are required.' }, { status: 400 });
    }

    // Verify the property exists
    const { data: property, error: propError } = await db
      .from('properties')
      .select('id')
      .eq('id', property_id)
      .maybeSingle();

    if (propError) {
      console.error('POST /api/maintenance: property lookup error', propError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!property) {
      return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }

    const { data: maintenanceRequest, error: insertError } = await db
      .from('maintenance_requests')
      .insert([
        {
          tenant_id: profile.id,
          property_id,
          title,
          description,
          priority: priority || 'low',
          status: 'pending',
          routed_to: 'landlord',
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error('POST /api/maintenance: insert error', insertError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json(maintenanceRequest, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * GET /api/maintenance
 *
 * Returns maintenance requests visible to the caller:
 *   - tenant: their own requests
 *   - landlord/admin: requests for their properties (filtered by property_id if provided)
 */
export async function GET(request: NextRequest) {
  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const propertyId = request.nextUrl.searchParams.get('property_id');

    if (profile.role === 'tenant') {
      // Tenant sees their own requests only
      const builder = db
        .from('maintenance_requests')
        .select('*')
        .eq('tenant_id', profile.id)
        .order('created_at', { ascending: false });

      const { data, error } = await builder;
      if (error) {
        console.error('GET /api/maintenance (tenant): DB error', error);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }
      return NextResponse.json({ requests: data });
    }

    if (profile.role === 'handyman') {
      // Handyman sees requests assigned to them
      const { data, error } = await db
        .from('maintenance_requests')
        .select('*')
        .eq('assigned_handyman_id', profile.id)
        .order('created_at', { ascending: false });

      if (error) {
        console.error('GET /api/maintenance (handyman): DB error', error);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }
      return NextResponse.json({ requests: data });
    }

    // Landlord / admin — see requests for their properties
    const { data: ownedProperties, error: propError } = await db
      .from('properties')
      .select('id')
      .eq('landlord_id', profile.id);

    if (propError) {
      console.error('GET /api/maintenance (landlord): property query error', propError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const propertyIds = (ownedProperties ?? []).map((p: any) => p.id);

    if (propertyIds.length === 0) {
      return NextResponse.json({ requests: [] });
    }

    let builder = db
      .from('maintenance_requests')
      .select('*')
      .in('property_id', propertyIds)
      .order('created_at', { ascending: false });

    if (propertyId) {
      builder = builder.eq('property_id', propertyId);
    }

    const { data, error } = await builder;
    if (error) {
      console.error('GET /api/maintenance (landlord): request query error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    return NextResponse.json({ requests: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
