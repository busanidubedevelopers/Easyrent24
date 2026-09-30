import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import {
  DOCUMENT_TYPES,
  baseDocumentType,
  storedDocumentPath,
  type DocumentType,
  type StoredDocument,
} from '@backend/lib/applications';
import { loadApplicationForCaller } from '@backend/lib/applicationAccess';
import {
  EXTRACTION_MODEL,
  ExtractionError,
  describeExtractionError,
  extractDocument,
  mediaTypeForPath,
} from '@backend/lib/extraction';
import { LOCAL_READER_MODEL, extractDocumentLocally } from '@backend/lib/localExtraction';
import { loadApplicationReview, type CoApplicantDetails } from '@backend/lib/applicationReview';
import { isValidUUID } from '@/lib/validation';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// Each document is one Claude call; up to six (applicant + co-applicant) run in parallel.
export const maxDuration = 120;

/** Which consent on the application covers sending each document for automated reading. */
const CONSENT_FOR: Record<ReturnType<typeof baseDocumentType>, 'consent_id_check' | 'consent_bank_statements'> = {
  id_document: 'consent_id_check',
  payslip: 'consent_bank_statements',
  bank_statement: 'consent_bank_statements',
};

/**
 * Whether the person the document belongs to consented to automated checks
 * of it: the main applicant's consent columns, or the co-applicant's own
 * consents for `co_` documents.
 */
function hasConsent(
  application: { consent_id_check: boolean | null; consent_bank_statements: boolean | null; co_applicant_details: unknown },
  type: DocumentType
): boolean {
  const column = CONSENT_FOR[baseDocumentType(type)];
  if (!type.startsWith('co_')) return Boolean(application[column]);
  const co = application.co_applicant_details as CoApplicantDetails | null;
  return Boolean(column === 'consent_id_check' ? co?.consentIdVerification : co?.consentBankStatements);
}

/**
 * GET /api/applications/[id]/extract
 *
 * Returns what has been extracted from the application's documents and the
 * resulting verification checks (name/ID/employer/income matches,
 * affordability). Visible to the applicant and the property's landlord.
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
    const found = await loadApplicationForCaller(admin, id, profile);
    if (!found) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    return NextResponse.json(await loadApplicationReview(admin, found));
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/applications/[id]/extract
 *
 * Reads the application's uploaded documents — with Claude when
 * ANTHROPIC_API_KEY is set, otherwise with the built-in reader for digital
 * PDFs (backend/lib/localExtraction.ts) — and stores the extracted fields.
 * The response includes the refreshed affordability assessment. Optional body `{ "document_type": "payslip" }` limits it
 * to one document; otherwise every uploaded document is (re)processed.
 *
 * Callable by the applicant (fired off right after they upload) or by the
 * property's landlord/agent (the "Re-run check" button). A document is only
 * sent for automated reading if its owner (applicant or co-applicant) gave
 * the matching consent.
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const rateLimit = await checkRateLimit(profile.id, 'MUTATIONS');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    // With an API key Claude reads the documents (any format, including
    // scans and photos); without one, the built-in reader handles digital PDFs.
    const useAi = Boolean(process.env.ANTHROPIC_API_KEY);

    const body = await request.json().catch(() => ({}));
    const only = body?.document_type as DocumentType | undefined;
    if (only !== undefined && !DOCUMENT_TYPES.includes(only)) {
      return NextResponse.json({ error: `document_type must be one of: ${DOCUMENT_TYPES.join(', ')}.` }, { status: 400 });
    }

    // Only the applicant, the property's landlord/agent, or an admin.
    const admin = getAdminDb();
    const found = await loadApplicationForCaller(admin, id, profile);
    if (!found) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    const { application } = found;

    const documents = (application.documents as Record<string, StoredDocument>) ?? {};
    const pathOf = (type: DocumentType) => storedDocumentPath(documents[type]);
    const types = (only ? [only] : DOCUMENT_TYPES).filter((t) => pathOf(t));
    if (types.length === 0) {
      return NextResponse.json({ error: 'No uploaded documents to check.' }, { status: 400 });
    }

    const skipped: { document_type: DocumentType; reason: string }[] = [];
    const toProcess = types.filter((type) => {
      if (!hasConsent(application as Parameters<typeof hasConsent>[0], type)) {
        skipped.push({ document_type: type, reason: 'The owner of this document has not consented to automated checks.' });
        return false;
      }
      const mediaType = mediaTypeForPath(pathOf(type)!);
      if (!mediaType) {
        skipped.push({ document_type: type, reason: 'Unsupported file type.' });
        return false;
      }
      if (!useAi && mediaType !== 'application/pdf') {
        skipped.push({
          document_type: type,
          reason: 'Photos can only be read by the AI reader (not set up). Enter the figures manually, or ask for a PDF.',
        });
        return false;
      }
      return true;
    });

    await Promise.all(
      toProcess.map(async (type) => {
        const path = pathOf(type)!;
        let row: Record<string, unknown>;
        let model = useAi ? EXTRACTION_MODEL : LOCAL_READER_MODEL;
        try {
          const { data: file, error: downloadError } = await admin.storage.from('application-documents').download(path);
          if (downloadError || !file) throw new ExtractionError('The uploaded file could not be opened.');

          // Local disk storage returns a Buffer; a Blob-returning store would need arrayBuffer().
          const bytes = Buffer.isBuffer(file) ? file : Buffer.from(await (file as Blob).arrayBuffer());
          const mediaType = mediaTypeForPath(path)!;
          let extracted;
          if (!useAi) {
            extracted = await extractDocumentLocally(baseDocumentType(type), bytes);
          } else {
            try {
              extracted = await extractDocument(baseDocumentType(type), { bytes, mediaType });
            } catch (aiErr) {
              // Claude unavailable (no credit, outage, rate limit): digital PDFs
              // can still be read by the built-in reader, so the assessment works.
              if (mediaType !== 'application/pdf') throw aiErr;
              const reason = describeExtractionError(aiErr, type);
              extracted = await extractDocumentLocally(baseDocumentType(type), bytes);
              extracted.notes = `AI reader unavailable (${reason}) ${extracted.notes ?? ''}`.trim();
              model = LOCAL_READER_MODEL;
            }
          }
          row = { status: 'complete', extracted };
        } catch (err) {
          row = { status: 'failed', error: describeExtractionError(err, type) };
        }

        const { error: insertError } = await admin.from('document_extractions').insert([
          { application_id: id, document_type: type, storage_path: path, model, ...row },
        ]);
        if (insertError) console.error(`extract ${type}: DB insert error`, insertError);
      })
    );

    const result = await loadApplicationReview(admin, found);
    return NextResponse.json({ ...result, skipped });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
