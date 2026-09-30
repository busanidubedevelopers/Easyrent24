import type { BankStatementData, PayslipData } from './extraction';
import { expensesTotal, livingExpensesTotal, otherIncomeTotal, type LivingSituation, type MonthlyExpenses, type OtherIncome } from './budget';

// ============================================================================
// Affordability assessment
//
// Turns the applicant's payslip and bank statement (read automatically or
// entered by the agent) plus what they declared into a recommendation for
// the landlord/agent: approve, approve with conditions, decline, or ask for
// more information — with the figures and reasons behind it.
//
// Deliberately deterministic and explainable: fixed thresholds, no AI. The
// AI only reads documents (extraction.ts); the decision logic here can be
// read, tested and defended line by line. It is decision SUPPORT — the
// landlord/agent makes the call.
// ============================================================================

export type Recommendation = 'approve' | 'approve_with_conditions' | 'decline' | 'insufficient_information';

export interface ApplicantFinancials {
  role: 'applicant' | 'co_applicant';
  name: string;
  declaredIncome: number | null;
  declaredCurrentRent: number | null;
  payslip?: Partial<PayslipData> | null;
  bank?: Partial<BankStatementData> | null;
  /** Income besides the salary (business, grants, family support…). Only counted where the bank statement shows it. */
  otherIncome?: OtherIncome[] | null;
}

export interface HouseholdBudget {
  /** Recurring monthly expenses the applicant declared. */
  expenses?: MonthlyExpenses | null;
  livingSituation?: LivingSituation | null;
}

export interface AffordabilityInput {
  proposedRent: number | null;
  applicants: ApplicantFinancials[];
  /** Verification checks that failed on identity/document grounds (name/ID mismatch, wrong document). */
  documentMismatches: number;
  household?: HouseholdBudget;
}

export interface AffordabilityFlag {
  severity: 'high' | 'medium' | 'positive';
  text: string;
}

export interface AffordabilityAssessment {
  recommendation: Recommendation;
  score: number | null;
  headline: string;
  reasons: string[];
  conditions: string[];
  recommended_deposit_months: number;
  flags: AffordabilityFlag[];
  figures: {
    proposed_rent: number | null;
    gross_income: number;
    net_income: number;
    income_basis: 'verified' | 'partly_verified' | 'declared' | 'none';
    current_rent: number | null;
    current_rent_source: 'bank_statement' | 'declared' | null;
    debt_repayments: number;
    living_costs: number;
    /** Where living_costs came from: the applicant's declared expenses, or our estimate. */
    living_costs_source: 'declared' | 'estimate';
    /** Total declared recurring expenses (incl. debt and savings), or null if none were declared. */
    declared_expenses: number | null;
    other_income_declared: number;
    /** The part of the declared other income the bank statement shows — the only part counted. */
    other_income_verified: number;
    living_situation: LivingSituation | null;
    disposable_after_rent: number | null;
    rent_to_gross_pct: number | null;
    rent_to_net_pct: number | null;
    debt_to_net_pct: number | null;
    rent_change_pct: number | null;
    max_affordable_rent: number;
  };
}

// ── Policy (one place to tune) ──────────────────────────────────────────────
/** Widely used SA letting guideline: rent ≤ 30% of gross income. */
export const RENT_TO_GROSS_TARGET = 30;
const RENT_TO_GROSS_STRETCH = 35;
const RENT_TO_GROSS_LIMIT = 40;
/** Living-cost allowance when we can't see actual spending: share of take-home pay, with a floor per adult. */
const LIVING_COST_SHARE = 0.25;
const LIVING_COST_FLOOR_PER_ADULT = 3000;
/** Take-home estimate when only gross is known (PAYE + UIF + typical deductions). */
const NET_FROM_GROSS_ESTIMATE = 0.75;
const DEBT_TO_NET_HIGH = 40;
/** Declared living expenses below this share of our estimate are treated as understated. */
const DECLARED_EXPENSES_MIN_SHARE = 0.6;
/** Other income counts as shown on the statement when deposits cover at least this share of it. */
const OTHER_INCOME_MATCH = 0.9;
const APPROVE_SCORE = 75;
const DECLINE_SCORE = 50;

const PERIODS_PER_MONTH = { monthly: 1, fortnightly: 26 / 12, weekly: 52 / 12 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;
const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : null);
export const formatRand = (n: number) =>
  `R${Math.round(n).toLocaleString('en-ZA').replace(/ /g, ' ')}`;

