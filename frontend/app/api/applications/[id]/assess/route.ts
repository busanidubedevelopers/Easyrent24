import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServerClient } from '@/lib/supabaseServer';
import { getAuthenticatedProfile, ForbiddenError } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import {
  validateSAIdNumber,
  calculateAffordability,
  analyzeBankStatementStub,
  computeRiskAssessment,
} from '@backend/lib/creditCheck';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

/**
 * POST /api/applications/[id]/assess
 *
 * Runs the (heuristic) risk assessment for an application: validates the SA
 * ID number, calculates rent affordability against the property's price,
 * and stores a bank-statement stub result. Writes risk_score and
 * risk_level back onto the application.
 *
 * Landlord (of the property) or admin only — this is explicitly a landlord
 * decision-support tool, not something an applicant triggers on themselves.
 * All three application consents must already be true (checked at
 * submission in Task 6) — this route re-checks them anyway, since consent
 * could theoretically be revoked/changed between submission and review.
 *
 * See backend/lib/creditCheck.ts for the honest scope note: this is a
 * heuristic based on ID validity + affordability, NOT a real credit bureau
 * pull. The response makes that explicit via `isHeuristic: true`.
 */
export async function POST(_request: NextRequest, { params }: RouteParams) {
  const { id } = await params;

  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

  try {
    const supabase = await getSupabaseServerClient();
    const profile = await getAuthenticatedProfile(supabase);

    const { data: application, error: fetchError } = await supabase
      .from('applications')
      .select(
        'id, id_number, monthly_income, documents, consent_credit, consent_id_check, consent_bank_statements, property_id, properties(landlord_id, price)'
      )
      .eq('id', id)
      .maybeSingle();

    if (fetchError) {
      console.error(`POST /api/applications/${id}/assess: DB fetch error`, fetchError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }
    if (!application) {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }

    const property = application.properties as unknown as { landlord_id: string; price: number } | null;
    const isLandlord = property?.landlord_id === profile.id;
    const isAdmin = profile.role === 'admin';

    if (!isLandlord && !isAdmin) {
      throw new ForbiddenError('Only the property landlord can run an assessment on this application.');
    }

    if (!application.consent_credit || !application.consent_id_check || !application.consent_bank_statements) {
      return NextResponse.json(
        { error: 'Cannot run an assessment: not all required consents have been given.' },
        { status: 400 }
      );
    }
    if (!application.id_number) {
      return NextResponse.json({ error: 'Application has no ID number on file.' }, { status: 400 });
    }
    if (!property) {
      return NextResponse.json(
        { error: 'Application has no linked property, so affordability cannot be calculated.' },
        { status: 400 }
      );
    }
    if (application.monthly_income === null || application.monthly_income === undefined) {
      return NextResponse.json({ error: 'Application has no monthly income on file.' }, { status: 400 });
    }

    const idResult = validateSAIdNumber(application.id_number);
    const affordability = calculateAffordability(Number(application.monthly_income), Number(property.price));

    const documents = (application.documents as Record<string, string>) ?? {};
    const bankStatementResult = documents.bank_statement
      ? analyzeBankStatementStub(documents.bank_statement)
      : null;

    const risk = computeRiskAssessment({ idValid: idResult.valid, affordability });

    const { data: updated, error: updateError } = await supabase
      .from('applications')
      .update({ risk_score: risk.riskScore, risk_level: risk.riskLevel })
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error(`POST /api/applications/${id}/assess: DB update error`, updateError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({
      application: updated,
      assessment: {
        idVerification: { valid: idResult.valid, errors: idResult.errors, details: idResult.details },
        affordability,
        bankStatement: bankStatementResult,
        risk,
      },
    });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
