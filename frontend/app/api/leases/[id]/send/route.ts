import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { hashLeaseDocument } from '@backend/lib/lease';
import { isValidApplicationStatusTransition, type ApplicationStatus } from '@backend/lib/applications';
import { LEASE_COLUMNS, documentForLease, loadLeaseForCaller, notify } from '@backend/lib/leaseRecords';
import { leaseSentEmail, sendEmail } from '@backend/lib/email';
import { isValidUUID } from '@/lib/validation';
import { appOrigin } from '@/lib/appUrl';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/leases/[id]/send
 *
 * The landlord/agent approves the application and sends the draft lease to
 * the tenant for signature. This freezes the terms: the SHA-256 of the lease
 * text is stored, and both signatures must match it.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
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
    if (lease.status !== 'draft') {
      return NextResponse.json({ error: 'This lease has already been sent.' }, { status: 409 });
    }

    // Sending the lease is the approval decision, and an application can't be
    // approved until its application fee is paid (same rule as PATCH
    // /api/applications/[id]).
    const { data: application, error: appError } = await admin
      .from('applications')
      .select('status, payment_status')
      .eq('id', lease.application_id)
      .maybeSingle();
    if (appError) throw new Error(`application fetch failed: ${appError.message}`);
    if (application?.payment_status !== 'paid') {
      return NextResponse.json(
        { error: 'The tenant has not paid the application fee yet, so this application cannot be approved.' },
        { status: 409 }
      );
    }

    const documentHash = hashLeaseDocument(documentForLease(lease));
    const sentAt = new Date().toISOString();

    const { data: updated, error: updateError } = await admin
      .from('leases')
      .update({ status: 'sent', document_hash: documentHash, sent_at: sentAt, updated_at: sentAt })
      .eq('id', id)
      .eq('status', 'draft')
      .select(LEASE_COLUMNS)
      .maybeSingle();

    if (updateError) {
      console.error(`POST /api/leases/${id}/send: DB update error`, updateError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!updated) {
      return NextResponse.json({ error: 'This lease has already been sent.' }, { status: 409 });
    }

    if (application && isValidApplicationStatusTransition(application.status as ApplicationStatus, 'approved')) {
      await admin.from('applications').update({ status: 'approved' }).eq('id', lease.application_id);
    }

    await notify(admin, lease.tenant_id, {
      type: 'lease_sent',
      title: 'Your lease is ready to sign',
      body: `Your application for ${lease.parties.property.title} was approved. Review and sign your lease.`,
      link: `/leases/${id}`,
    });
    if (lease.parties.tenant.email) {
      await sendEmail(leaseSentEmail(lease.parties.tenant.email, lease.parties, `${appOrigin(request)}/leases/${id}`));
    }

    return NextResponse.json({ lease: { ...updated, pdf_path: undefined } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
