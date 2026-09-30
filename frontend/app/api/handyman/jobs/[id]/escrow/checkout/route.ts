import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { buildPaymentRequest, PAYFAST_URLS, type PayfastMode } from '@backend/lib/payfast';
import { isValidUUID } from '@/lib/validation';
import { browserReturnBase } from '@/lib/appUrl';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/handyman/jobs/[id]/escrow/checkout
 *
 * Poster funds escrow for an accepted job via PayFast. Same pattern as
 * POST /api/applications/[id]/pay — builds a signed PayFast request, does
 * NOT write the escrow_transactions row here (schema only allows
 * held/released/refunded/disputed, no pre-payment status, matching how a
 * real escrow provider would only record a hold once funds have actually
 * landed). The row is created by POST .../escrow/confirm once the sandbox
 * redirect completes — see that route for why (PayFast's ITN webhook can't
 * reach localhost, so confirmation happens off the client-side redirect
 * instead, the same workaround already used for application fee payments).
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
      .select('id, poster_id, status, assigned_handyman_id, agreed_price, title')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`POST /api/handyman/jobs/${id}/escrow/checkout: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!job) {
      return NextResponse.json({ error: 'Job not found.' }, { status: 404 });
    }
    if (job.poster_id !== profile.id) {
      throw new ForbiddenError('Only the job poster can fund escrow.');
    }
    if (!job.assigned_handyman_id || job.status !== 'in_progress') {
      return NextResponse.json(
        { error: 'A handyman must be assigned before escrow can be funded.' },
        { status: 400 }
      );
    }
    if (!job.agreed_price || Number(job.agreed_price) <= 0) {
      return NextResponse.json({ error: 'This job has no agreed price set.' }, { status: 400 });
    }

    const { data: existingEscrow } = await db
      .from('escrow_transactions')
      .select('id, status')
      .eq('job_id', id)
      .maybeSingle();

    if (existingEscrow) {
      return NextResponse.json(
        { error: `Escrow for this job is already ${existingEscrow.status}.` },
        { status: 400 }
      );
    }

    const merchantId = process.env.PAYFAST_MERCHANT_ID;
    const merchantKey = process.env.PAYFAST_MERCHANT_KEY;
    const passphrase = process.env.PAYFAST_PASSPHRASE;
    const appUrl = process.env.NEXT_PUBLIC_APP_URL;
    const mode = (process.env.PAYFAST_MODE as PayfastMode) || 'sandbox';

    if (!merchantId || !merchantKey || !appUrl) {
      console.error('POST .../escrow/checkout: PayFast env vars not configured.');
      return NextResponse.json(
        { error: 'Payments are not configured yet. Please try again later.' },
        { status: 503 }
      );
    }

    const amount = Number(job.agreed_price);
    const mPaymentId = `ESCROW-${job.id}-${Date.now()}`;

    const fields = buildPaymentRequest({
      merchantId,
      merchantKey,
      passphrase,
      returnUrl: `${browserReturnBase(appUrl)}/handyman/job/${id}/escrow-success`,
      cancelUrl: `${browserReturnBase(appUrl)}/handyman/job/${id}/escrow-cancelled`,
      notifyUrl: `${appUrl}/api/payments/payfast/notify`,
      mPaymentId,
      amount,
      itemName: 'EasyRent24 Job Escrow',
      itemDescription: `Escrow funding for "${job.title}"`,
      nameFirst: profile.full_name?.split(' ')[0] || 'Client',
      nameLast: profile.full_name?.split(' ').slice(1).join(' ') || '',
    });

    return NextResponse.json({
      processUrl: PAYFAST_URLS[mode].process,
      fields,
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
