import { describe, it, expect } from 'vitest';
import { assessAffordability, type ApplicantFinancials } from '../lib/affordability';

const payslip = (gross: number, net: number, extra: Record<string, unknown> = {}) => ({
  pay_frequency: 'monthly' as const,
  gross_pay: gross,
  net_pay: net,
  deductions: [],
  garnishee_order: false,
  ...extra,
});

const bank = (extra: Record<string, unknown> = {}) => ({
  period_start: '2026-06-01',
  period_end: '2026-08-31',
  income_deposits: [],
  rent_payments: [],
  debt_repayments: [],
  returned_debit_orders: 0,
  gambling_transactions: 0,
  lowest_balance: 1200,
  ...extra,
});

const applicant = (over: Partial<ApplicantFinancials> = {}): ApplicantFinancials => ({
  role: 'applicant',
  name: 'Thabo Mokoena',
  declaredIncome: null,
  declaredCurrentRent: null,
  ...over,
});

const rentPaid = (amount: number) =>
  ['2026-06-01', '2026-07-01', '2026-08-01'].map((date) => ({ date, description: 'PAM GOLDING RENTALS', amount }));

describe('assessAffordability: budget, other income and first-time renters', () => {
  const tutoring = (amount: number) =>
    ['2026-06-28', '2026-07-28', '2026-08-28'].map((date) => ({ date, description: 'TUTORING CLIENT PAYMENT', amount }));

  it('assesses a first-time renter living at home on payslip plus other income shown on the statement', () => {
    const a = assessAffordability({
      proposedRent: 8500,
      documentMismatches: 0,
      household: { livingSituation: 'with_family', expenses: { groceries: 3000, utilities: 1200, transport: 1800, phone_internet: 500, entertainment: 600 } },
      applicants: [applicant({
        payslip: payslip(28000, 22000),
        bank: bank({ other_credits: tutoring(4000) }),
        otherIncome: [{ source: 'business', description: 'Weekend tutoring', amount: 4000 }],
      })],
    });

    expect(a.figures.other_income_declared).toBe(4000);
    expect(a.figures.other_income_verified).toBe(4000);
    expect(a.figures.gross_income).toBe(32000);
    expect(a.figures.net_income).toBe(26000);
    expect(a.figures.living_costs).toBe(7100);
    expect(a.figures.living_costs_source).toBe('declared');
    expect(a.figures.current_rent).toBeNull();
    expect(a.reasons.some((r) => r.startsWith('First-time renter (lives with family)'))).toBe(true);
    expect(a.flags.some((f) => f.severity === 'positive' && /Other income of R4 000/.test(f.text))).toBe(true);
    expect(a.recommendation).toBe('approve');
  });

  it('does not count declared other income that the bank statement does not show', () => {
    const a = assessAffordability({
      proposedRent: 8500,
      documentMismatches: 0,
      applicants: [applicant({ payslip: payslip(28000, 22000), bank: bank(), otherIncome: [{ source: 'family_support', amount: 5000 }] })],
    });
    expect(a.figures.other_income_verified).toBe(0);
    expect(a.figures.gross_income).toBe(28000);
    expect(a.flags.some((f) => /does not show on the bank statement/.test(f.text))).toBe(true);
  });

  it('counts only the part of other income that shows on the statement', () => {
    const a = assessAffordability({
      proposedRent: 8500,
      documentMismatches: 0,
      applicants: [applicant({ payslip: payslip(28000, 22000), bank: bank({ other_credits: tutoring(2000) }), otherIncome: [{ source: 'business', amount: 4000 }] })],
    });
    expect(a.figures.other_income_verified).toBe(2000);
    expect(a.flags.some((f) => /only R2 000\/month shows/.test(f.text))).toBe(true);
  });

  it('uses an estimate when declared living expenses are implausibly low, and the higher of declared and seen debt', () => {
    const a = assessAffordability({
      proposedRent: 8500,
      documentMismatches: 0,
      household: { expenses: { groceries: 500, debt: 3000 } },
      applicants: [applicant({ payslip: payslip(40000, 31000), bank: bank({ debt_repayments: [{ description: 'WesBank', monthly_amount: 2000 }] }) })],
    });
    expect(a.figures.living_costs_source).toBe('estimate');
    expect(a.figures.living_costs).toBe(7750);
    expect(a.figures.debt_repayments).toBe(3000);
    expect(a.figures.declared_expenses).toBe(3500);
    expect(a.flags.some((f) => /look low/.test(f.text))).toBe(true);
  });

  it('assesses someone with no salary on the other income their statement shows', () => {
    const a = assessAffordability({
      proposedRent: 4000,
      documentMismatches: 0,
      household: { livingSituation: 'with_family' },
      applicants: [applicant({ bank: bank({ other_credits: tutoring(15000) }), otherIncome: [{ source: 'business', amount: 15000 }] })],
    });
    expect(a.figures.income_basis).toBe('verified');
    expect(a.figures.net_income).toBe(15000);
    expect(a.figures.gross_income).toBe(15000);
    expect(a.recommendation).not.toBe('insufficient_information');
  });
});

