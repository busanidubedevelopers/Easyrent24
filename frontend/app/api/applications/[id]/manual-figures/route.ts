import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getServerDb } from '@/lib/serverDb';
import { getAuthenticatedProfile } from '@backend/lib/auth';
import { getAdminDb } from '@backend/lib/adminDb';
import { toErrorResponse } from '@backend/lib/apiError';
import { loadApplicationForCaller } from '@backend/lib/applicationAccess';
import { loadApplicationReview } from '@backend/lib/applicationReview';
import { validatePayloadSize, validateSchema } from '@backend/lib/security/validation';
import { checkRateLimit, getRateLimitHeaders } from '@backend/lib/security/rateLimiter';
import { isValidUUID } from '@/lib/validation';

interface RouteParams {
  params: Promise<{ id: string }>;
}

const money = z.number().min(0).max(10_000_000);

const manualFiguresSchema = z
  .object({
    person: z.enum(['applicant', 'co_applicant']).default('applicant'),
    /** The agent confirms the name on the documents matches the applicant. */
    name_confirmed: z.boolean().default(false),
    payslip: z
      .object({
        gross_pay: money,
        net_pay: money,
        pay_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
        employer_name: z.string().trim().max(200).nullable().optional(),
        garnishee_order: z.boolean().default(false),
      })
      .optional(),
    bank: z
      .object({
        months: z.number().int().min(1).max(12).default(3),
        average_monthly_income: money,
        current_rent: money.nullable().optional(),
        debt_repayments: z
          .array(z.object({ description: z.string().trim().min(1).max(120), monthly_amount: money }))
          .max(20)
          .default([]),
        returned_debit_orders: z.number().int().min(0).max(100).default(0),
        gambling_transactions: z.number().int().min(0).max(1000).default(0),
        lowest_balance: z.number().min(-10_000_000).max(10_000_000).nullable().optional(),
      })
      .optional(),
  })
  .refine((v) => v.payslip || v.bank, 'Enter payslip or bank statement figures.');

const isoDay = (d: Date) => d.toISOString().slice(0, 10);

/**
 * POST /api/applications/[id]/manual-figures
 *
 * The landlord/agent enters figures from the applicant's payslip and/or bank
 * statement by hand — for walk-in clients, paper documents, or when a scan
 * can't be read automatically. Stored as document extractions (model
 * "manual") so the verification checks and affordability assessment treat
 * them exactly like automatically read documents, while the UI shows they
 * were entered by a person.
 *
 * Returns the refreshed review (checks + assessment + recommendation).
 */
export async function POST(request: NextRequest, { params }: RouteParams) {
  const { id } = await params;
  if (!isValidUUID(id)) {
    return NextResponse.json({ error: 'Invalid ID format.' }, { status: 400 });
  }

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

    const input = validateSchema(manualFiguresSchema, await request.json());

    const admin = getAdminDb();
    const found = await loadApplicationForCaller(admin, id, profile);
    // Only the property's landlord/agent (or an admin) enters figures; an
    // applicant typing their own "verified" income would defeat the point.
    if (!found || found.role === 'applicant') {
      return NextResponse.json({ error: 'Application not found.' }, { status: 404 });
    }
    const { application } = found;

    const co = application.co_applicant_details as { firstName?: string; lastName?: string } | null;
    if (input.person === 'co_applicant' && !(co?.firstName || co?.lastName)) {
      return NextResponse.json({ error: 'This application has no co-applicant.' }, { status: 400 });
    }
    const personName =
      input.person === 'applicant'
        ? `${application.first_name} ${application.last_name}`.trim()
        : [co?.firstName, co?.lastName].filter(Boolean).join(' ');
    const nameOnDocs = input.name_confirmed ? personName : null;
    const prefix = input.person === 'co_applicant' ? 'co_' : '';
    const note = `Entered manually by ${profile.full_name || 'the agent'} on ${isoDay(new Date())}.`;
    const model = `manual:${profile.id}`;

    const rows: Record<string, unknown>[] = [];

    if (input.payslip) {
      const p = input.payslip;
      rows.push({
        document_type: `${prefix}payslip`,
        extracted: {
          document_matches_type: true,
          legibility: 'clear',
          notes: note,
          employee_name: nameOnDocs,
          employee_id_number: null,
          employer_name: p.employer_name ?? null,
          job_title: null,
          pay_date: p.pay_date ?? null,
          pay_frequency: 'monthly',
          gross_pay: p.gross_pay,
          net_pay: p.net_pay,
          deductions: [],
          garnishee_order: p.garnishee_order,
        },
      });
    }

    if (input.bank) {
      const b = input.bank;
      const end = new Date();
      const start = new Date(end.getTime() - Math.round(b.months * 30.4) * 86_400_000);
      // One entry per month so monthly averages come out exactly as entered.
      const monthly = (amount: number, description: string) =>
        Array.from({ length: b.months }, (_, i) => {
          const d = new Date(end.getFullYear(), end.getMonth() - (b.months - 1 - i), 1);
          return { date: isoDay(d), description, amount };
        });
      rows.push({
        document_type: `${prefix}bank_statement`,
        extracted: {
          document_matches_type: true,
          legibility: 'clear',
          notes: note,
          account_holder: nameOnDocs,
          bank_name: null,
          account_number_last4: null,
          period_start: isoDay(start),
          period_end: isoDay(end),
          income_deposits: b.average_monthly_income > 0 ? monthly(b.average_monthly_income, 'Average monthly income (entered)') : [],
          other_credits: [],
          closing_balance: null,
          lowest_balance: b.lowest_balance ?? null,
          returned_debit_orders: b.returned_debit_orders,
          rent_payments: b.current_rent ? monthly(b.current_rent, 'Rent (entered)') : [],
          debt_repayments: b.debt_repayments,
          gambling_transactions: b.gambling_transactions,
        },
      });
    }

    const { error: insertError } = await admin.from('document_extractions').insert(
      rows.map((r) => ({ ...r, application_id: id, storage_path: 'manual-entry', status: 'complete', model }))
    );
    if (insertError) {
      console.error(`POST /api/applications/${id}/manual-figures: DB insert error`, insertError);
      return NextResponse.json({ error: 'Something went wrong. Please try again.' }, { status: 500 });
    }

    return NextResponse.json(await loadApplicationReview(admin, found));
  } catch (err) {
    const { status, body } = toErrorResponse(err);
    return NextResponse.json(body, { status });
  }
}
