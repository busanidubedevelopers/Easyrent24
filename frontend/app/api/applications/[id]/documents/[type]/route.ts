import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { DOCUMENT_TYPES, type DocumentType } from '@backend/lib/applications';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string; type: string }>;
}

/**
 * GET /api/applications/[id]/documents/[type]
 *
 * Streams back a previously uploaded document (ID, payslip, bank statement).
 * The bucket is private, so this is the only way to read one back — no
 * public URL exists. Visible to the applicant who uploaded it, the landlord
 * of the property the application is for, and admins — the same visibility
 * rule used everywhere else on an application.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id, type } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }
  if (!DOCUMENT_TYPES.includes(type as DocumentType)) {
    return NextResponse.json(
      { error: `document type must be one of: ${DOCUMENT_TYPES.join(', ')}.` },
      { status: 400 }
    );
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: application, error: fetchError } = await db
      .from('applications')
      .select('applicant_id, property_id, documents')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`GET /api/applications/${id}/documents/${type}: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!application) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    const isApplicant = application.applicant_id === profile.id;
    const isAdmin = profile.role === 'admin';

    let isLandlord = false;
    if (application.property_id && profile.role === 'landlord') {
      const { data: prop } = await db
        .from('properties')
        .select('landlord_id')
        .eq('id', application.property_id)
        .maybeSingle();
      isLandlord = prop?.landlord_id === profile.id;
    }

    if (!isApplicant && !isLandlord && !isAdmin) {
      throw new ForbiddenError('You do not have access to this document.');
    }

    const documents = (application.documents as Record<string, { path: string; contentType?: string; filename?: string }>) ?? {};
    const doc = documents[type];
    if (!doc?.path) {
      return NextResponse.json({ error: 'No document of that type has been uploaded.' }, { status: 404 });
    }

    const admin = getAdminDb();
    const { data: fileData, error: downloadError } = await admin.storage
      .from('application-documents')
      .download(doc.path);

    if (downloadError || !fileData) {
      console.error(`GET /api/applications/${id}/documents/${type}: storage download error`, downloadError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return new NextResponse(new Uint8Array(fileData), {
      headers: {
        'Content-Type': doc.contentType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${doc.filename || type}"`,
        'Cache-Control': 'private, max-age=0, no-store',
      },
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