describe('assessAffordability', () => {
  it('approves a comfortable applicant who already pays similar rent', () => {
    const a = assessAffordability({
      proposedRent: 9500,
      documentMismatches: 0,
      applicants: [applicant({
        payslip: payslip(40000, 31000),
        bank: bank({ rent_payments: rentPaid(8500), debt_repayments: [{ description: 'WesBank vehicle finance', monthly_amount: 2000 }] }),
      })],
    });

    expect(a.recommendation).toBe('approve');
    expect(a.score).toBeGreaterThanOrEqual(90);
    expect(a.figures.rent_to_gross_pct).toBe(23.8);
    expect(a.figures.current_rent).toBe(8500);
    expect(a.figures.current_rent_source).toBe('bank_statement');
    expect(a.figures.debt_repayments).toBe(2000);
    // min(30% of 40 000, 31 000 − 2 000 − 7 750) = 12 000
    expect(a.figures.max_affordable_rent).toBe(12000);
    expect(a.flags.some((f) => f.severity === 'positive' && f.text.includes('Paid rent every month'))).toBe(true);
    expect(a.recommended_deposit_months).toBe(1);
  });

  it('approves with conditions (2-month deposit, surety) when rent is stretched', () => {
    const a = assessAffordability({
      proposedRent: 11000,
      documentMismatches: 0,
      applicants: [applicant({ payslip: payslip(30000, 24000), bank: bank() })],
    });

    expect(a.recommendation).toBe('approve_with_conditions');
    expect(a.figures.rent_to_gross_pct).toBe(36.7);
    expect(a.conditions).toContain('Take a 2-month deposit.');
    expect(a.conditions.some((c) => c.startsWith('Add a surety'))).toBe(true);
    expect(a.recommended_deposit_months).toBe(2);
  });

  it('declines when rent is far beyond income and says what they can afford', () => {
    const a = assessAffordability({
      proposedRent: 12000,
      documentMismatches: 0,
      applicants: [applicant({ payslip: payslip(20000, 16000), bank: bank() })],
    });

    expect(a.recommendation).toBe('decline');
    // min(6 000, 16 000 − 0 − 4 000) = 6 000
    expect(a.figures.max_affordable_rent).toBe(6000);
    expect(a.headline).toContain('R6 000');
    expect(a.reasons.some((r) => r.includes('at or below R6 000'))).toBe(true);
  });

  it('flags a garnishee order and returned debit orders and requires a debit order', () => {
    const a = assessAffordability({
      proposedRent: 9000,
      documentMismatches: 0,
      applicants: [applicant({
        payslip: payslip(40000, 28000, { garnishee_order: true }),
        bank: bank({ returned_debit_orders: 1 }),
      })],
    });

    expect(a.flags.some((f) => f.severity === 'high' && f.text.includes('garnishee'))).toBe(true);
    expect(a.recommendation).toBe('approve_with_conditions');
    expect(a.conditions).toContain('Collect rent by debit order dated for the day after payday.');
    expect(a.recommended_deposit_months).toBe(2);
  });

  it('declines when debts and living costs leave nothing for rent', () => {
    const a = assessAffordability({
      proposedRent: 8000,
      documentMismatches: 0,
      applicants: [applicant({
        payslip: payslip(30000, 22000),
        bank: bank({ debt_repayments: [{ description: 'Personal loan', monthly_amount: 9000 }, { description: 'Store card', monthly_amount: 1500 }] }),
      })],
    });

    expect(a.figures.disposable_after_rent).toBeLessThan(0);
    expect(a.recommendation).toBe('decline');
  });

  it('asks for documents when income is only declared, but still shows an indicative score', () => {
    const a = assessAffordability({
      proposedRent: 9500,
      documentMismatches: 0,
      applicants: [applicant({ declaredIncome: 40000, declaredCurrentRent: 8000 })],
    });

    expect(a.recommendation).toBe('insufficient_information');
    expect(a.figures.income_basis).toBe('declared');
    expect(a.figures.current_rent_source).toBe('declared');
    expect(a.score).not.toBeNull();
    expect(a.headline).toMatch(/Indicative only/);
  });

  it('asks for information when there is no income at all or no rent', () => {
    expect(assessAffordability({ proposedRent: 9500, documentMismatches: 0, applicants: [applicant()] }).recommendation)
      .toBe('insufficient_information');
    expect(assessAffordability({ proposedRent: null, documentMismatches: 0, applicants: [applicant({ payslip: payslip(40000, 31000) })] }).recommendation)
      .toBe('insufficient_information');
  });

  it('uses combined household income when there is a co-applicant', () => {
    const alone = assessAffordability({
      proposedRent: 14000,
      documentMismatches: 0,
      applicants: [applicant({ payslip: payslip(30000, 24000), bank: bank() })],
    });
    const together = assessAffordability({
      proposedRent: 14000,
      documentMismatches: 0,
      applicants: [
        applicant({ payslip: payslip(30000, 24000), bank: bank() }),
        applicant({ role: 'co_applicant', name: 'Naledi Mokoena', payslip: payslip(25000, 20000), bank: bank() }),
      ],
    });

    expect(alone.recommendation).toBe('decline');
    expect(together.figures.gross_income).toBe(55000);
    expect(together.recommendation).toBe('approve');
  });

  it('works from the bank statement alone (no payslip)', () => {
    const a = assessAffordability({
      proposedRent: 7000,
      documentMismatches: 0,
      applicants: [applicant({
        bank: bank({ income_deposits: [31000, 31000, 31000].map((amount, i) => ({ date: `2026-0${6 + i}-25`, description: 'SALARY', amount })) }),
      })],
    });

    expect(a.figures.net_income).toBe(31000);
    expect(a.figures.income_basis).toBe('verified');
    expect(a.recommendation).toBe('approve');
  });

  it('penalises document mismatches and makes resolving them a condition', () => {
    const a = assessAffordability({
      proposedRent: 9500,
      documentMismatches: 1,
      applicants: [applicant({ payslip: payslip(40000, 31000), bank: bank() })],
    });

    expect(a.recommendation).toBe('approve_with_conditions');
    expect(a.conditions[0]).toMatch(/Resolve the document mismatches/);
  });
});
