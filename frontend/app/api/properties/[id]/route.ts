import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { validatePropertyInput, isValidStatusTransition, PROPERTY_STATUSES, type PropertyStatus } from '@backend/lib/properties';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/properties/[id]
 *
 * No auth required to call this — but RLS means a non-owner requesting a
 * draft/archived property simply gets no row back (not a 403, since
 * revealing "this ID exists but you can't see it" is itself informative to
 * an attacker probing IDs; a plain 404 is safer).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  const db = await getServerDb();

  const { data, error } = await db.from('properties').select('*').eq('id', id).maybeSingle();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
  if (!data) {
    return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
  }

  return NextResponse.json({ property: data });
}

/**
 * PATCH /api/properties/[id]
 *
 * Updates a property. Owner (or admin) only — enforced twice, redundantly
 * on purpose: once here (so we can return a clear 403 with an explanation),
 * and again by RLS at the database level (so even a bug in this route
 * could never let someone edit another landlord's listing).
 *
 * Status changes are validated against the allowed transition graph in
 * @backend/lib/properties — e.g. you can't jump straight from 'draft' to
 * 'rented'.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: existing, error: fetchError } = await db
      .from('properties')
      .select('landlord_id, status')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }
    if (existing.landlord_id !== profile.id && profile.role !== 'admin') {
      throw new ForbiddenError('You can only edit your own properties.');
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // Only validate/apply fields that were actually sent.
    if (body.status !== undefined) {
      if (!PROPERTY_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${PROPERTY_STATUSES.join(', ')}.` },
          { status: 400 }
        );
      }
      const from = existing.status as PropertyStatus;
      const to = body.status as PropertyStatus;
      if (!isValidStatusTransition(from, to)) {
        return NextResponse.json(
          { error: `Cannot change status from '${from}' to '${to}'.` },
          { status: 400 }
        );
      }
      updates.status = to;
    }

    // Validate the editable content fields together, reusing the same
    // validator as create — but only for fields actually present, so a
    // partial update (e.g. just { price: 9000 }) doesn't get rejected for
    // "missing" fields it was never trying to change.
    const contentFields = ['title', 'address', 'price', 'bedrooms', 'bathrooms', 'size_m2', 'property_type', 'description', 'features'] as const;
    const hasContentChange = contentFields.some((f) => body[f] !== undefined);

    if (hasContentChange) {
      const merged = { ...existing, ...body };
      const { valid, errors } = validatePropertyInput(merged);
      if (!valid) {
        return NextResponse.json({ error: 'Invalid input.', details: errors }, { status: 400 });
      }
      for (const f of contentFields) {
        if (body[f] !== undefined) updates[f] = body[f];
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const { data, error } = await db
      .from('properties')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ property: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * DELETE /api/properties/[id]
 *
 * Owner or admin only. Same double-enforcement pattern as PATCH.
 */
export async function DELETE(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: existing, error: fetchError } = await db
      .from('properties')
      .select('landlord_id')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Property not found.' }, { status: 404 });
    }
    if (existing.landlord_id !== profile.id && profile.role !== 'admin') {
      throw new ForbiddenError('You can only delete your own properties.');
    }

    const { error } = await db.from('properties').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