function monthsInStatement(bank: Partial<BankStatementData>): number {
  if (bank.period_start && bank.period_end) {
    const days = (new Date(bank.period_end).getTime() - new Date(bank.period_start).getTime()) / 86_400_000;
    if (Number.isFinite(days) && days > 0) return Math.max(1, Math.round(days / 30.4));
  }
  return 1;
}

/** Average monthly non-salary credits on a bank statement (business income, grants, family support…). */
export function monthlyOtherCredits(bank: Partial<BankStatementData> | null | undefined): number {
  if (!bank) return 0;
  const total = (bank.other_credits ?? []).reduce((s, c) => s + (c.amount > 0 ? c.amount : 0), 0);
  return round2(total / monthsInStatement(bank));
}

interface PersonFigures {
  gross: number;
  net: number;
  grossVerified: boolean;
  netVerified: boolean;
  currentRent: number | null;
  currentRentSource: 'bank_statement' | 'declared' | null;
  rentMonthsPaid: number;
  statementMonths: number;
  debt: number;
  debtCreditors: string[];
  otherDeclared: number;
  otherSeen: number;
  otherVerified: number;
  returnedDebits: number;
  gambling: number;
  overdrawn: boolean;
  garnishee: boolean;
}

function personFigures(a: ApplicantFinancials): PersonFigures {
  const { payslip, bank } = a;

  // Gross: payslip first (verified), else declared.
  let gross = 0;
  let grossVerified = false;
  const freq = payslip?.pay_frequency;
  const perMonth = freq && freq !== 'other' ? PERIODS_PER_MONTH[freq] : 1;
  if (payslip?.gross_pay) {
    gross = payslip.gross_pay * perMonth;
    grossVerified = true;
  } else if (a.declaredIncome) {
    gross = a.declaredIncome;
  }

  // Take-home: payslip net, else average income deposits, else an estimate from gross.
  let net = 0;
  let netVerified = false;
  const statementMonths = bank ? monthsInStatement(bank) : 1;
  const deposits = (bank?.income_deposits ?? []).reduce((s, d) => s + (d.amount > 0 ? d.amount : 0), 0);
  if (payslip?.net_pay) {
    net = payslip.net_pay * perMonth;
    netVerified = true;
  } else if (deposits > 0) {
    net = deposits / statementMonths;
    netVerified = true;
  } else {
    net = gross * NET_FROM_GROSS_ESTIMATE;
  }
  if (!gross && net) gross = net / NET_FROM_GROSS_ESTIMATE; // bank-only applicant

  // Other income (business, grants, family support…) counts only as far as
  // the bank statement shows it. It isn't taxed through payroll, so it adds
  // to take-home and gross alike.
  const otherDeclared = otherIncomeTotal(a.otherIncome);
  const otherSeen = monthlyOtherCredits(bank);
  const otherVerified = round2(Math.min(otherDeclared, otherSeen));
  if (otherVerified > 0) {
    gross += otherVerified;
    net += otherVerified;
    netVerified = true;
  }

  // What they pay in rent today.
  const rentPayments = bank?.rent_payments ?? [];
  const rentTotal = rentPayments.reduce((s, r) => s + Math.abs(r.amount), 0);
  let currentRent: number | null = null;
  let currentRentSource: PersonFigures['currentRentSource'] = null;
  if (rentTotal > 0) {
    currentRent = rentTotal / statementMonths;
    currentRentSource = 'bank_statement';
  } else if (a.declaredCurrentRent) {
    currentRent = a.declaredCurrentRent;
    currentRentSource = 'declared';
  }

  const debts = bank?.debt_repayments ?? [];
  return {
    gross: round2(gross),
    net: round2(net),
    grossVerified,
    netVerified,
    currentRent: currentRent === null ? null : round2(currentRent),
    currentRentSource,
    rentMonthsPaid: new Set(rentPayments.map((r) => r.date.slice(0, 7))).size,
    statementMonths,
    debt: round2(debts.reduce((s, d) => s + Math.abs(d.monthly_amount), 0)),
    debtCreditors: debts.map((d) => d.description),
    otherDeclared,
    otherSeen,
    otherVerified,
    returnedDebits: bank?.returned_debit_orders ?? 0,
    gambling: bank?.gambling_transactions ?? 0,
    overdrawn: typeof bank?.lowest_balance === 'number' && bank.lowest_balance < 0,
    garnishee: Boolean(payslip?.garnishee_order),
  };
}

