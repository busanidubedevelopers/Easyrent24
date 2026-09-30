import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { nextSigner } from '@backend/lib/lease';
import { documentForLease, loadLeaseForCaller } from '@backend/lib/leaseRecords';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/leases/[id]
 *
 * The lease, its full text, the caller's role on it, and whether it's the
 * caller's turn to sign. For the landlord/agent and (once sent) the tenant.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const found = await loadLeaseForCaller(getAdminDb(), id, profile);
    if (!found) {
      return NextResponse.json({ error: 'Lease not found.' }, { status: 404 });
    }

    const { lease, role } = found;
    return NextResponse.json({
      lease: { ...lease, pdf_path: undefined },
      document: documentForLease(lease),
      role,
      can_sign: nextSigner(lease.status) === role,
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
