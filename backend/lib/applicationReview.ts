import { BASE_DOCUMENT_TYPES, type DocumentType, type StoredDocument } from './applications';
import type { DbClient, PropertySummary } from './applicationAccess';
import { assessAffordability, type ApplicantFinancials, type AffordabilityAssessment } from './affordability';
import { verifyApplication, type Extractions, type VerificationSummary } from './verification';
import { otherIncomeTotal, type LivingSituation, type MonthlyExpenses, type OtherIncome } from './budget';

// Everything a landlord/agent sees when reviewing an application: what was
// read from each document, the verification checks, and the affordability
// assessment with its recommendation. Computed on read so it always reflects
// the latest documents and figures.

export interface CoApplicantDetails {
  firstName?: string;
  lastName?: string;
  idNumber?: string;
  employerName?: string;
  monthlyIncome?: string | number;
  consentIdVerification?: boolean;
  consentBankStatements?: boolean;
}

export interface ExtractionRow {
  document_type: DocumentType;
  status: 'complete' | 'failed';
  extracted: unknown;
  error: string | null;
  model: string | null;
  created_at: string;
}

export interface ApplicationReview {
  has_co_applicant: boolean;
  uploaded: string[];
  extractions: Partial<Record<DocumentType, ExtractionRow>>;
  verification: VerificationSummary;
  assessment: AffordabilityAssessment;
}

/** Checks whose failure means the documents don't match the applicant (not a money problem). */
const DOCUMENT_CHECKS = new Set(['id_checksum', 'id_document', 'id_name', 'id_number_match', 'id_expiry', 'payslip', 'payslip_name', 'bank_statement', 'bank_name']);

/** jsonb columns come back parsed, but tolerate a JSON string too. */
function parseJson<T>(v: unknown): T | null {
  if (v === null || v === undefined) return null;
  if (typeof v === 'string') {
    try {
      return JSON.parse(v) as T;
    } catch {
      return null;
    }
  }
  return v as T;
}

const num = (v: unknown): number | null => {
  const n = typeof v === 'number' ? v : typeof v === 'string' && v.trim() ? Number(v) : NaN;
  return Number.isFinite(n) ? n : null;
};

export async function loadApplicationReview(
  db: DbClient,
  { application, property }: { application: Record<string, any>; property: PropertySummary | null } // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<ApplicationReview> {
  const { data: rows, error } = await db
    .from('document_extractions')
    .select('document_type, status, extracted, error, model, created_at')
    .eq('application_id', application.id)
    .order('created_at', { ascending: false });
  if (error) throw new Error(`extractions fetch failed: ${error.message}`);

  const latest: Partial<Record<DocumentType, ExtractionRow>> = {};
  for (const row of (rows ?? []) as ExtractionRow[]) latest[row.document_type] ??= row;

  const extractionsFor = (prefix: '' | 'co_'): Extractions => {
    const result: Record<string, unknown> = {};
    for (const base of BASE_DOCUMENT_TYPES) {
      const row = latest[`${prefix}${base}` as DocumentType];
      if (row?.status === 'complete') result[base] = row.extracted;
    }
    return result as Extractions;
  };

  const main = extractionsFor('');
  const otherIncome = parseJson<OtherIncome[]>(application.other_income);
  const expenses = parseJson<MonthlyExpenses>(application.monthly_expenses);
  const co = application.co_applicant_details as CoApplicantDetails | null;
  const hasCo = Boolean(co && (co.firstName || co.lastName));
  const coExtractions = extractionsFor('co_');

  const verification = verifyApplication(
    {
      first_name: application.first_name,
      last_name: application.last_name,
      id_number: application.id_number,
      employer_name: application.employer_name,
      monthly_income: num(application.monthly_income),
      other_income_total: otherIncomeTotal(otherIncome),
    },
    main,
    property ? property.price : null,
    new Date(),
    hasCo
      ? {
          declared: {
            first_name: co!.firstName ?? '',
            last_name: co!.lastName ?? '',
            id_number: co!.idNumber || null,
            employer_name: co!.employerName || null,
            monthly_income: num(co!.monthlyIncome),
          },
          extractions: coExtractions,
        }
      : null
  );

  const applicants: ApplicantFinancials[] = [
    {
      role: 'applicant',
      name: `${application.first_name} ${application.last_name}`.trim(),
      declaredIncome: num(application.monthly_income),
      declaredCurrentRent: num(application.current_rent),
      payslip: main.payslip ?? null,
      bank: main.bank_statement ?? null,
      otherIncome,
    },
  ];
  if (hasCo) {
    applicants.push({
      role: 'co_applicant',
      name: [co!.firstName, co!.lastName].filter(Boolean).join(' '),
      declaredIncome: num(co!.monthlyIncome),
      declaredCurrentRent: null,
      payslip: coExtractions.payslip ?? null,
      bank: coExtractions.bank_statement ?? null,
    });
  }

  const documentMismatches = verification.checks.filter(
    (c) => c.status === 'fail' && DOCUMENT_CHECKS.has(c.key.replace(/^co_/, ''))
  ).length;

  const assessment = assessAffordability({
    proposedRent: property ? property.price : null,
    applicants,
    documentMismatches,
    household: { expenses, livingSituation: (application.living_situation as LivingSituation | null) ?? null },
  });

  return {
    has_co_applicant: hasCo,
    uploaded: Object.keys((application.documents as Record<string, StoredDocument>) ?? {}),
    extractions: latest,
    verification,
    assessment,
  };
}
