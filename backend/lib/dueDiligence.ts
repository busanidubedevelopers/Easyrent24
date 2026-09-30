import type { ApplicationReview } from './applicationReview';
import type { PropertySummary } from './applicationAccess';
import type { VerificationCheck } from './verification';
import type { AnalystReport } from './aiAnalyst';
import { formatRand, RENT_TO_GROSS_TARGET } from './affordability';
import { TENANT_FEE_ZAR } from './applications';

// ============================================================================
// Due diligence summary
//
// One view of everything checked on an application, grouped the way a
// letting agent thinks about it — identity, income, bank conduct,
// affordability, documents, fees — each with a status and the evidence
// behind it. Used on screen and for the downloadable due diligence report.
// ============================================================================

export type DiligenceStatus = 'passed' | 'attention' | 'failed' | 'outstanding';

export interface DiligenceItem {
  label: string;
  status: DiligenceStatus;
  detail: string;
}

export interface DiligenceSection {
  key: 'identity' | 'income' | 'bank_conduct' | 'affordability' | 'documents' | 'fees';
  title: string;
  status: DiligenceStatus;
  summary: string;
  items: DiligenceItem[];
}

export interface DueDiligence {
  reference: string;
  generated_at: string;
  applicant: { name: string; id_number: string | null; email: string | null; phone: string | null; co_applicant: string | null };
  property: { title: string; address: string; rent: number } | null;
  overall: DiligenceStatus;
  overall_summary: string;
  sections: DiligenceSection[];
  assessment: ApplicationReview['assessment'];
  ai_report: AnalystReport | null;
}

const CHECK_STATUS: Record<VerificationCheck['status'], DiligenceStatus> = {
  pass: 'passed',
  warn: 'attention',
  fail: 'failed',
  missing: 'outstanding',
};

const RANK: Record<DiligenceStatus, number> = { passed: 0, outstanding: 1, attention: 2, failed: 3 };
const worst = (statuses: DiligenceStatus[]): DiligenceStatus =>
  statuses.reduce<DiligenceStatus>((w, s) => (RANK[s] > RANK[w] ? s : w), 'passed');

const SECTION_CHECKS: Record<'identity' | 'income' | 'bank_conduct', string[]> = {
  identity: ['id_document', 'id_checksum', 'id_name', 'id_number_match', 'id_expiry'],
  income: ['payslip', 'payslip_name', 'employer_match', 'payslip_recent', 'declared_income', 'other_income'],
  bank_conduct: ['bank_statement', 'bank_name', 'bank_income', 'returned_debits'],
};

const DOC_LABEL: Record<string, string> = {
  id_document: 'Identity document',
  payslip: 'Payslip',
  bank_statement: 'Bank statement (3 months)',
};

function fromChecks(checks: VerificationCheck[], keys: string[]): DiligenceItem[] {
  return checks
    .filter((c) => keys.includes(c.key.replace(/^co_/, '')))
    .map((c) => ({ label: c.label, status: CHECK_STATUS[c.status], detail: c.detail }));
}

function sectionSummary(status: DiligenceStatus, passedText: string): string {
  if (status === 'passed') return passedText;
  if (status === 'failed') return 'Failed — see the items below before proceeding.';
  if (status === 'attention') return 'Needs your attention — see the items below.';
  return 'Outstanding — information not yet received.';
}

