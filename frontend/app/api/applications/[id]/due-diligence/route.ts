import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { loadApplicationForCaller } from '@backend/lib/applicationAccess';
import { loadDueDiligence } from '@backend/lib/dueDiligence';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/applications/[id]/due-diligence
 *
 * The due diligence summary (identity, income, bank conduct, affordability,
 * documents, fees) for the property's landlord/agent or an admin.
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
    return NextResponse.json(await loadDueDiligence(admin, found));
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
