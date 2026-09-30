import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { loadApplicationForCaller } from '@backend/lib/applicationAccess';
import { loadDueDiligence } from '@backend/lib/dueDiligence';
import { renderDueDiligencePdf } from '@backend/lib/dueDiligencePdf';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/applications/[id]/due-diligence/pdf
 *
 * The printable due diligence report — for the agent's file or to send to
 * the property owner. Landlord/agent of the property or an admin only.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }
  try {
    const profile = await getAuthenticatedProfile(await getServerDb());
    const admin = getAdminDb();
    const found = await loadApplicationForCaller(admin, id, profile);
    if (!found || found.role === 'applicant') {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    const dd = await loadDueDiligence(admin, found);
    const bytes = await renderDueDiligencePdf(dd, profile.full_name);
    const safeName = dd.applicant.name.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_|_$/g, '') || 'applicant';
    return new NextResponse(Buffer.from(bytes), {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="due_diligence_${safeName}_${dd.reference}.pdf"`,
        'Cache-Control': 'private, no-store',
      },
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
