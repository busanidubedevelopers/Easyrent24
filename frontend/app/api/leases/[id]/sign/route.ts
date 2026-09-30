import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { hashLeaseDocument, nextSigner, signatureNameMatches, type LeaseSignature } from '@backend/lib/lease';
import { renderLeasePdf } from '@backend/lib/leasePdf';
import { LEASE_COLUMNS, documentForLease, loadLeaseForCaller, notify, requestMeta } from '@backend/lib/leaseRecords';
import { leaseExecutedEmail, leaseTenantSignedEmail, sendEmail } from '@backend/lib/email';
import { validatePayloadSize, validateSchema } from '@backend/lib/security/validation';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';
import { isValidUUID } from '@/lib/validation';
import { appOrigin } from '@/lib/appUrl';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const signSchema = z.object({
  full_name: z.string().trim().min(2).max(200),
  accept: z.literal(true, 'You must accept the lease terms to sign.'),
});

/**
 * POST /api/leases/[id]/sign
 *
 * Electronic signature: the signer types their full name exactly as it
 * appears on the lease and ticks acceptance. Recorded with time, IP, user
 * agent and the hash of the lease text. The tenant signs first; the
 * landlord/agent's countersignature executes the lease, renders the final
 * PDF and stores it.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    validatePayloadSize(request.headers.get('content-length'));

    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const rateLimit = await checkRateLimit(profile.id, 'MUTATIONS');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    const input = validateSchema(signSchema, await request.json());
    const admin = getAdminDb();

    const found = await loadLeaseForCaller(admin, id, profile);
    if (!found) {
      return NextResponse.json({ error: 'Lease not found.' }, { status: 404 });
    }
    const { lease, role } = found;

    const signer = nextSigner(lease.status);
    if (!signer || signer !== role) {
      const message =
        lease.status === 'executed'
          ? 'This lease has already been signed by both parties.'
          : signer === 'tenant'
            ? 'The tenant must sign first.'
            : 'It is not your turn to sign this lease.';
      return NextResponse.json({ error: message }, { status: 409 });
    }

    const document = documentForLease(lease);
    const documentHash = hashLeaseDocument(document);
    if (documentHash !== lease.document_hash) {
      // The text no longer matches what was sent — e.g. the template changed
      // after sending. Never let anyone sign text other than what was sent.
      console.error(`POST /api/leases/${id}/sign: document hash mismatch`);
      return NextResponse.json(
        { error: 'This lease has changed since it was sent. Ask the landlord to resend it.' },
        { status: 409 }
      );
    }

    const expectedName = role === 'tenant' ? lease.parties.tenant.name : lease.parties.landlord.name;
    if (!signatureNameMatches(input.full_name, expectedName)) {
      return NextResponse.json(
        { error: `Type your full name exactly as it appears on the lease: "${expectedName}".` },
        { status: 400 }
      );
    }

    const now = new Date().toISOString();
    const signature: LeaseSignature = {
      name: expectedName,
      signed_at: now,
      ...requestMeta(request.headers),
      document_hash: documentHash,
    };

    if (role === 'tenant') {
      const { data: updated, error } = await admin
        .from('leases')
        .update({ status: 'tenant_signed', tenant_signature: signature, updated_at: now })
        .eq('id', id)
        .eq('status', 'sent')
        .select(LEASE_COLUMNS)
        .maybeSingle();

      if (error) {
        console.error(`POST /api/leases/${id}/sign: DB update error`, error);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }
      if (!updated) {
        return NextResponse.json({ error: 'This lease was already signed.' }, { status: 409 });
      }

      await notify(admin, lease.landlord_id, {
        type: 'lease_tenant_signed',
        title: 'Tenant signed the lease',
        body: `${expectedName} signed the lease for ${lease.parties.property.title}. Countersign to finalise it.`,
        link: `/applications/lease/${lease.application_id}`,
      });
      if (lease.parties.landlord.email) {
        await sendEmail(
          leaseTenantSignedEmail(lease.parties.landlord.email, lease.parties, `${appOrigin(request)}/applications/lease/${lease.application_id}`)
        );
      }

      return NextResponse.json({ lease: { ...updated, pdf_path: undefined } });
    }

    // Landlord countersignature → execute: render and store the final PDF first,
    // so an executed lease always has its document.
    const pdf = await renderLeasePdf(document, {
      documentHash,
      reference: lease.id,
      signatures: {
        tenant: lease.tenant_signature as unknown as LeaseSignature,
        landlord: signature,
        tenantName: lease.parties.tenant.name,
        landlordName: lease.parties.landlord.name,
      },
    });

    const pdfPath = `${lease.id}/lease-executed-${Date.now()}.pdf`;
    const { error: uploadError } = await admin.storage
      .from('leases')
      .upload(pdfPath, pdf, { contentType: 'application/pdf' });
    if (uploadError) {
      console.error(`POST /api/leases/${id}/sign: PDF upload error`, uploadError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    const { data: executed, error } = await admin
      .from('leases')
      .update({ status: 'executed', landlord_signature: signature, executed_at: now, pdf_path: pdfPath, updated_at: now })
      .eq('id', id)
      .eq('status', 'tenant_signed')
      .select(LEASE_COLUMNS)
      .maybeSingle();

    if (error || !executed) {
      await admin.storage.from('leases').remove([pdfPath]);
      if (error) {
        console.error(`POST /api/leases/${id}/sign: DB update error`, error);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }
      return NextResponse.json({ error: 'This lease was already signed.' }, { status: 409 });
    }

    await notify(admin, lease.tenant_id, {
      type: 'lease_executed',
      title: 'Your lease is signed',
      body: `Your lease for ${lease.parties.property.title} has been signed by both parties. Download your copy.`,
      link: `/leases/${id}`,
    });
    const { tenant, landlord } = lease.parties;
    await Promise.all([
      tenant.email && sendEmail(leaseExecutedEmail(tenant.email, tenant.name, lease.parties, `${appOrigin(request)}/leases/${id}`)),
      landlord.email &&
        sendEmail(leaseExecutedEmail(landlord.email, landlord.name, lease.parties, `${appOrigin(request)}/applications/lease/${lease.application_id}`)),
    ]);

    return NextResponse.json({ lease: { ...executed, pdf_path: undefined } });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