export function assessAffordability(input: AffordabilityInput): AffordabilityAssessment {
  const people = input.applicants.map((a) => ({ a, f: personFigures(a) }));
  const main = people.find((p) => p.a.role === 'applicant');
  const rent = input.proposedRent && input.proposedRent > 0 ? input.proposedRent : null;

  const gross = round2(people.reduce((s, p) => s + p.f.gross, 0));
  const net = round2(people.reduce((s, p) => s + p.f.net, 0));
  const adults = Math.max(1, people.length);
  const expenses = input.household?.expenses ?? null;
  const declaredDebt = Number(expenses?.debt) || 0;
  const bankDebt = round2(people.reduce((s, p) => s + p.f.debt, 0));
  // Debt: the higher of what the statement shows and what they declared.
  const debt = round2(Math.max(bankDebt, declaredDebt));

  // Living costs: what the applicant declared, unless it's implausibly low
  // next to our estimate — then the estimate, and a flag.
  const estimate = round2(Math.max(net * LIVING_COST_SHARE, LIVING_COST_FLOOR_PER_ADULT * adults));
  const declaredTotal = expenses && Object.keys(expenses).length ? expensesTotal(expenses) : null;
  const declaredLiving = declaredTotal === null ? null : livingExpensesTotal(expenses);
  const declaredUsable = declaredLiving !== null && declaredLiving >= estimate * DECLARED_EXPENSES_MIN_SHARE;
  const living = declaredUsable ? declaredLiving : estimate;
  const livingSituation = input.household?.livingSituation ?? null;
  const otherDeclared = round2(people.reduce((s, p) => s + p.f.otherDeclared, 0));
  const otherVerified = round2(people.reduce((s, p) => s + p.f.otherVerified, 0));
  const currentRentPeople = people.filter((p) => p.f.currentRent !== null);
  const currentRent = currentRentPeople.length ? round2(currentRentPeople.reduce((s, p) => s + (p.f.currentRent ?? 0), 0)) : null;
  const currentRentSource = currentRentPeople.some((p) => p.f.currentRentSource === 'bank_statement')
    ? 'bank_statement'
    : currentRentPeople.length ? 'declared' : null;

  const anyVerified = people.some((p) => p.f.grossVerified || p.f.netVerified);
  const allVerified = people.length > 0 && people.every((p) => p.f.grossVerified || p.f.netVerified);
  const incomeBasis: AffordabilityAssessment['figures']['income_basis'] =
    gross <= 0 ? 'none' : allVerified ? 'verified' : anyVerified ? 'partly_verified' : 'declared';

  const maxAffordable = Math.max(0, Math.floor(Math.min(gross * (RENT_TO_GROSS_TARGET / 100), net - debt - living) / 100) * 100);

  const figures: AffordabilityAssessment['figures'] = {
    proposed_rent: rent,
    gross_income: gross,
    net_income: net,
    income_basis: incomeBasis,
    current_rent: currentRent,
    current_rent_source: currentRentSource,
    debt_repayments: debt,
    living_costs: living,
    living_costs_source: declaredUsable ? 'declared' : 'estimate',
    declared_expenses: declaredTotal,
    other_income_declared: otherDeclared,
    other_income_verified: otherVerified,
    living_situation: livingSituation,
    disposable_after_rent: rent === null ? null : round2(net - debt - living - rent),
    rent_to_gross_pct: rent === null ? null : pct(rent, gross),
    rent_to_net_pct: rent === null ? null : pct(rent, net),
    debt_to_net_pct: pct(debt, net),
    rent_change_pct: rent !== null && currentRent ? Math.round(((rent - currentRent) / currentRent) * 1000) / 10 : null,
    max_affordable_rent: maxAffordable,
  };

  const base = {
    reasons: [] as string[],
    conditions: [] as string[],
    flags: [] as AffordabilityFlag[],
    figures,
  };

  // ── Not enough to go on ────────────────────────────────────────────────
  if (rent === null) {
    return { ...base, recommendation: 'insufficient_information', score: null, recommended_deposit_months: 1,
      headline: 'No rent to assess against — this application is not linked to a priced property.' };
  }
  if (gross <= 0) {
    return { ...base, recommendation: 'insufficient_information', score: null, recommended_deposit_months: 1,
      headline: 'No income information yet.',
      reasons: ['Request the applicant\'s latest payslip and 3 months of bank statements, or enter the figures from them manually.'] };
  }

  // ── Score ─────────────────────────────────────────────────────────────────
  const { reasons, conditions, flags } = base;
  let score = 100;
  const r2g = figures.rent_to_gross_pct!;
  const disposable = figures.disposable_after_rent!;
  const who = people.length > 1 ? 'the household\'s combined' : 'the applicant\'s';

  if (r2g <= 25) {
    flags.push({ severity: 'positive', text: `Rent is only ${r2g}% of ${who} gross income.` });
  } else if (r2g <= RENT_TO_GROSS_TARGET) {
    score -= 5;
    reasons.push(`Rent is ${r2g}% of ${who} gross income — within the ${RENT_TO_GROSS_TARGET}% guideline.`);
  } else if (r2g <= RENT_TO_GROSS_STRETCH) {
    score -= 15;
    flags.push({ severity: 'medium', text: `Rent is ${r2g}% of gross income — above the ${RENT_TO_GROSS_TARGET}% guideline.` });
  } else if (r2g <= RENT_TO_GROSS_LIMIT) {
    score -= 25;
    flags.push({ severity: 'high', text: `Rent is ${r2g}% of gross income — stretched.` });
  } else {
    score -= 40;
    flags.push({ severity: 'high', text: `Rent is ${r2g}% of gross income — well beyond what is affordable.` });
  }

  if (disposable < 0) {
    score -= 30;
    flags.push({ severity: 'high', text: `After rent, debt repayments and living costs the household is ${formatRand(-disposable)} short each month.` });
  } else if (disposable < rent * 0.1) {
    score -= 10;
    flags.push({ severity: 'medium', text: `Only ${formatRand(disposable)} left each month after rent, debts and living costs — little buffer.` });
  } else {
    flags.push({ severity: 'positive', text: `${formatRand(disposable)} left each month after rent, debt repayments and living costs.` });
  }

  const d2n = figures.debt_to_net_pct ?? 0;
  if (d2n > DEBT_TO_NET_HIGH) {
    score -= 15;
    flags.push({ severity: 'high', text: `Debt repayments take ${d2n}% of take-home pay (${formatRand(debt)}/month).` });
  } else if (debt > 0) {
    reasons.push(`Existing debt repayments of ${formatRand(debt)}/month (${d2n}% of take-home pay) are taken into account.`);
  }

  if (declaredTotal !== null) {
    if (declaredUsable) {
      reasons.push(`Living costs are the applicant's declared monthly expenses of ${formatRand(living)} (excluding debt and savings).`);
    } else {
      score -= 5;
      flags.push({ severity: 'medium', text: `Declared living expenses of ${formatRand(declaredLiving ?? 0)} look low for this household — used an estimate of ${formatRand(estimate)} instead.` });
    }
  } else {
    reasons.push(`No monthly expenses were declared — living costs are estimated at ${formatRand(estimate)}.`);
  }
  if (declaredDebt > bankDebt) {
    reasons.push(`Declared debt repayments of ${formatRand(declaredDebt)}/month are used (the statement shows ${formatRand(bankDebt)}).`);
  }

  for (const { a, f } of people) {
    const label = people.length > 1 ? `${a.name}: ` : '';
    if (f.otherDeclared > 0) {
      if (f.otherSeen >= f.otherDeclared * OTHER_INCOME_MATCH) {
        flags.push({ severity: 'positive', text: `${label}Other income of ${formatRand(f.otherDeclared)}/month is reflected on the bank statement and counted.` });
      } else if (f.otherSeen > 0) {
        score -= 5;
        flags.push({ severity: 'medium', text: `${label}Declared other income of ${formatRand(f.otherDeclared)}/month — only ${formatRand(f.otherSeen)}/month shows on the bank statement, so only that is counted.` });
      } else {
        score -= 10;
        flags.push({ severity: 'medium', text: `${label}Declared other income of ${formatRand(f.otherDeclared)}/month does not show on the bank statement, so it is not counted.` });
      }
    }
    if (f.garnishee) {
      score -= 25;
      flags.push({ severity: 'high', text: `${label}Payslip shows a garnishee / emolument attachment order — a court-ordered debt.` });
    }
    if (f.returnedDebits > 2) {
      score -= 20;
      flags.push({ severity: 'high', text: `${label}${f.returnedDebits} returned debit orders on the bank statement.` });
    } else if (f.returnedDebits > 0) {
      score -= 10;
      flags.push({ severity: 'medium', text: `${label}${f.returnedDebits} returned debit order(s) on the bank statement.` });
    }
    if (f.gambling > 0) {
      score -= f.gambling >= 5 ? 15 : 5;
      flags.push({ severity: f.gambling >= 5 ? 'high' : 'medium', text: `${label}${f.gambling} gambling transaction(s) on the bank statement.` });
    }
    if (f.overdrawn) {
      score -= 5;
      flags.push({ severity: 'medium', text: `${label}Account went into overdraft during the statement period.` });
    }
    if (f.currentRentSource === 'bank_statement' && f.rentMonthsPaid >= f.statementMonths && f.statementMonths >= 2) {
      score += 5;
      flags.push({ severity: 'positive', text: `${label}Paid rent every month on the statement (${f.rentMonthsPaid} of ${f.statementMonths} months).` });
    }
  }

  if (livingSituation && livingSituation !== 'renting' && !people.some((p) => p.f.currentRentSource === 'bank_statement')) {
    const where = livingSituation === 'with_family' ? 'lives with family' : livingSituation === 'own_home' ? 'owns their home' : 'does not rent now';
    reasons.push(`First-time renter (${where}): there is no rent history to check, so this is assessed on the income shown on the payslip and bank statement, the declared expenses and bank conduct.`);
  }

  if (figures.rent_change_pct !== null && currentRent) {
    const change = figures.rent_change_pct;
    if (change <= 10) {
      flags.push({ severity: 'positive', text: `New rent (${formatRand(rent)}) is in line with the ${formatRand(currentRent)} they pay now.` });
    } else if (change > 30) {
      score -= 5;
      flags.push({ severity: 'medium', text: `New rent is ${change}% more than the ${formatRand(currentRent)} they pay now.` });
    } else {
      reasons.push(`New rent is ${change}% more than the ${formatRand(currentRent)} they currently pay.`);
    }
  }

  if (input.documentMismatches > 0) {
    score -= 15 * input.documentMismatches;
    flags.push({ severity: 'high', text: `${input.documentMismatches} document check(s) failed — names or ID numbers don't match. Review the verification details.` });
  }

  if (incomeBasis !== 'verified') {
    score -= incomeBasis === 'declared' ? 15 : 5;
    flags.push({ severity: 'medium', text: incomeBasis === 'declared'
      ? 'Income is as declared by the applicant — not yet confirmed by a payslip or bank statement.'
      : 'Income is confirmed for some applicants only.' });
  }

  score = Math.max(0, Math.min(100, score));
  const highFlags = flags.filter((f) => f.severity === 'high').length;

  // ── Recommendation ────────────────────────────────────────────────────────
  if (incomeBasis === 'declared') {
    return { ...base, score, recommendation: 'insufficient_information', recommended_deposit_months: 1,
      headline: `Indicative only: on declared income the score is ${score}/100. Confirm income before deciding.`,
      reasons: [...reasons, 'Request the latest payslip and 3 months of bank statements (or enter the figures from them).'] };
  }

  if (score < DECLINE_SCORE || disposable < 0 || r2g > RENT_TO_GROSS_LIMIT + 5) {
    return { ...base, score, recommendation: 'decline', recommended_deposit_months: 1,
      headline: maxAffordable > 0
        ? `Not affordable at ${formatRand(rent)}. The most this applicant can comfortably afford is about ${formatRand(maxAffordable)}/month.`
        : `Not affordable at ${formatRand(rent)}.`,
      reasons: [...reasons, ...(maxAffordable > 0 ? [`Consider offering a property at or below ${formatRand(maxAffordable)}/month.`] : [])] };
  }

  if (score >= APPROVE_SCORE && highFlags === 0) {
    return { ...base, score, recommendation: 'approve', recommended_deposit_months: 1,
      headline: `Affordable. Rent of ${formatRand(rent)} fits comfortably — recommended to approve.`,
      reasons };
  }

  // Approve with conditions — each condition answers a specific risk.
  if (r2g > RENT_TO_GROSS_TARGET || disposable < rent * 0.1) {
    conditions.push('Take a 2-month deposit.');
    conditions.push('Add a surety or a co-applicant with their own income.');
  }
  if (people.some((p) => p.f.returnedDebits > 0 || p.f.garnishee)) {
    conditions.push('Collect rent by debit order dated for the day after payday.');
    if (!conditions.includes('Take a 2-month deposit.')) conditions.unshift('Take a 2-month deposit.');
  }
  if (d2n > DEBT_TO_NET_HIGH && !conditions.some((c) => c.startsWith('Add a surety'))) {
    conditions.push('Add a surety or a co-applicant with their own income.');
  }
  if (figures.rent_change_pct !== null && figures.rent_change_pct > 30) {
    conditions.push('Consider a shorter first term (6 months) before renewing for longer.');
  }
  if (input.documentMismatches > 0) {
    conditions.unshift('Resolve the document mismatches (see verification) before signing.');
  }
  if (conditions.length === 0) conditions.push('Take a 2-month deposit.');

  return { ...base, score, recommendation: 'approve_with_conditions',
    recommended_deposit_months: conditions.includes('Take a 2-month deposit.') ? 2 : 1,
    headline: `Affordable with conditions — score ${score}/100.`,
    reasons };
}
