import { describe, it, expect } from 'vitest';
import {
  averageMonthlyBankIncome,
  compareNames,
  isValidSaIdNumber,
  verifyApplication,
  type DeclaredApplication,
} from '../lib/verification';
import type { BankStatementData, IdDocumentData, PayslipData } from '../lib/extraction';

const NOW = new Date('2026-09-29T00:00:00Z');
const VALID_ID = '8001015009087';

const declared: DeclaredApplication = {
  first_name: 'Thabo',
  last_name: 'Mokoena',
  id_number: VALID_ID,
  employer_name: 'Acme Logistics',
  monthly_income: 40000,
};

const idDoc: IdDocumentData = {
  document_matches_type: true,
  legibility: 'clear',
  notes: null,
  document_kind: 'smart_id_card',
  first_names: 'Thabo Johannes',
  surname: 'Mokoena',
  id_number: VALID_ID,
  date_of_birth: '1980-01-01',
  sex: 'M',
  nationality: 'RSA',
  expiry_date: null,
};

const payslip: PayslipData = {
  document_matches_type: true,
  legibility: 'clear',
  notes: null,
  employee_name: 'T J MOKOENA',
  employee_id_number: VALID_ID,
  employer_name: 'ACME Logistics (Pty) Ltd',
  job_title: 'Dispatcher',
  pay_date: '2026-08-25',
  pay_frequency: 'monthly',
  gross_pay: 40000,
  net_pay: 31000,
  deductions: [],
  garnishee_order: false,
};

const bank: BankStatementData = {
  document_matches_type: true,
  legibility: 'clear',
  notes: null,
  account_holder: 'MR THABO MOKOENA',
  bank_name: 'FNB',
  account_number_last4: '1234',
  period_start: '2026-06-01',
  period_end: '2026-08-31',
  income_deposits: [
    { date: '2026-06-25', description: 'ACME SALARY', amount: 31000 },
    { date: '2026-07-25', description: 'ACME SALARY', amount: 31000 },
    { date: '2026-08-25', description: 'ACME SALARY', amount: 31000 },
  ],
  other_credits: [],
  closing_balance: 5200,
  lowest_balance: 900,
  returned_debit_orders: 0,
  rent_payments: [],
  debt_repayments: [],
  gambling_transactions: 0,
};

const statusOf = (summary: ReturnType<typeof verifyApplication>, key: string) =>
  summary.checks.find((c) => c.key === key)?.status;

describe('isValidSaIdNumber', () => {
  it('accepts a valid ID and rejects bad checksums, dates and lengths', () => {
    expect(isValidSaIdNumber(VALID_ID)).toBe(true);
    expect(isValidSaIdNumber('8001015009088')).toBe(false); // check digit
    expect(isValidSaIdNumber('8013015009087')).toBe(false); // month 13
    expect(isValidSaIdNumber('800101500908')).toBe(false);
    expect(isValidSaIdNumber('80010150090 7')).toBe(false);
  });
});

describe('compareNames', () => {
  it('matches despite case, initials-style extra names and punctuation', () => {
    expect(compareNames('Thabo', 'Mokoena', 'MR THABO J. MOKOENA')).toBe('match');
    expect(compareNames('Zoë', 'van der Merwe', 'ZOE VAN DER MERWE')).toBe('match');
  });

  it('reports partial and full mismatches', () => {
    // Initials that match the first name count as a match…
    expect(compareNames('Thabo', 'Mokoena', 'T J MOKOENA')).toBe('match');
    expect(compareNames('Thabo', 'Mokoena', 'MR T.J. MOKOENA')).toBe('match');
    // …but a different initial, or the surname alone, is only partial.
    expect(compareNames('Thabo', 'Mokoena', 'S J MOKOENA')).toBe('partial');
    expect(compareNames('Thabo', 'Mokoena', 'MOKOENA')).toBe('partial');
    expect(compareNames('Thabo', 'Mokoena', 'Sipho Ndlovu')).toBe('mismatch');
  });
});

describe('averageMonthlyBankIncome', () => {
  it('spreads income deposits over the statement period', () => {
    expect(averageMonthlyBankIncome(bank)).toBe(31000);
  });

  it('returns null when there are no income deposits', () => {
    expect(averageMonthlyBankIncome({ ...bank, income_deposits: [] })).toBeNull();
  });
});

