import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { sendEmail, leaseCancelledEmail } from '@backend/lib/email';
import { LEASE_COLUMNS, loadLeaseForCaller, notify } from '@backend/lib/leaseRecords';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const CANCELLABLE = ['draft', 'sent', 'tenant_signed'];

/**
 * POST /api/leases/[id]/cancel
 *
 * The landlord/agent withdraws a lease that hasn't been executed yet — e.g.
 * wrong terms, or the tenant pulled out. Any tenant signature is voided.
 * The landlord can then edit the terms and issue a fresh lease for the same
 * application (POST /api/applications/[id]/lease resets a cancelled lease).
 *
 * An executed lease can't be cancelled here: ending a signed lease is a
 * legal process (notice, CPA s14), not a button.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);
    const admin = getAdminDb();

    const found = await loadLeaseForCaller(admin, id, profile);
    if (!found || found.role === 'tenant') {
      return NextResponse.json({ error: 'Lease not found.' }, { status: 404 });
    }
    const { lease } = found;
    if (!CANCELLABLE.includes(lease.status)) {
      return NextResponse.json(
        { error: lease.status === 'executed' ? 'A signed lease cannot be withdrawn.' : 'This lease is already cancelled.' },
        { status: 409 }
      );
    }

    const now = new Date().toISOString();
    const { data: cancelled, error } = await admin
      .from('leases')
      .update({ status: 'cancelled', updated_at: now })
      .eq('id', id)
      .eq('status', lease.status)
      .select(LEASE_COLUMNS)
      .maybeSingle();

    if (error) {
      console.error(`POST /api/leases/${id}/cancel: DB update error`, error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!cancelled) {
      return NextResponse.json({ error: 'This lease changed while you were cancelling it. Refresh and try again.' }, { status: 409 });
    }

    // Only tell the tenant if they had ever seen it.
    if (lease.status !== 'draft') {
      await notify(admin, lease.tenant_id, {
        type: 'lease_cancelled',
        title: 'Lease withdrawn',
        body: `The lease for ${lease.parties.property.title} has been withdrawn by ${lease.parties.landlord.name}.`,
        link: `/leases/${id}`,
      });
      if (lease.parties.tenant.email) {
        await sendEmail(leaseCancelledEmail(lease.parties.tenant.email, lease.parties));
      }
    }

    return NextResponse.json({ lease: { ...cancelled, pdf_path: undefined } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
