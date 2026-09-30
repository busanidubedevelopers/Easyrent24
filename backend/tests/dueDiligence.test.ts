import { describe, it, expect } from 'vitest';
import { PDFDocument } from 'pdf-lib';
import { buildDueDiligence } from '../lib/dueDiligence';
import { renderDueDiligencePdf } from '../lib/dueDiligencePdf';
import { assessAffordability } from '../lib/affordability';
import { verifyApplication } from '../lib/verification';
import type { ApplicationReview } from '../lib/applicationReview';

const NOW = new Date('2026-09-30T10:00:00Z');
const property = { id: 'p1', title: 'Chic City Center Studio', address: '88 Bree Street', price: 9500, landlord_id: 'l1' };

const idDoc = { document_matches_type: true, legibility: 'clear' as const, notes: null, document_kind: 'smart_id_card' as const, first_names: 'THABO JOHANNES', surname: 'MOKOENA', id_number: '8001015009087', date_of_birth: '1980-01-01', sex: 'M' as const, nationality: 'RSA', expiry_date: null };
const payslip = { document_matches_type: true, legibility: 'clear' as const, notes: null, employee_name: 'THABO MOKOENA', employee_id_number: null, employer_name: 'ACME LOGISTICS (PTY) LTD', job_title: null, pay_date: '2026-08-25', pay_frequency: 'monthly' as const, gross_pay: 40000, net_pay: 31000, deductions: [], garnishee_order: false };
const bank = { document_matches_type: true, legibility: 'clear' as const, notes: null, account_holder: 'MR THABO MOKOENA', bank_name: 'FNB', account_number_last4: '1234', period_start: '2026-06-01', period_end: '2026-08-31',
  income_deposits: [6, 7, 8].map((m) => ({ date: `2026-0${m}-25`, description: 'ACME SALARY', amount: 31000 })), closing_balance: 5200, lowest_balance: 900, returned_debit_orders: 0,
  rent_payments: [6, 7, 8].map((m) => ({ date: `2026-0${m}-01`, description: 'PAM GOLDING RENTALS', amount: 8500 })), debt_repayments: [{ description: 'WESBANK', monthly_amount: 2000 }], gambling_transactions: 0 };

const application = {
  id: 'd7c93482-08ac-4c17-acfa-328debab204c', applicant_id: 't1', first_name: 'Thabo', last_name: 'Mokoena', id_number: '8001015009087',
  email: 'thabo@example.com', phone: '0821234567', employer_name: 'Acme Logistics', monthly_income: 40000, co_applicant_details: null,
  payment_status: 'paid', application_fee_amount: '150.00',
};

function review(over: { extractions?: Record<string, unknown>; uploaded?: string[]; declared?: Partial<typeof application> } = {}): ApplicationReview {
  const ex = (over.extractions ?? { id_document: idDoc, payslip, bank_statement: bank }) as any;
  const app = { ...application, ...over.declared };
  const verification = verifyApplication(
    { first_name: app.first_name, last_name: app.last_name, id_number: app.id_number, employer_name: app.employer_name, monthly_income: app.monthly_income },
    ex, 9500, NOW
  );
  const assessment = assessAffordability({
    proposedRent: 9500,
    documentMismatches: verification.checks.filter((c) => c.status === 'fail' && /id_|payslip_name|bank_name/.test(c.key)).length,
    applicants: [{ role: 'applicant', name: 'Thabo Mokoena', declaredIncome: 40000, declaredCurrentRent: null, payslip: ex.payslip, bank: ex.bank_statement }],
    household: { expenses: { groceries: 4000, utilities: 1500, transport: 2000, phone_internet: 600, entertainment: 800, debt: 2000 }, livingSituation: 'renting' },
  });
  const extractions: any = {};
  for (const [k, v] of Object.entries(ex)) extractions[k] = { document_type: k, status: 'complete', extracted: v, error: null, model: 'builtin-text-reader', created_at: NOW.toISOString() };
  return { has_co_applicant: false, uploaded: over.uploaded ?? Object.keys(ex), extractions, verification, assessment };
}

describe('buildDueDiligence', () => {
  it('passes a fully verified, affordable, paid-up applicant', () => {
    const dd = buildDueDiligence({ application, property, review: review(), adminFeePaid: true, aiReport: null, now: NOW });

    expect(dd.reference).toBe('DD-D7C93482');
    expect(dd.sections.map((s) => s.key)).toEqual(['identity', 'income', 'bank_conduct', 'affordability', 'documents', 'fees']);
    expect(dd.sections.find((s) => s.key === 'affordability')!.status).toBe('passed');
    expect(dd.sections.find((s) => s.key === 'documents')!.items.every((i) => i.status === 'passed')).toBe(true);
    expect(dd.sections.find((s) => s.key === 'fees')!.items.map((i) => i.detail)).toEqual(['R150.00 paid.', 'Paid at registration; covers this application.']);
    expect(dd.sections.find((s) => s.key === 'bank_conduct')!.items.some((i) => i.label === 'Current rent seen on statement')).toBe(true);
  });

  it('flags a wrong ID number, unpaid fee and missing bank statement', () => {
    const dd = buildDueDiligence({
      application: { ...application, payment_status: 'unpaid' },
      property,
      review: review({ extractions: { id_document: { ...idDoc, id_number: '9001015009086' }, payslip }, uploaded: ['id_document', 'payslip'] }),
      adminFeePaid: null,
      aiReport: null,
      now: NOW,
    });

    expect(dd.overall).toBe('failed');
    expect(dd.sections.find((s) => s.key === 'identity')!.status).toBe('failed');
    expect(dd.sections.find((s) => s.key === 'fees')!.status).toBe('outstanding');
    expect(dd.sections.find((s) => s.key === 'fees')!.items).toHaveLength(1); // no invite → no admin fee line
    const docs = dd.sections.find((s) => s.key === 'documents')!;
    expect(docs.items.find((i) => i.label.startsWith('Bank statement'))!.status).toBe('outstanding');
    expect(dd.overall_summary).toMatch(/identity/);
  });
});

describe('renderDueDiligencePdf', () => {
  it('produces a readable multi-section PDF', async () => {
    const dd = buildDueDiligence({ application, property, review: review(), adminFeePaid: true, aiReport: null, now: NOW });
    const bytes = await renderDueDiligencePdf(dd, 'Demo Landlord');
    expect(Buffer.from(bytes.slice(0, 5)).toString()).toBe('%PDF-');
    const loaded = await PDFDocument.load(bytes);
    expect(loaded.getTitle()).toBe('Due diligence report DD-D7C93482');
    expect(loaded.getPageCount()).toBeGreaterThanOrEqual(1);
  });
});
