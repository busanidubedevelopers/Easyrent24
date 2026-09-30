import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const VALID_STATUSES = ['open', 'bidding', 'in_progress', 'completed', 'cancelled'] as const;

/**
 * GET /api/handyman/jobs/[id]
 *
 * Returns a single job with its bids. Any authenticated user can view.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    await getAuthenticatedProfile(db);

    const { data: job, error: jobError } = await db
      .from('handyman_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (jobError) {
      console.error(`GET /api/handyman/jobs/${id}: DB error`, jobError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const { data: bids, error: bidsError } = await db
      .from('handyman_bids')
      .select('*')
      .eq('job_id', id)
      .order('created_at', { ascending: false });

    if (bidsError) {
      console.error(`GET /api/handyman/jobs/${id}: bids DB error`, bidsError);
    }

    return NextResponse.json({ job, bids: bids ?? [] });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/handyman/jobs/[id]
 *
 * Two operations share this endpoint:
 *
 *   1. Landlord/poster assigns a handyman (body: { assigned_handyman_id, agreed_price })
 *      — sets the job to 'in_progress' and marks the chosen bid as 'accepted',
 *        rejecting all other pending bids automatically.
 *
 *   2. Poster or assignee updates status (body: { status })
 *      — e.g. poster marks 'completed' once work is done.
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: job, error: fetchError } = await db
      .from('handyman_jobs')
      .select('*')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`PATCH /api/handyman/jobs/${id}: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const isPoster = job.poster_id === profile.id;
    const isAssignee = job.assigned_handyman_id === profile.id;
    const isAdmin = profile.role === 'admin';

    if (!isPoster && !isAssignee && !isAdmin) {
      throw new ForbiddenError('You do not have access to this job.');
    }

    const body = await request.json();
    const updates: Record<string, unknown> = {};

    // --- Assignment: poster selects a handyman from bids ---
    if (body.assigned_handyman_id !== undefined) {
      if (!isPoster && !isAdmin) {
        throw new ForbiddenError('Only the job poster can assign a handyman.');
      }
      if (!isValidUUID(body.assigned_handyman_id)) {
        return NextResponse.json({ error: 'Invalid assigned_handyman_id format.' }, { status: 400 });
      }

      updates.assigned_handyman_id = body.assigned_handyman_id;
      updates.status = 'in_progress';

      if (body.agreed_price !== undefined) {
        const price = Number(body.agreed_price);
        if (!Number.isFinite(price) || price < 0) {
          return NextResponse.json({ error: 'agreed_price must be a non-negative number.' }, { status: 400 });
        }
        updates.agreed_price = price;
      }

      // Accept the winning bid and reject all others
      await db
        .from('handyman_bids')
        .update({ status: 'accepted' })
        .eq('job_id', id)
        .eq('handyman_id', body.assigned_handyman_id)
        .eq('status', 'pending');

      await db
        .from('handyman_bids')
        .update({ status: 'rejected' })
        .eq('job_id', id)
        .neq('handyman_id', body.assigned_handyman_id)
        .eq('status', 'pending');
    }

    // --- Status update ---
    if (body.status !== undefined) {
      if (!VALID_STATUSES.includes(body.status)) {
        return NextResponse.json(
          { error: `status must be one of: ${VALID_STATUSES.join(', ')}.` },
          { status: 400 }
        );
      }
      // Handyman can only mark in_progress → completed
      if (isAssignee && !isPoster && !isAdmin) {
        if (body.status !== 'completed') {
          throw new ForbiddenError('As the assigned handyman you can only mark the job as completed.');
        }
      }
      updates.status = body.status;
    }

    if (Object.keys(updates).length === 0) {
      return NextResponse.json({ error: 'No valid fields to update.' }, { status: 400 });
    }

    const { data: updated, error: updateError } = await db
      .from('handyman_jobs')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error(`PATCH /api/handyman/jobs/${id}: DB update error`, updateError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ job: updated });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
