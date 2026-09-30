import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/handyman/jobs/[id]/bid
 *
 * A handyman submits a bid on a job. Handyman role only.
 * One bid per handyman per job (enforced by UNIQUE constraint in schema).
 *
 * Body:
 *   amount    - bid price (required)
 *   message   - optional cover note
 *   eta_days  - optional estimated days to complete
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id: jobId } = await params;

  if (!isValidUUID(jobId)) {
    return NextResponse.json({ error: 'Invalid job ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    if (profile.role !== 'handyman') {
      throw new ForbiddenError('Only handymen can submit bids.');
    }

    // Confirm job exists and is still open / in bidding state
    const { data: job, error: jobError } = await db
      .from('handyman_jobs')
      .select('id, status')
      .eq('id', jobId)
      .maybeSingle();

    if (jobError) {
      console.error(`POST /api/handyman/jobs/${jobId}/bid: job lookup error`, jobError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }
    if (!['open', 'bidding'].includes(job.status)) {
      return NextResponse.json({ error: 'This job is no longer accepting bids.' }, { status: 400 });
    }

    const body = await request.json();
    const amount = Number(body.amount);

    if (!Number.isFinite(amount) || amount <= 0) {
      return NextResponse.json({ error: 'amount must be a positive number.' }, { status: 400 });
    }

    // Move job to 'bidding' state if it was still 'open'
    if (job.status === 'open') {
      await db
        .from('handyman_jobs')
        .update({ status: 'bidding' })
        .eq('id', jobId);
    }

    const { data: bid, error: insertError } = await db
      .from('handyman_bids')
      .insert([
        {
          job_id: jobId,
          handyman_id: profile.id,
          amount,
          message: body.message ?? null,
          eta_days: body.eta_days ? Number(body.eta_days) : null,
          status: 'pending',
        },
      ])
      .select()
      .single();

    if (insertError) {
      // Unique constraint violation = handyman already bid on this job
      if (insertError.code === '23505' || (insertError.message && insertError.message.includes('unique'))) {
        return NextResponse.json(
          { error: 'You have already placed a bid on this job.' },
          { status: 409 }
        );
      }
      console.error(`POST /api/handyman/jobs/${jobId}/bid: insert error`, insertError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ bid }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
