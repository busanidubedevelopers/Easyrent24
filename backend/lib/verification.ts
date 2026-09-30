import type { BankStatementData, IdDocumentData, PayslipData } from './extraction';
import { monthlyOtherCredits } from './affordability';

// ============================================================================
// Application verification
//
// Compares what the applicant (and co-applicant, if any) declared on their
// application against what was extracted from their documents. Produces
// evidence for the landlord's decision — a 'fail' here is a prompt to look
// closer, not an auto-decline.
// ============================================================================

export type CheckStatus = 'pass' | 'warn' | 'fail' | 'missing';

export interface VerificationCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

export interface DeclaredApplication {
  first_name: string;
  last_name: string;
  id_number: string | null;
  employer_name: string | null;
  monthly_income: number | null;
  /** Declared monthly income besides the salary (business, grants, family support…). */
  other_income_total?: number | null;
}

export interface Extractions {
  id_document?: IdDocumentData | null;
  payslip?: PayslipData | null;
  bank_statement?: BankStatementData | null;
}

export interface CoApplicantInput {
  declared: DeclaredApplication;
  extractions: Extractions;
}

export interface VerificationSummary {
  checks: VerificationCheck[];
  /** Main applicant's best evidence-based monthly income: payslip gross, else bank income average. */
  verified_monthly_income: number | null;
  income_source: 'payslip' | 'bank_statement' | null;
  /** Co-applicant's evidence-based monthly income, when there is a co-applicant. */
  co_applicant_verified_monthly_income: number | null;
  /** Monthly rent as a percentage of household income (verified where available, else declared). */
  rent_to_income_pct: number | null;
}

/** Tolerance before declared vs documented income is flagged. */
const INCOME_TOLERANCE = 0.1;
/** Common SA affordability rule of thumb: rent ≤ 30% of gross income. */
const AFFORDABLE_PCT = 30;
const STRETCHED_PCT = 40;
const STALE_DOCUMENT_DAYS = 90;

/**
 * SA ID: YYMMDD SSSS C A Z — 13 digits, a real date of birth, and a Luhn
 * check digit. Catches typos and most made-up numbers.
 */
export function isValidSaIdNumber(id: string): boolean {
  if (!/^\d{13}$/.test(id)) return false;

  const mm = Number(id.slice(2, 4));
  const dd = Number(id.slice(4, 6));
  if (mm < 1 || mm > 12 || dd < 1 || dd > 31) return false;
  const citizenship = id[10];
  if (citizenship !== '0' && citizenship !== '1' && citizenship !== '2') return false;

  let sum = 0;
  for (let i = 0; i < 13; i++) {
    let digit = Number(id[12 - i]);
    if (i % 2 === 1) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
  }
  return sum % 10 === 0;
}

function normaliseName(name: string): string[] {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z\s-]/g, ' ')
    .split(/[\s-]+/)
    .filter((part) => part.length > 1);
}

/**
 * Names match when the surname matches and at least one first name matches.
 * Documents often carry extra middle names or initials, so a surname-only
 * match is 'partial' (a warning), not a mismatch.
 */
export function compareNames(declaredFirst: string, declaredLast: string, documentName: string): 'match' | 'partial' | 'mismatch' {
  const doc = new Set(normaliseName(documentName));
  // Payslips and statements often print initials ("T J MOKOENA"): a single
  // letter matching the first letter of a declared first name counts.
  const docInitials = new Set(
    documentName
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .toLowerCase()
      .split(/[\s.-]+/)
      .filter((part) => /^[a-z]$/.test(part))
  );
  const surnameParts = normaliseName(declaredLast);
  const firstParts = normaliseName(declaredFirst);

  const surnameMatch = surnameParts.length > 0 && surnameParts.every((p) => doc.has(p));
  const firstMatch = firstParts.some((p) => doc.has(p) || docInitials.has(p[0]));

  if (surnameMatch && firstMatch) return 'match';
  if (surnameMatch || firstMatch) return 'partial';
  return 'mismatch';
}

function daysBetween(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / 86_400_000);
}

