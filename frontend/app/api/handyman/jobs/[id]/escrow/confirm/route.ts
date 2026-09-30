import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/handyman/jobs/[id]/escrow/confirm
 *
 * Called by the escrow-success return page right after PayFast redirects
 * back from a completed sandbox payment. PayFast's own webhook (ITN) is the
 * "real" way this would normally get confirmed, but it can't reach
 * localhost during local development/demo — see backend/docs/LOCAL_TESTING_NGROK.md.
 * This is the same documented workaround already used for application fee
 * payments, applied here too: confirm off the client-side redirect instead.
 *
 * Idempotent — if escrow already exists for this job (e.g. the return page
 * re-ran, or the tab was refreshed), returns the existing row rather than
 * erroring or double-holding funds.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid job ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: job, error: fetchError } = await db
      .from('handyman_jobs')
      .select('id, poster_id, assigned_handyman_id, agreed_price')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`POST /api/handyman/jobs/${id}/escrow/confirm: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }
    if (job.poster_id !== profile.id) {
      throw new ForbiddenError('Only the job poster can confirm escrow funding.');
    }
    if (!job.assigned_handyman_id || !job.agreed_price) {
      return NextResponse.json({ error: 'This job has no assigned handyman or agreed price.' }, { status: 400 });
    }

    const { data: existing } = await db
      .from('escrow_transactions')
      .select('*')
      .eq('job_id', id)
      .maybeSingle();

    if (existing) {
      return NextResponse.json({ escrow: existing });
    }

    const { data: escrow, error: insertError } = await db
      .from('escrow_transactions')
      .insert([
        {
          job_id: id,
          payer_id: job.poster_id,
          payee_id: job.assigned_handyman_id,
          amount: job.agreed_price,
          status: 'held',
        },
      ])
      .select()
      .single();

    if (insertError) {
      console.error(`POST /api/handyman/jobs/${id}/escrow/confirm: insert error`, insertError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ escrow }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
