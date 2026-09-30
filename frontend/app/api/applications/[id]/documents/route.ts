import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { DOCUMENT_TYPES, type DocumentType } from '@backend/lib/applications';
import { isValidUUID } from '@/lib/validation';
import { query } from '@backend/lib/db';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const MAX_FILE_SIZE_BYTES = 8 * 1024 * 1024; // 8MB — payslips/statements are often scanned PDFs
const ALLOWED_TYPES = ['application/pdf', 'image/jpeg', 'image/png'];

/**
 * POST /api/applications/[id]/documents
 *
 * Uploads a supporting document (payslip, ID, or bank statement) for an
 * application. Applicant-only — a landlord should never be able to upload
 * documents INTO an applicant's own record; they only ever read them.
 *
 * Expects multipart/form-data with:
 *   file          - the document
 *   document_type - one of 'payslip' | 'id_document' | 'bank_statement'
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const { data: application, error: fetchError } = await db
      .from('applications')
      .select('applicant_id, documents')
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`POST /api/applications/${id}/documents: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!application) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    if (application.applicant_id !== profile.id) {
      throw new ForbiddenError('You can only upload documents to your own application.');
    }

    const formData = await request.formData();
    const file = formData.get('file');
    const documentType = formData.get('document_type');

    if (!file || !(file instanceof File)) {
      return NextResponse.json({ error: 'No file provided.' }, { status: 400 });
    }
    if (typeof documentType !== 'string' || !DOCUMENT_TYPES.includes(documentType as DocumentType)) {
      return NextResponse.json(
        { error: `document_type must be one of: ${DOCUMENT_TYPES.join(', ')}.` },
        { status: 400 }
      );
    }
    if (!ALLOWED_TYPES.includes(file.type)) {
      return NextResponse.json(
        { error: `File type must be one of: ${ALLOWED_TYPES.join(', ')}.` },
        { status: 400 }
      );
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      return NextResponse.json(
        { error: `File must be ${MAX_FILE_SIZE_BYTES / (1024 * 1024)}MB or smaller.` },
        { status: 400 }
      );
    }

    const admin = getAdminDb();
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${profile.id}/${id}/${documentType}-${Date.now()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from('application-documents')
      .upload(path, await file.arrayBuffer(), { contentType: file.type });

    if (uploadError) {
      console.error(`POST /api/applications/${id}/documents: storage upload error`, uploadError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    // Bucket is private — store the storage path (plus enough metadata to
    // serve it back with the right Content-Type), not a public URL. Reading
    // it back goes through GET .../documents/[type] below, which checks the
    // caller is the applicant, the property's landlord, or an admin before
    // streaming the bytes.
    // Merge just this document's entry in one atomic statement. The apply page
    // uploads the ID, payslip and bank statement in parallel; reading the
    // whole map, adding a key and writing it back lets one upload overwrite
    // another (a document silently disappears from the application).
    const entry = JSON.stringify({ path, contentType: file.type, filename: file.name });
    let updated: Record<string, unknown> | null = null;
    let updateError: unknown = null;
    try {
      const result = await query(
        `UPDATE public.applications
            SET documents = COALESCE(documents, '{}'::jsonb) || jsonb_build_object($2::text, $3::jsonb),
                payslip_url = CASE WHEN $2 = 'payslip' THEN $4 ELSE payslip_url END,
                updated_at = timezone('utc'::text, now())
          WHERE id = $1
          RETURNING *`,
        [id, documentType, entry, path]
      );
      updated = result.rows[0] ?? null;
    } catch (err) {
      updateError = err;
    }

    if (updateError) {
      console.error(`POST /api/applications/${id}/documents: DB update error`, updateError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ application: updated }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
