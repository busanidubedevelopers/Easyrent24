import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import type { LeaseSignature } from '@backend/lib/lease';
import { renderLeasePdf } from '@backend/lib/leasePdf';
import { documentForLease, loadLeaseForCaller } from '@backend/lib/leaseRecords';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/leases/[id]/pdf
 *
 * Downloads the lease as a PDF. An executed lease returns the stored,
 * signed PDF exactly as it was generated at execution; anything earlier is
 * rendered on the fly and watermarked DRAFT.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);
    const admin = getAdminDb();

    const found = await loadLeaseForCaller(admin, id, profile);
    if (!found) {
      return NextResponse.json({ error: 'Lease not found.' }, { status: 404 });
    }
    const { lease } = found;

    let bytes: Uint8Array;
    if (lease.status === 'executed' && lease.pdf_path) {
      const { data, error } = await admin.storage.from('leases').download(lease.pdf_path);
      if (error || !data) {
        console.error(`GET /api/leases/${id}/pdf: storage download error`, error);
        return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
      }
      bytes = Buffer.isBuffer(data) ? new Uint8Array(data) : new Uint8Array(await (data as Blob).arrayBuffer());
    } else {
      bytes = await renderLeasePdf(documentForLease(lease), {
        watermark: 'DRAFT',
        documentHash: lease.document_hash,
        reference: lease.id,
        signatures: {
          tenant: lease.tenant_signature as unknown as LeaseSignature | null,
          landlord: null,
          tenantName: lease.parties.tenant.name,
          landlordName: lease.parties.landlord.name,
        },
      });
    }

    const safeName = lease.parties.tenant.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'tenant';
    const suffix = lease.status === 'executed' ? 'signed' : 'draft';

    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="lease_${safeName}_${suffix}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
