import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { getSupabaseAdmin } from '@backend/lib/supabaseAdmin';
import { toErrorResponse } from '@backend/lib/apiError';
import { DOCUMENT_TYPES, type DocumentType } from '@backend/lib/applications';
import { isValidUUID } from '@/lib/validation';

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
    const supabase = await getSupabaseServerClient();
    const profile = await getAuthenticatedProfile(supabase);

    const { data: application, error: fetchError } = await supabase
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

    const admin = getSupabaseAdmin();
    const ext = file.name.split('.').pop() || 'pdf';
    const path = `${profile.id}/${id}/${documentType}-${Date.now()}.${ext}`;

    const { error: uploadError } = await admin.storage
      .from('application-documents')
      .upload(path, await file.arrayBuffer(), { contentType: file.type });

    if (uploadError) {
      console.error(`POST /api/applications/${id}/documents: storage upload error`, uploadError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    // Bucket is private — store the storage path, not a public URL. Reading
    // it back later requires a signed URL (created on demand, short-lived),
    // not a permanent public link.
    const updatedDocuments = {
      ...((application.documents as Record<string, string>) ?? {}),
      [documentType]: path,
    };

    const updateFields: Record<string, unknown> = { documents: updatedDocuments };
    if (documentType === 'payslip') {
      updateFields.payslip_url = path; // keep legacy column in sync
    }

    const { data: updated, error: updateError } = await supabase
      .from('applications')
      .update(updateFields)
      .eq('id', id)
      .select()
      .single();

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