describe('verifyApplication', () => {
  it('passes a consistent application and computes affordability from the payslip', () => {
    const summary = verifyApplication(declared, { id_document: idDoc, payslip, bank_statement: bank }, 12000, NOW);

    expect(summary.verified_monthly_income).toBe(40000);
    expect(summary.income_source).toBe('payslip');
    expect(summary.rent_to_income_pct).toBe(30);
    expect(statusOf(summary, 'id_checksum')).toBe('pass');
    expect(statusOf(summary, 'id_number_match')).toBe('pass');
    expect(statusOf(summary, 'id_name')).toBe('pass');
    expect(statusOf(summary, 'employer_match')).toBe('pass');
    expect(statusOf(summary, 'bank_income')).toBe('pass');
    expect(statusOf(summary, 'declared_income')).toBe('pass');
    expect(statusOf(summary, 'affordability')).toBe('pass');
    expect(summary.checks.some((c) => c.status === 'fail')).toBe(false);
  });

  it('flags a different ID number and inflated declared income', () => {
    const summary = verifyApplication(
      { ...declared, monthly_income: 60000 },
      { id_document: { ...idDoc, id_number: '9001015009086' }, payslip },
      12000,
      NOW
    );
    expect(statusOf(summary, 'id_number_match')).toBe('fail');
    expect(statusOf(summary, 'declared_income')).toBe('warn');
  });

  it('marks missing documents and falls back to declared income for affordability', () => {
    const summary = verifyApplication(declared, {}, 18000, NOW);
    expect(statusOf(summary, 'id_document')).toBe('missing');
    expect(statusOf(summary, 'payslip')).toBe('missing');
    expect(statusOf(summary, 'bank_statement')).toBe('missing');
    expect(summary.verified_monthly_income).toBeNull();
    expect(summary.rent_to_income_pct).toBe(45);
    expect(statusOf(summary, 'affordability')).toBe('fail');
    expect(summary.checks.find((c) => c.key === 'affordability')!.detail).toContain('declared (unverified)');
  });

  it('uses bank deposits as income when there is no payslip', () => {
    const summary = verifyApplication(declared, { bank_statement: bank }, 9300, NOW);
    expect(summary.income_source).toBe('bank_statement');
    expect(summary.verified_monthly_income).toBe(31000);
    expect(summary.rent_to_income_pct).toBe(30);
  });

  it('converts weekly pay to a monthly figure', () => {
    const summary = verifyApplication(declared, { payslip: { ...payslip, pay_frequency: 'weekly', gross_pay: 1000 } }, null, NOW);
    expect(summary.verified_monthly_income).toBe(4333.33);
  });

  it('checks the co-applicant separately and uses combined household income', () => {
    const coDeclared: DeclaredApplication = {
      first_name: 'Naledi',
      last_name: 'Mokoena',
      id_number: null,
      employer_name: null,
      monthly_income: 20000,
    };
    const summary = verifyApplication(
      declared,
      { id_document: idDoc, payslip },
      18000,
      NOW,
      { declared: coDeclared, extractions: { payslip: { ...payslip, employee_name: 'Sipho Ndlovu', gross_pay: 20000 } } }
    );

    expect(statusOf(summary, 'id_name')).toBe('pass');
    expect(statusOf(summary, 'co_payslip_name')).toBe('fail');
    expect(summary.checks.find((c) => c.key === 'co_payslip_name')!.label).toBe('Co-applicant: Name matches payslip');
    expect(statusOf(summary, 'co_id_document')).toBe('missing');
    expect(summary.co_applicant_verified_monthly_income).toBe(20000);
    // R18 000 / (R40 000 + R20 000) = 30%
    expect(summary.rent_to_income_pct).toBe(30);
    expect(summary.checks.find((c) => c.key === 'affordability')!.detail).toContain('verified combined household');
  });

  it('flags wrong document types, stale payslips, expired passports and returned debit orders', () => {
    const summary = verifyApplication(
      declared,
      {
        id_document: { ...idDoc, document_kind: 'passport', expiry_date: '2025-01-01' },
        payslip: { ...payslip, document_matches_type: false, pay_date: '2026-01-25' },
        bank_statement: { ...bank, returned_debit_orders: 3 },
      },
      12000,
      NOW
    );
    expect(statusOf(summary, 'id_expiry')).toBe('fail');
    expect(statusOf(summary, 'payslip')).toBe('fail');
    expect(statusOf(summary, 'payslip_recent')).toBe('warn');
    expect(statusOf(summary, 'returned_debits')).toBe('fail');
  });
});
