import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { loadApplicationForCaller } from '@backend/lib/applicationAccess';
import { loadApplicationReview } from '@backend/lib/applicationReview';
import { storedDocumentPath, type StoredDocument } from '@backend/lib/applications';
import { ANALYST_MODEL, analyseAffordability, type AnalystDocument } from '@backend/lib/aiAnalyst';
import { describeExtractionError, mediaTypeForPath } from '@backend/lib/extraction';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

// One Claude call over the full documents; allow for adaptive thinking.
export const maxDuration = 180;

const ANALYSED: { key: string; label: string; co: boolean }[] = [
  { key: 'payslip', label: 'payslip', co: false },
  { key: 'bank_statement', label: 'bank statement', co: false },
  { key: 'co_payslip', label: 'payslip', co: true },
  { key: 'co_bank_statement', label: 'bank statement', co: true },
];

/** Only the property's landlord/agent (or an admin) sees or requests analyst reports. */
async function loadForLandlord(id: string, profile: { id: string; role: 'tenant' | 'landlord' | 'handyman' | 'admin' }) {
  const found = await loadApplicationForCaller(getAdminDb(), id, profile);
  return found && found.role !== 'applicant' ? found : null;
}

/**
 * GET /api/applications/[id]/ai-report
 *
 * The latest AI analyst report, and whether the analyst is set up.
 */
export async function GET(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }
  try {
    const profile = await getAuthenticatedProfile(await getServerDb());
    const found = await loadForLandlord(id, profile);
    if (!found) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    const { data, error } = await getAdminDb()
      .from('affordability_reports')
      .select('id, status, report, error, model, created_at')
      .eq('application_id', id)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    if (error) throw new Error(`report fetch failed: ${error.message}`);
    return NextResponse.json({ configured: Boolean(process.env.ANTHROPIC_API_KEY), latest: data ?? null });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/applications/[id]/ai-report
 *
 * Asks Claude to review the applicant's payslip(s) and bank statement(s)
 * alongside the rule-based assessment, and stores the report. Needs
 * ANTHROPIC_API_KEY and the applicant's consent to bank statement review.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }
  try {
    const profile = await getAuthenticatedProfile(await getServerDb());

    const rateLimit = await checkRateLimit(profile.id, 'MUTATIONS');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return NextResponse.json(
        { error: 'The AI analyst is not set up yet. Add ANTHROPIC_API_KEY to the .env file and restart EasyRent.' },
        { status: 503 }
      );
    }

    const found = await loadForLandlord(id, profile);
    if (!found) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    const { application, property } = found;
    if (!application.consent_bank_statements) {
      return NextResponse.json({ error: 'The applicant has not consented to automated review of their financial documents.' }, { status: 409 });
    }

    const admin = getAdminDb();
    const stored = (application.documents as Record<string, StoredDocument>) ?? {};
    const co = application.co_applicant_details as { firstName?: string; lastName?: string; consentBankStatements?: boolean } | null;
    const mainName = `${application.first_name} ${application.last_name}`.trim();
    const coName = [co?.firstName, co?.lastName].filter(Boolean).join(' ');

    const documents: AnalystDocument[] = [];
    for (const d of ANALYSED) {
      if (d.co && !co?.consentBankStatements) continue;
      const path = storedDocumentPath(stored[d.key]);
      const mediaType = path ? mediaTypeForPath(path) : null;
      if (!path || !mediaType) continue;
      const { data: file, error } = await admin.storage.from('application-documents').download(path);
      if (error || !file) continue;
      const bytes = Buffer.isBuffer(file) ? file : Buffer.from(await (file as Blob).arrayBuffer());
      documents.push({ label: `${d.co ? coName || 'Co-applicant' : mainName} — ${d.label}`, bytes, mediaType });
    }
    if (documents.length === 0) {
      return NextResponse.json({ error: 'There are no uploaded payslips or bank statements to analyse.' }, { status: 400 });
    }

    const review = await loadApplicationReview(admin, found);

    let row: Record<string, unknown>;
    try {
      const report = await analyseAffordability({
        applicantNames: [mainName, ...(coName ? [coName] : [])],
        proposedRent: property ? property.price : null,
        assessment: review.assessment,
        documents,
      });
      row = { status: 'complete', report };
    } catch (err) {
      row = { status: 'failed', error: describeExtractionError(err, 'bank_statement') };
    }

    const { data: saved, error: insertError } = await admin
      .from('affordability_reports')
      .insert([{ application_id: id, model: ANALYST_MODEL, requested_by: profile.id, ...row }])
      .select('id, status, report, error, model, created_at')
      .single();
    if (insertError) {
      console.error(`POST /api/applications/${id}/ai-report: DB insert error`, insertError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ configured: true, latest: saved }, { status: row.status === 'complete' ? 201 : 502 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