export function buildDueDiligence(input: {
  application: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
  property: PropertySummary | null;
  review: ApplicationReview;
  adminFeePaid: boolean | null;
  aiReport: AnalystReport | null;
  now?: Date;
}): DueDiligence {
  const { application, property, review } = input;
  const checks = review.verification.checks;
  const a = review.assessment;
  const co = application.co_applicant_details as { firstName?: string; lastName?: string } | null;
  const coName = [co?.firstName, co?.lastName].filter(Boolean).join(' ') || null;

  // ── Identity / income / bank conduct: straight from the verification checks
  const identityItems = fromChecks(checks, SECTION_CHECKS.identity);
  const incomeItems = fromChecks(checks, SECTION_CHECKS.income);
  const bankItems = fromChecks(checks, SECTION_CHECKS.bank_conduct);
  // Bank-conduct signals the affordability engine found (gambling, overdraft, debt load).
  for (const flag of a.flags) {
    if (/gambling|overdraft|returned debit|Debt repayments take|garnishee/i.test(flag.text) && !bankItems.some((i) => i.detail === flag.text)) {
      bankItems.push({ label: 'Bank conduct', status: flag.severity === 'high' ? 'failed' : 'attention', detail: flag.text });
    }
  }
  // ── Rental history: a first-time renter has none, and isn't penalised for it.
  const situation = a.figures.living_situation;
  if (a.figures.current_rent_source === 'bank_statement') {
    bankItems.push({ label: 'Current rent seen on statement', status: 'passed', detail: `Pays ${formatRand(a.figures.current_rent ?? 0)}/month rent today.` });
  } else if (situation && situation !== 'renting') {
    const where = situation === 'with_family' ? 'Lives with family / at home' : situation === 'own_home' ? 'Owns their home' : 'Does not rent now';
    bankItems.push({
      label: 'Rental history',
      status: 'passed',
      detail: `${where}: first-time renter, no rent history expected. Affordability rests on the income shown on the payslip and bank statement.`,
    });
  } else if (situation === 'renting' && a.figures.current_rent_source === 'declared') {
    bankItems.push({
      label: 'Rental history',
      status: 'attention',
      detail: `Declared rent of ${formatRand(a.figures.current_rent ?? 0)}/month does not show on the bank statement.`,
    });
  }

  // ── Affordability
  const affordStatus: DiligenceStatus =
    a.recommendation === 'approve' ? 'passed'
    : a.recommendation === 'approve_with_conditions' ? 'attention'
    : a.recommendation === 'decline' ? 'failed'
    : 'outstanding';
  const affordItems: DiligenceItem[] = [
    { label: 'Recommendation', status: affordStatus, detail: `${a.headline}${a.score !== null ? ` (score ${a.score}/100)` : ''}` },
  ];
  if (a.figures.rent_to_gross_pct !== null) {
    affordItems.push({
      label: 'Rent to gross income',
      status: a.figures.rent_to_gross_pct <= RENT_TO_GROSS_TARGET ? 'passed' : a.figures.rent_to_gross_pct <= 40 ? 'attention' : 'failed',
      detail: `${a.figures.rent_to_gross_pct}% (favourable up to ${RENT_TO_GROSS_TARGET}%).`,
    });
  }
  if (a.figures.declared_expenses !== null) {
    affordItems.push({
      label: 'Declared monthly expenses',
      status: a.figures.living_costs_source === 'declared' ? 'passed' : 'attention',
      detail: a.figures.living_costs_source === 'declared'
        ? `${formatRand(a.figures.declared_expenses)} in total; ${formatRand(a.figures.living_costs)} of living costs used in the assessment.`
        : `${formatRand(a.figures.declared_expenses)} declared — living costs look understated, so an estimate of ${formatRand(a.figures.living_costs)} was used.`,
    });
  } else {
    affordItems.push({ label: 'Declared monthly expenses', status: 'outstanding', detail: `None declared — living costs estimated at ${formatRand(a.figures.living_costs)}.` });
  }
  if (a.figures.disposable_after_rent !== null) {
    affordItems.push({
      label: 'Left after rent, debts and living costs',
      status: a.figures.disposable_after_rent < 0 ? 'failed' : 'passed',
      detail: `${formatRand(a.figures.disposable_after_rent)} per month.`,
    });
  }
  for (const c of a.conditions) affordItems.push({ label: 'Condition', status: 'attention', detail: c });

  // ── Documents received
  const docItems: DiligenceItem[] = [];
  const people: [string, string][] = [['', application.first_name ? `${application.first_name} ${application.last_name}` : 'Applicant']];
  if (coName) people.push(['co_', coName]);
  for (const [prefix, who] of people) {
    for (const base of ['id_document', 'payslip', 'bank_statement']) {
      const key = `${prefix}${base}`;
      const uploaded = review.uploaded.includes(key);
      const row = review.extractions[key as keyof typeof review.extractions];
      const read = row?.status === 'complete';
      const how = row?.model?.startsWith('manual') ? 'figures entered by agent' : row?.model === 'builtin-text-reader' ? 'read automatically' : row?.model ? 'read by AI' : '';
      docItems.push({
        label: `${people.length > 1 ? `${who}: ` : ''}${DOC_LABEL[base]}`,
        status: read ? 'passed' : uploaded || row ? 'attention' : 'outstanding',
        detail: read ? `Received and ${how}.` : row?.status === 'failed' ? `Received but could not be read: ${row.error}` : uploaded ? 'Received, not yet read.' : 'Not received.',
      });
    }
  }

  // ── Fees
  const feeCovered = application.payment_status === 'paid' && Number(application.application_fee_amount ?? 0) === 0;
  const feeItems: DiligenceItem[] = feeCovered ? [] : [
    {
      label: 'Application fee',
      status: application.payment_status === 'paid' ? 'passed' : 'outstanding',
      detail: application.payment_status === 'paid'
        ? `R${Number(application.application_fee_amount ?? 0).toFixed(2)} paid.`
        : `R${Number(application.application_fee_amount ?? 0).toFixed(2)} not yet paid — the application can't be approved until it is.`,
    },
  ];
  if (input.adminFeePaid !== null) {
    feeItems.push({
      label: `Tenant fee (R${TENANT_FEE_ZAR})`,
      status: input.adminFeePaid ? 'passed' : 'outstanding',
      detail: input.adminFeePaid ? 'Paid at registration; covers this application.' : 'Not yet paid.',
    });
  }

  const section = (key: DiligenceSection['key'], title: string, items: DiligenceItem[], passedText: string): DiligenceSection => {
    const status = items.length ? worst(items.map((i) => i.status)) : 'outstanding';
    return { key, title, status, summary: sectionSummary(status, passedText), items };
  };

  const sections: DiligenceSection[] = [
    section('identity', 'Identity', identityItems, 'Identity confirmed against the ID document.'),
    section('income', 'Income & employment', incomeItems,
      review.verification.income_source === 'payslip' ? 'Income and employer confirmed by the payslip.' : 'Income confirmed by the bank statement.'),
    section('bank_conduct', 'Bank conduct', bankItems, 'Bank statement consistent, no adverse conduct found.'),
    section('affordability', 'Affordability', affordItems, a.headline),
    section('documents', 'Documents', docItems, 'All documents received and read.'),
    section('fees', 'Fees', feeItems, 'All fees paid.'),
  ];
  // Affordability's own summary is the headline, even when not "passed".
  sections[3].summary = a.headline;

  const overall = worst(sections.map((s) => s.status));
  const failedTitles = sections.filter((s) => s.status === 'failed').map((s) => s.title.toLowerCase());
  const attentionTitles = sections.filter((s) => s.status === 'attention' || s.status === 'outstanding').map((s) => s.title.toLowerCase());
  const overall_summary =
    overall === 'passed' ? 'Due diligence complete — all checks passed.'
    : overall === 'failed' ? `Due diligence found problems with ${failedTitles.join(', ')}.`
    : `Due diligence incomplete — ${attentionTitles.join(', ')} need${attentionTitles.length === 1 ? 's' : ''} attention.`;

  const now = input.now ?? new Date();
  return {
    reference: `DD-${String(application.id).slice(0, 8).toUpperCase()}`,
    generated_at: now.toISOString(),
    applicant: {
      name: `${application.first_name} ${application.last_name}`.trim(),
      id_number: application.id_number ?? null,
      email: application.email ?? null,
      phone: application.phone ?? null,
      co_applicant: coName,
    },
    property: property ? { title: property.title, address: property.address, rent: property.price } : null,
    overall,
    overall_summary,
    sections,
    assessment: a,
    ai_report: input.aiReport,
  };
}

/**
 * Loads everything the due diligence summary needs for an application the
 * caller may already access (see loadApplicationForCaller).
 */
export async function loadDueDiligence(
  db: import('./applicationAccess').DbClient,
  found: { application: Record<string, any>; property: PropertySummary | null } // eslint-disable-line @typescript-eslint/no-explicit-any
): Promise<DueDiligence> {
  const { loadApplicationReview } = await import('./applicationReview');
  const [review, invites, reports] = await Promise.all([
    loadApplicationReview(db, found),
    db.from('tenant_invites').select('status').eq('tenant_id', found.application.applicant_id),
    db.from('affordability_reports').select('report').eq('application_id', found.application.id).eq('status', 'complete').order('created_at', { ascending: false }).limit(1),
  ]);
  const inviteRows = (invites.data ?? []) as { status: string }[];
  return buildDueDiligence({
    application: found.application,
    property: found.property,
    review,
    // Tenants who registered through an invite paid (or owe) an admin fee; others didn't.
    adminFeePaid: inviteRows.length ? inviteRows.some((i) => i.status === 'paid') : null,
    aiReport: ((reports.data ?? [])[0] as { report: AnalystReport } | undefined)?.report ?? null,
  });
}
