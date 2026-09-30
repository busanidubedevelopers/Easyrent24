import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/handyman/jobs/[id]/escrow
 *
 * Returns the escrow row for a job, if any. Visible to the poster (payer),
 * the assigned handyman (payee), and admins — the same people who can
 * already see the job itself.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid job ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: job, error: jobError } = await db
      .from('handyman_jobs')
      .select('poster_id, assigned_handyman_id')
      .eq('id', id)
      .maybeSingle();

    if (jobError) {
      console.error(`GET /api/handyman/jobs/${id}/escrow: job fetch error`, jobError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }

    const isPoster = job.poster_id === profile.id;
    const isAssignee = job.assigned_handyman_id === profile.id;
    if (!isPoster && !isAssignee && profile.role !== 'admin') {
      throw new ForbiddenError('You do not have access to this job.');
    }

    const { data: escrow, error } = await db
      .from('escrow_transactions')
      .select('*')
      .eq('job_id', id)
      .maybeSingle();

    if (error) {
      console.error(`GET /api/handyman/jobs/${id}/escrow: DB error`, error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ escrow: escrow ?? null });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * PATCH /api/handyman/jobs/[id]/escrow
 *
 * Poster releases held funds to the handyman once work is approved. This is
 * the single action behind the job page's "Approve Work & Release Funds"
 * button — it both marks the job completed and releases escrow in one call,
 * matching that button's one-click UX rather than requiring two separate
 * confirmations for what the poster experiences as one decision.
 *
 * Body: { action: 'release' | 'refund' }
 *   release — normal path, funds go to the handyman
 *   refund  — poster disputes/cancels before work is accepted as done;
 *             funds return to the poster instead (job is cancelled, not
 *             completed)
 */
export async function PATCH(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid job ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: job, error: jobError } = await db
      .from('handyman_jobs')
      .select('poster_id, status')
      .eq('id', id)
      .maybeSingle();

    if (jobError) {
      console.error(`PATCH /api/handyman/jobs/${id}/escrow: job fetch error`, jobError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }
    if (job.poster_id !== profile.id && profile.role !== 'admin') {
      throw new ForbiddenError('Only the job poster can release or refund escrow.');
    }

    const body = await request.json();
    const action = body.action === 'refund' ? 'refund' : 'release';

    const { data: escrow, error: escrowError } = await db
      .from('escrow_transactions')
      .select('id, status')
      .eq('job_id', id)
      .maybeSingle();

    if (escrowError) {
      console.error(`PATCH /api/handyman/jobs/${id}/escrow: escrow fetch error`, escrowError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!escrow) {
      return NextResponse.json({ error: 'No escrow has been funded for this job yet.' }, { status: 400 });
    }
    if (escrow.status !== 'held') {
      return NextResponse.json({ error: `Escrow has already been ${escrow.status}.` }, { status: 400 });
    }

    const newEscrowStatus = action === 'refund' ? 'refunded' : 'released';
    const { data: updatedEscrow, error: updateError } = await db
      .from('escrow_transactions')
      .update({ status: newEscrowStatus, released_at: new Date().toISOString() })
      .eq('id', escrow.id)
      .select()
      .single();

    if (updateError) {
      console.error(`PATCH /api/handyman/jobs/${id}/escrow: update error`, updateError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const newJobStatus = action === 'refund' ? 'cancelled' : 'completed';
    await db.from('handyman_jobs').update({ status: newJobStatus }).eq('id', id);

    return NextResponse.json({ escrow: updatedEscrow, jobStatus: newJobStatus });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
