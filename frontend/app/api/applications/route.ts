import { NextRequest, NextResponse } from 'next/server';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { toErrorResponse } from '@backend/lib/apiError';
import { APPLICATION_FEE_ZAR, validateApplicationInput } from '@backend/lib/applications';
import { hasPaidAdminFee } from '@backend/lib/invites';
import { parseLivingSituation, parseMonthlyExpenses, parseOtherIncome } from '@backend/lib/budget';
import { isValidUUID } from '@/lib/validation';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';
import { validatePayloadSize } from '@backend/lib/security/validation';

/**
 * GET /api/applications
 *
 * Returns applications visible to the caller. RLS (migrations 001 + 004)
 * already restricts this to: applications the caller submitted themselves,
 * OR applications on properties the caller owns as landlord. This route
 * doesn't need to branch on role — the same query just returns different
 * rows depending on who's asking, because the database enforces it.
 *
 * Optional query param: property_id — narrow to one property (useful for a
 * landlord viewing applicants for a specific listing).
 */
export async function GET(request: NextRequest) {
  try {
    const db = await getServerDb();
    await getAuthenticatedProfile(db); // just needs *a* valid session

    const propertyId = request.nextUrl.searchParams.get('property_id');

    if (propertyId && !isValidUUID(propertyId)) {
      return NextResponse.json({ error: 'Invalid property_id format.' }, { status: 400 });
    }

    let query = db
      .from('applications')
      .select('id, property_id, applicant_id, status, payment_status, first_name, last_name, monthly_income, created_at, paid_at')
      .order('created_at', { ascending: false });

    if (propertyId) {
      query = query.eq('property_id', propertyId);
    }

    const { data, error } = await query;

    if (error) {
      console.error('GET /api/applications: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ applications: data });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}

/**
 * POST /api/applications
 *
 * Submits a new rental application. The applicant_id is ALWAYS taken from the
 * authenticated session, never from the request body — a tenant cannot submit
 * an application on someone else's behalf.
 *
 * Tenants must have paid the R150 tenant fee at registration first (403
 * ADMIN_FEE_UNPAID otherwise); it covers the application, which goes
 * straight into review. The applicant's budget (monthly expenses, other
 * income, living situation) feeds the affordability assessment.
 *
 * All three consents (credit, ID, bank statements) must be explicitly true
 * — this is what unlocks Task 8 (credit-check service) actually running.
 */
export async function POST(request: NextRequest) {
  try {
    validatePayloadSize(request.headers.get('content-length'));

    const db = await getServerDb();
    const profile = await getAuthenticatedProfile(db);

    const rateLimit = await checkRateLimit(profile.id, 'MUTATIONS');
    if (!rateLimit.allowed) {
      return NextResponse.json(
        { error: 'Too many requests. Please slow down.' },
        { status: 429, headers: getRateLimitHeaders(rateLimit) }
      );
    }

    // Tenants register through a landlord/agent invite and must pay the
    // R150 tenant fee before they can apply. That fee covers the
    // application, so there's nothing more to pay here.
    const tenantFeePaid = profile.role === 'tenant' && (await hasPaidAdminFee(db, profile.id));
    if (profile.role === 'tenant' && !tenantFeePaid) {
      return NextResponse.json(
        { error: 'Please pay your registration admin fee before submitting an application.', code: 'ADMIN_FEE_UNPAID' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { valid, errors } = validateApplicationInput(body);
    const expenses = parseMonthlyExpenses(body.monthly_expenses);
    const otherIncome = parseOtherIncome(body.other_income);
    const livingSituation = parseLivingSituation(body.living_situation);
    const allErrors = [...errors, ...expenses.errors, ...otherIncome.errors, ...livingSituation.errors];

    if (!valid || allErrors.length) {
      return NextResponse.json({ error: 'Invalid input.', details: allErrors }, { status: 400 });
    }
    const now = new Date().toISOString();

    const { data, error } = await db
      .from('applications')
      .insert([
        {
          applicant_id: profile.id,
          property_id: body.property_id ?? null,
          first_name: body.first_name,
          last_name: body.last_name,
          id_number: body.id_number ?? null,
          current_address: body.current_address ?? null,
          phone: body.phone ?? null,
          employer_name: body.employer_name ?? null,
          job_title: body.job_title ?? null,
          employment_type: body.employment_type ?? null,
          monthly_income: body.monthly_income ?? null,
          // No rent when they don't rent now, whatever the form sent.
          current_rent: livingSituation.value && livingSituation.value !== 'renting' ? null : body.current_rent ?? null,
          living_situation: livingSituation.value,
          monthly_expenses: expenses.value ? JSON.stringify(expenses.value) : null,
          other_income: otherIncome.value ? JSON.stringify(otherIncome.value) : null,
          application_fee_amount: tenantFeePaid ? 0 : APPLICATION_FEE_ZAR,
          ...(tenantFeePaid ? { payment_status: 'paid', paid_at: now } : {}),
          bank_name: body.bank_name ?? null,
          account_number: body.account_number ?? null,
          account_type: body.account_type ?? null,
          // Same jsonb-via-raw-pg-param issue as invoices.line_items — a
          // non-null object must be stringified or Postgres rejects it.
          co_applicant_details: body.co_applicant_details ? JSON.stringify(body.co_applicant_details) : null,
          consent_credit: body.consent_credit,
          consent_id_check: body.consent_id_check,
          consent_bank_statements: body.consent_bank_statements,
          status: tenantFeePaid ? 'reviewing' : 'pending',
        },
      ])
      .select()
      .single();

    if (error) {
      console.error('POST /api/applications: DB error', error);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json({ application: data }, { status: 201 });
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
