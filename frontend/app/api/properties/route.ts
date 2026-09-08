import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { requireAuthenticatedRole } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { validatePropertyInput } from '@backend/lib/properties';

/**
 * GET /api/properties
 *
 * Public listing endpoint — no auth required. RLS on the `properties` table
 * (see migration 003) already restricts anonymous/other users to seeing
 * only status='published' listings, and lets landlords see all of their own
 * regardless of status. This route is a thin layer on top of that for
 * filtering and pagination; it is NOT what enforces visibility — the
 * database policy is.
 *
 * Query params (all optional):
 *   status        - filter by status (only meaningful for the property owner;
 *                   anonymous callers can't see non-published rows anyway)
 *   property_type - filter by type
 *   min_price, max_price
 *   limit  (default 20, max 100)
 *   offset (default 0)
 */
export async function GET(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const params = request.nextUrl.searchParams;

    const limit = Math.min(parseInt(params.get('limit') ?? '20', 10) || 20, 100);
    const offset = Math.max(parseInt(params.get('offset') ?? '0', 10) || 0, 0);

    let query = supabase
      .from('properties')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    const status = params.get('status');
    if (status) query = query.eq('status', status);

    const propertyType = params.get('property_type');
    if (propertyType) query = query.eq('property_type', propertyType);

    const minPrice = params.get('min_price');
    if (minPrice) query = query.gte('price', Number(minPrice));

    const maxPrice = params.get('max_price');
    if (maxPrice) query = query.lte('price', Number(maxPrice));

    const { data, error, count } = await query;

    if (error) {
      console.error('GET /api/properties: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ properties: data, total: count });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/properties
 *
 * Creates a new property listing. Landlord or admin only. Always created as
 * 'draft' regardless of what the client sends — publishing is a deliberate
 * separate action via PATCH, not something that happens accidentally on create.
 */
export async function POST(request: NextRequest) {
  try {
    const supabase = await getSupabaseServerClient();
    const profile = await requireAuthenticatedRole(supabase, ['landlord', 'admin']);

    const body = await request.json();
    const { valid, errors } = validatePropertyInput(body);

    if (!valid) {
      return NextResponse.json({ error: 'Invalid input.', details: errors }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('properties')
      .insert([
        {
          landlord_id: profile.id,
          title: body.title,
          address: body.address,
          price: body.price,
          bedrooms: body.bedrooms ?? null,
          bathrooms: body.bathrooms ?? null,
          size_m2: body.size_m2 ?? null,
          property_type: body.property_type ?? null,
          description: body.description ?? null,
          features: body.features ?? null,
          status: 'draft',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('POST /api/properties: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ property: data }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
