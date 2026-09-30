import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_STATUSES = ['pending', 'in_progress', 'resolved', 'closed'] as const;

/**
 * PATCH /api/maintenance/[id]
 *
 * Updates a maintenance request. Two callers:
 *   - Landlord/admin: can set status, assign a handyman (assigned_handyman_id)
 *   - Tenant (owner of request): can cancel (set status to 'closed') only
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: req, error: fetchError } = await db
      .from('maintenance_requests')
      .select('id, tenant_id, property_id, assigned_handyman_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`PATCH /api/maintenance/${id}: fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!req) {
      return NextResponse.json({ error: 'Maintenance request not found.' }, { status: 404 });
    }

    const isTenant = req.tenant_id === profile.id;
    const isAssignee = req.assigned_handyman_id === profile.id;
    const isAdmin = profile.role === 'admin';

    // Check if caller is the landlord of the property
    let isLandlord = false;
    if (req.property_id && profile.role === 'landlord') {
      const { data: prop } = await db
        .from('properties')
        .select('landlord_id')
        .eq('id', req.property_id)
        .maybeSingle();
      isLandlord = prop?.landlord_id === profile.id;
    }

    if (!isTenant && !isLandlord && !isAssignee && !isAdmin) {
      throw new ForbiddenError('You do not have access to this maintenance request.');
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${VALID_STATUSES.join(', ')}.` },
          { status: 400 }
        );
      }
      if (isLandlord || isAdmin) {
        // Full control over status.
      } else if (isAssignee) {
        // The assigned handyman moves the job forward, but doesn't tenant-close it.
        if (body.status !== 'in_progress' && body.status !== 'resolved') {
          throw new ForbiddenError('As the assigned handyman you can only mark this in progress or resolved.');
        }
      } else if (isTenant) {
        // Tenant can only close their own request.
        if (body.status !== 'closed') {
          throw new ForbiddenError('As the tenant you can only close your own request.');
        }
      }
      updates.status = body.status;
    }

    if (body.assigned_handyman_id !== undefined) {
      if (!isLandlord && !isAdmin) {
        throw new ForbiddenError('Only the landlord can assign a handyman.');
      }
      if (body.assigned_handyman_id !== null && !isValidUUID(body.assigned_handyman_id)) {
        return NextResponse.json({ error: 'Invalid assigned_handyman_id format.' }, { status: 400 });
      }
      updates.assigned_handyman_id = body.assigned_handyman_id;
      // Auto-advance status to in_progress when assigning
      if (body.assigned_handyman_id && !updates.status) {
        updates.status = 'in_progress';
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await db
      .from('maintenance_requests')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error(`PATCH /api/maintenance/${id}: update error`, updateError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ request: updated });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * GET /api/maintenance/[id]
 *
 * Returns a single maintenance request. Visible to the tenant who filed it,
 * the landlord of the property, and any assigned handyman.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: req, error } = await db
      .from('maintenance_requests')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      console.error(`GET /api/maintenance/${id}: DB error`, error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!req) {
      return NextResponse.json({ error: 'Maintenance request not found.' }, { status: 404 });
    }

    const isTenant = req.tenant_id === profile.id;
    const isAssignee = req.assigned_handyman_id === profile.id;
    const isAdmin = profile.role === 'admin';

    let isLandlord = false;
    if (req.property_id && profile.role === 'landlord') {
      const { data: prop } = await db
        .from('properties')
        .select('landlord_id')
        .eq('id', req.property_id)
        .maybeSingle();
      isLandlord = prop?.landlord_id === profile.id;
    }

    if (!isTenant && !isLandlord && !isAssignee && !isAdmin) {
      throw new ForbiddenError('You do not have access to this maintenance request.');
    }

    return NextResponse.json({ request: req });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
