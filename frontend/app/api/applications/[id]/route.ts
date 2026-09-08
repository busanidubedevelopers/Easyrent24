import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import {
  isValidApplicationStatusTransition,
  APPLICATION_STATUSES,
  type ApplicationStatus,
} from '@backend/lib/applications';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_RISK_LEVELS = ['low', 'medium', 'high'] as const;

/**
 * GET /api/applications/[id]
 *
 * RLS handles visibility entirely: applicant sees their own, landlord sees
 * applications on their properties, everyone else gets no row (404 here,
 * not 403 — same "don't confirm the ID exists" reasoning as properties).
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    await getAuthenticatedProfile(supabase);

    const { data, error } = await supabase.from('applications').select('*').eq('id', id).maybeSingle();

    if (error) {
      console.error(`GET /api/applications/${id}: DB error`, error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    return NextResponse.json({ application: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/applications/[id]
 *
 * Two very different callers use this same endpoint:
 *   - The landlord of the property: can set status to reviewing/approved/
 *     declined, plus decision_notes and risk_score/risk_level (Task 8/9
 *     will populate the latter two automatically).
 *   - The applicant themselves: can only set status to 'cancelled', and
 *     only while still 'pending' — enforced by RLS AND re-checked here so
 *     the error message is clear instead of a silent no-op update.
 *
 * Whoever is calling, the status transition graph in
 * @backend/lib/applications decides what's allowed from the current state.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const profile = await getAuthenticatedProfile(supabase);

    const { data: existing, error: fetchError } = await supabase
      .from('applications')
      .select('applicant_id, status, property_id, properties(landlord_id)')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`PATCH /api/applications/${id}: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!existing) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    const landlordId = (existing.properties as unknown as { landlord_id: string } | null)?.landlord_id;
    const isApplicant = existing.applicant_id === profile.id;
    const isLandlord = landlordId === profile.id;
    const isAdmin = profile.role === 'admin';

    if (!isApplicant && !isLandlord && !isAdmin) {
      throw new ForbiddenError('You do not have access to this application.');
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    if (body.status !== undefined) {
      if (!APPLICATION_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${APPLICATION_STATUSES.join(', ')}.` },
          { status: 400 }
        );
      }

      // Applicants may only cancel their own application — not approve/decline it.
      if (isApplicant && !isLandlord && !isAdmin && body.status !== 'cancelled') {
        throw new ForbiddenError('As the applicant, you can only cancel your application.');
      }

      const from = existing.status as ApplicationStatus;
      const to = body.status as ApplicationStatus;
      if (!isValidApplicationStatusTransition(from, to)) {
        return NextResponse.json(
          { error: `Cannot change status from '${from}' to '${to}'.` },
          { status: 400 }
        );
      }
      updates.status = to;
    }

    // Decision fields: landlord/admin only.
    if (body.decision_notes !== undefined || body.risk_score !== undefined || body.risk_level !== undefined) {
      if (!isLandlord && !isAdmin) {
        throw new ForbiddenError('Only the landlord can set decision details.');
      }

      if (body.decision_notes !== undefined) {
        if (typeof body.decision_notes !== 'string' || body.decision_notes.length > 2000) {
          return NextResponse.json(
            { error: 'decision_notes must be a string of 2000 characters or fewer.' },
            { status: 400 }
          );
        }
        updates.decision_notes = body.decision_notes;
      }

      if (body.risk_score !== undefined) {
        const score = Number(body.risk_score);
        if (Number.isNaN(score) || score < 0 || score > 100) {
          return NextResponse.json(
            { error: 'risk_score must be a number between 0 and 100.' },
            { status: 400 }
          );
        }
        updates.risk_score = score;
      }

      if (body.risk_level !== undefined) {
        if (!VALID_RISK_LEVELS.includes(body.risk_level)) {
          return NextResponse.json(
            { error: `risk_level must be one of: ${VALID_RISK_LEVELS.join(', ')}.` },
            { status: 400 }
          );
        }
        updates.risk_level = body.risk_level;
      }
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('applications')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error(`PATCH /api/applications/${id}: DB update error`, error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ application: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