const formatRand = (n: number) => `R${n.toLocaleString('en-ZA', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

/**
 * Average monthly income from the bank statement's income deposits, spread
 * over the statement period (at least one month).
 */
export function averageMonthlyBankIncome(statement: BankStatementData): number | null {
  const total = statement.income_deposits.reduce((sum, d) => sum + (d.amount > 0 ? d.amount : 0), 0);
  if (total <= 0) return null;

  let months = 1;
  if (statement.period_start && statement.period_end) {
    const days = daysBetween(new Date(statement.period_end), new Date(statement.period_start));
    if (Number.isFinite(days) && days > 0) months = Math.max(1, Math.round(days / 30.4));
  }
  return Math.round((total / months) * 100) / 100;
}

function withinTolerance(declared: number, documented: number): boolean {
  return Math.abs(declared - documented) <= documented * INCOME_TOLERANCE;
}

/**
 * Identity and income checks for one person. `key`/`label` prefixes keep the
 * co-applicant's checks distinct from the main applicant's.
 */
function applicantChecks(
  declared: DeclaredApplication,
  { id_document: id, payslip, bank_statement: bank }: Extractions,
  now: Date,
  keyPrefix: string,
  labelPrefix: string
): { checks: VerificationCheck[]; verifiedIncome: number | null; incomeSource: VerificationSummary['income_source'] } {
  const checks: VerificationCheck[] = [];
  const add = (key: string, label: string, status: CheckStatus, detail: string) =>
    checks.push({ key: keyPrefix + key, label: labelPrefix + label, status, detail });

  const nameCheck = (key: string, label: string, documentName: string | null) => {
    if (!documentName) return add(key, label, 'missing', 'No name could be read from the document.');
    const result = compareNames(declared.first_name, declared.last_name, documentName);
    const declaredName = `${declared.first_name} ${declared.last_name}`;
    if (result === 'match') add(key, label, 'pass', `"${documentName}" matches "${declaredName}".`);
    else if (result === 'partial') add(key, label, 'warn', `"${documentName}" only partly matches "${declaredName}".`);
    else add(key, label, 'fail', `"${documentName}" does not match "${declaredName}".`);
  };

  // ── Identity ──────────────────────────────────────────────────────────────
  if (declared.id_number) {
    if (isValidSaIdNumber(declared.id_number)) add('id_checksum', 'ID number is valid', 'pass', 'Date of birth and check digit are valid.');
    else add('id_checksum', 'ID number is valid', 'fail', 'Declared ID number fails the SA ID checksum.');
  }

  if (!id) {
    add('id_document', 'Identity document', 'missing', 'No identity document has been read yet.');
  } else {
    if (!id.document_matches_type) {
      add('id_document', 'Identity document', 'fail', 'The uploaded file does not look like an identity document.');
    }
    nameCheck('id_name', 'Name matches ID', [id.first_names, id.surname].filter(Boolean).join(' ') || null);

    if (id.id_number && declared.id_number) {
      const same = id.id_number.replace(/\s/g, '') === declared.id_number.replace(/\s/g, '');
      add(
        'id_number_match',
        'ID number matches document',
        same ? 'pass' : 'fail',
        same ? 'Declared ID number matches the document.' : 'Declared ID number differs from the one on the document.'
      );
    } else {
      add('id_number_match', 'ID number matches document', 'missing', 'ID number not available on both the application and the document.');
    }

    if (id.expiry_date && new Date(id.expiry_date) < now) {
      add('id_expiry', 'Document not expired', 'fail', `Expired on ${id.expiry_date}.`);
    }
  }

  // ── Income ────────────────────────────────────────────────────────────────
  let verifiedIncome: number | null = null;
  let incomeSource: VerificationSummary['income_source'] = null;

  if (!payslip) {
    add('payslip', 'Payslip', 'missing', 'No payslip has been read yet.');
  } else {
    if (!payslip.document_matches_type) {
      add('payslip', 'Payslip', 'fail', 'The uploaded file does not look like a payslip.');
    }
    nameCheck('payslip_name', 'Name matches payslip', payslip.employee_name);

    if (declared.employer_name && payslip.employer_name) {
      const docEmployer = new Set(normaliseName(payslip.employer_name));
      const overlap = normaliseName(declared.employer_name).some((part) => docEmployer.has(part));
      add(
        'employer_match',
        'Employer matches payslip',
        overlap ? 'pass' : 'warn',
        overlap
          ? `Payslip employer "${payslip.employer_name}".`
          : `Declared "${declared.employer_name}", payslip shows "${payslip.employer_name}".`
      );
    }

    if (payslip.pay_date) {
      const age = daysBetween(now, new Date(payslip.pay_date));
      add('payslip_recent', 'Payslip is recent', age <= STALE_DOCUMENT_DAYS ? 'pass' : 'warn', `Dated ${payslip.pay_date} (${age} days ago).`);
    }

    const periodsPerMonth = { monthly: 1, fortnightly: 26 / 12, weekly: 52 / 12 } as const;
    const frequency = payslip.pay_frequency;
    if (payslip.gross_pay && frequency && frequency !== 'other') {
      verifiedIncome = Math.round(payslip.gross_pay * periodsPerMonth[frequency] * 100) / 100;
      incomeSource = 'payslip';
    }
  }

  if (!bank) {
    add('bank_statement', 'Bank statement', 'missing', 'No bank statement has been read yet.');
  } else {
    if (!bank.document_matches_type) {
      add('bank_statement', 'Bank statement', 'fail', 'The uploaded file does not look like a bank statement.');
    }
    nameCheck('bank_name', 'Name matches bank account', bank.account_holder);

    const bankIncome = averageMonthlyBankIncome(bank);
    const otherSeen = monthlyOtherCredits(bank);
    if (bankIncome === null && otherSeen > 0 && declared.other_income_total) {
      add('bank_income', 'Income visible on statement', 'pass', `No salary deposits; income comes from other sources (${formatRand(otherSeen)}/month on average).`);
      if (verifiedIncome === null) {
        verifiedIncome = Math.min(otherSeen, declared.other_income_total);
        incomeSource = 'bank_statement';
      }
    } else if (bankIncome === null) {
      add('bank_income', 'Income visible on statement', 'warn', 'No salary or regular income deposits found.');
    } else if (verifiedIncome !== null) {
      // Payslip is gross; deposits are net — expect deposits between ~55% and 105% of gross.
      const ratio = bankIncome / verifiedIncome;
      add(
        'bank_income',
        'Deposits consistent with payslip',
        ratio >= 0.55 && ratio <= 1.05 ? 'pass' : 'warn',
        `Average monthly income deposits ${formatRand(bankIncome)} vs payslip gross ${formatRand(verifiedIncome)}.`
      );
    } else {
      verifiedIncome = bankIncome;
      incomeSource = 'bank_statement';
    }

    if (bank.returned_debit_orders > 0) {
      add(
        'returned_debits',
        'No returned debit orders',
        bank.returned_debit_orders > 2 ? 'fail' : 'warn',
        `${bank.returned_debit_orders} returned debit order(s) in the statement period.`
      );
    }
  }

  // ── Other declared income must show on the bank statement ─────────────────
  const otherDeclared = declared.other_income_total ?? 0;
  if (otherDeclared > 0) {
    const label = 'Other income reflects on bank statement';
    if (!bank) {
      add('other_income', label, 'missing', `Declared ${formatRand(otherDeclared)}/month — a bank statement is needed to confirm it.`);
    } else {
      const seen = monthlyOtherCredits(bank);
      if (seen >= otherDeclared * 0.9) {
        add('other_income', label, 'pass', `Declared ${formatRand(otherDeclared)}/month; the statement shows ${formatRand(seen)}/month of other deposits.`);
      } else if (seen > 0) {
        add('other_income', label, 'warn', `Declared ${formatRand(otherDeclared)}/month but only ${formatRand(seen)}/month shows on the statement — only that is counted.`);
      } else {
        add('other_income', label, 'fail', `Declared ${formatRand(otherDeclared)}/month but no such deposits show on the statement — it is not counted.`);
      }
    }
  }

  if (declared.monthly_income && verifiedIncome) {
    add(
      'declared_income',
      'Declared income matches documents',
      withinTolerance(declared.monthly_income, verifiedIncome) ? 'pass' : 'warn',
      `Declared ${formatRand(declared.monthly_income)}, documents show ${formatRand(verifiedIncome)}.`
    );
  }

  return { checks, verifiedIncome, incomeSource };
}

export function verifyApplication(
  declared: DeclaredApplication,
  extractions: Extractions,
  monthlyRent: number | null,
  now = new Date(),
  coApplicant: CoApplicantInput | null = null
): VerificationSummary {
  const main = applicantChecks(declared, extractions, now, '', '');
  const co = coApplicant ? applicantChecks(coApplicant.declared, coApplicant.extractions, now, 'co_', 'Co-applicant: ') : null;
  const checks = [...main.checks, ...(co?.checks ?? [])];

  // ── Affordability (household income) ─────────────────────────────────────
  const mainIncome = main.verifiedIncome ?? declared.monthly_income;
  const coIncome = coApplicant ? co!.verifiedIncome ?? coApplicant.declared.monthly_income : null;
  const householdIncome = (mainIncome ?? 0) + (coIncome ?? 0);
  const fullyVerified = main.verifiedIncome !== null && (!coApplicant || co!.verifiedIncome !== null);

  let rentToIncome: number | null = null;
  if (monthlyRent && householdIncome > 0) {
    rentToIncome = Math.round((monthlyRent / householdIncome) * 1000) / 10;
    const whose = coApplicant ? 'combined household' : '';
    const basis = fullyVerified ? 'verified' : 'declared (unverified)';
    checks.push({
      key: 'affordability',
      label: 'Affordability',
      status: rentToIncome <= AFFORDABLE_PCT ? 'pass' : rentToIncome <= STRETCHED_PCT ? 'warn' : 'fail',
      detail: `Rent is ${rentToIncome}% of ${[basis, whose].filter(Boolean).join(' ')} income (${formatRand(householdIncome)}).`,
    });
  }

  return {
    checks,
    verified_monthly_income: main.verifiedIncome,
    income_source: main.incomeSource,
    co_applicant_verified_monthly_income: co?.verifiedIncome ?? null,
    rent_to_income_pct: rentToIncome,
  };
}
