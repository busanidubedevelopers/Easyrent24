import { describe, it, expect } from 'vitest';
import { PDFDocument, StandardFonts } from 'pdf-lib';
import {
  extractDocumentLocally,
  parseAmount,
  parseDate,
  readBankStatement,
  readIdDocument,
  readPayslip,
} from '../lib/localExtraction';
import { ExtractionError } from '../lib/extraction';
import { assessAffordability } from '../lib/affordability';

async function pdfWith(lines: string[]): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const page = pdf.addPage([595, 842]);
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  lines.forEach((l, i) => page.drawText(l, { x: 40, y: 800 - i * 18, size: 10, font }));
  return pdf.save();
}

describe('parseAmount / parseDate', () => {
  it('reads South African amount formats', () => {
    expect(parseAmount('R 31 000.00')).toBe(31000);
    expect(parseAmount('31,000.00')).toBe(31000);
    expect(parseAmount('31000,00')).toBe(31000);
    expect(parseAmount('-8 500.00')).toBe(-8500);
    expect(parseAmount('+1 250.50')).toBe(1250.5);
  });

  it('reads common date formats', () => {
    expect(parseDate('2026-08-25')).toBe('2026-08-25');
    expect(parseDate('25/08/2026')).toBe('2026-08-25');
    expect(parseDate('25 Aug 2026')).toBe('2026-08-25');
    expect(parseDate('25 September 2026')).toBe('2026-09-25');
    expect(parseDate('25 Jun', 2026)).toBe('2026-06-25');
    expect(parseDate('no date here')).toBeNull();
  });
});

describe('readPayslip', () => {
  const text = [
    'ACME LOGISTICS (PTY) LTD - PAYSLIP',
    'Employee: T J MOKOENA',
    'ID Number: 8001015009087',
    'Job title: Dispatcher',
    'Pay date: 2026-08-25 Frequency: Monthly',
    'Gross pay: R 40 000.00',
    'PAYE: R 7 450.00 UIF: R 177.12',
    'Garnishee order: R 1 200.00',
    'Net pay: R 31 000.00',
  ].join('\n');

  it('extracts pay, deductions and a garnishee order', () => {
    const p = readPayslip(text);
    expect(p.document_matches_type).toBe(true);
    expect(p.employer_name).toBe('ACME LOGISTICS (PTY) LTD');
    expect(p.employee_name).toBe('T J MOKOENA');
    expect(p.employee_id_number).toBe('8001015009087');
    expect(p.pay_date).toBe('2026-08-25');
    expect(p.pay_frequency).toBe('monthly');
    expect(p.gross_pay).toBe(40000);
    expect(p.net_pay).toBe(31000);
    expect(p.deductions.map((d) => d.description)).toEqual(expect.arrayContaining(['PAYE', 'UIF']));
    expect(p.deductions.find((d) => d.description === 'PAYE')!.amount).toBe(7450);
    expect(p.garnishee_order).toBe(true);
  });

  it('handles "Total earnings" / "Nett salary" wording', () => {
    const p = readPayslip('SALARY ADVICE\nTotal earnings 25,500.00\nNett salary 19,850.40\nPay date 25/07/2026');
    expect(p.gross_pay).toBe(25500);
    expect(p.net_pay).toBe(19850.4);
    expect(p.pay_date).toBe('2026-07-25');
    expect(p.garnishee_order).toBe(false);
  });
});

describe('readBankStatement', () => {
  it('reads an ISO-dated statement with explicit signs', () => {
    const s = readBankStatement([
      'FNB - CHEQUE ACCOUNT STATEMENT',
      'Account holder: MR THABO MOKOENA',
      'Account: ****1234',
      'Period: 2026-06-01 to 2026-08-31',
      '2026-06-01 PAM GOLDING RENTALS -8 500.00',
      '2026-06-15 WESBANK VEHICLE FINANCE -2 000.00',
      '2026-06-25 ACME SALARY +31 000.00',
      '2026-07-01 PAM GOLDING RENTALS -8 500.00',
      '2026-07-15 WESBANK VEHICLE FINANCE -2 000.00',
      '2026-07-20 HOLLYWOODBETS -150.00',
      '2026-07-25 ACME SALARY +31 000.00',
      '2026-08-01 PAM GOLDING RENTALS -8 500.00',
      '2026-08-15 WESBANK VEHICLE FINANCE -2 000.00',
      '2026-08-16 DEBIT ORDER RETURNED DISCOVERY -450.00',
      '2026-08-25 ACME SALARY +31 000.00',
      'Closing balance: R 5 200.00',
      'Lowest balance: -R 320.00',
    ].join('\n'));

    expect(s.document_matches_type).toBe(true);
    expect(s.bank_name).toBe('FNB');
    expect(s.account_holder).toBe('MR THABO MOKOENA');
    expect(s.account_number_last4).toBe('1234');
    expect(s.period_start).toBe('2026-06-01');
    expect(s.period_end).toBe('2026-08-31');
    expect(s.income_deposits.map((d) => d.amount)).toEqual([31000, 31000, 31000]);
    expect(s.rent_payments.map((r) => r.amount)).toEqual([8500, 8500, 8500]);
    expect(s.debt_repayments).toEqual([{ description: 'WESBANK VEHICLE FINANCE', monthly_amount: 2000 }]);
    expect(s.gambling_transactions).toBe(1);
    expect(s.returned_debit_orders).toBe(1);
    expect(s.closing_balance).toBe(5200);
  });

  it('reads DD/MM/YYYY lines with Cr/Dr markers and a balance column', () => {
    const s = readBankStatement([
      'Capitec Bank Statement',
      'Account name: Naledi Dlamini',
      '25/06/2026 SALARY DEPOSIT EMPLOYER 22 000.00 Cr 23 150.00',
      '01/07/2026 RAWSON RENTALS 6 800.00 Dr 16 350.00',
      '25/07/2026 SALARY DEPOSIT EMPLOYER 22 000.00 Cr 36 900.00',
      '01/08/2026 RAWSON RENTALS 6 800.00 Dr 30 100.00',
    ].join('\n'));

    expect(s.bank_name).toBe('Capitec');
    expect(s.income_deposits.map((d) => d.amount)).toEqual([22000, 22000]);
    expect(s.rent_payments.map((r) => r.amount)).toEqual([6800, 6800]);
  });

  it('separates other income (business, grants, family support) from salary, ignoring fees and refunds', () => {
    const s = readBankStatement([
      'FNB Bank Statement',
      'Statement period: 2026-06-01 to 2026-08-31',
      '2026-06-25 ACME SALARY 20 000.00',
      '2026-06-28 TUTORING CLIENT PAYMENT 3 000.00 Cr',
      '2026-07-02 SASSA CHILD GRANT 560.00',
      '2026-07-05 CASH DEPOSIT FEE 25.00',
      '2026-07-09 TAKEALOT REFUND 499.00 Cr',
      '2026-07-12 TRANSFER FROM OWN SAVINGS 1 000.00 Cr',
    ].join('\n'));

    expect(s.income_deposits.map((d) => d.amount)).toEqual([20000]);
    expect(s.other_credits.map((c) => [c.description, c.amount])).toEqual([
      ['TUTORING CLIENT PAYMENT', 3000],
      ['SASSA CHILD GRANT', 560],
    ]);
  });
});

describe('readIdDocument', () => {
  it('reads a smart ID card', () => {
    const id = readIdDocument('REPUBLIC OF SOUTH AFRICA - SMART ID CARD\nSurname: MOKOENA\nNames: THABO JOHANNES\nIdentity Number: 8001015009087\nDate of Birth: 1980-01-01\nSex: M\nNationality: RSA');
    expect(id.document_kind).toBe('smart_id_card');
    expect(id.surname).toBe('MOKOENA');
    expect(id.first_names).toBe('THABO JOHANNES');
    expect(id.id_number).toBe('8001015009087');
    expect(id.date_of_birth).toBe('1980-01-01');
    expect(id.sex).toBe('M');
  });
});

describe('extractDocumentLocally (real PDFs)', () => {
  it('reads a digital payslip PDF end to end and feeds the assessment', async () => {
    const payslipPdf = await pdfWith(['ACME LOGISTICS (PTY) LTD - PAYSLIP', 'Employee: THABO MOKOENA', 'Pay date: 2026-08-25', 'Gross pay: R 40 000.00', 'Net pay: R 31 000.00']);
    const bankPdf = await pdfWith([
      'FNB - CHEQUE ACCOUNT STATEMENT', 'Account holder: MR THABO MOKOENA', 'Period: 2026-06-01 to 2026-08-31',
      '2026-06-01 PAM GOLDING RENTALS -8 500.00', '2026-06-25 ACME SALARY +31 000.00',
      '2026-07-01 PAM GOLDING RENTALS -8 500.00', '2026-07-25 ACME SALARY +31 000.00',
      '2026-08-01 PAM GOLDING RENTALS -8 500.00', '2026-08-25 ACME SALARY +31 000.00',
    ]);

    const payslip = await extractDocumentLocally('payslip', payslipPdf);
    const bank = await extractDocumentLocally('bank_statement', bankPdf);
    expect(payslip.gross_pay).toBe(40000);
    expect(bank.rent_payments).toHaveLength(3);

    const a = assessAffordability({
      proposedRent: 9500,
      documentMismatches: 0,
      applicants: [{ role: 'applicant', name: 'Thabo Mokoena', declaredIncome: 40000, declaredCurrentRent: null, payslip, bank }],
    });
    expect(a.recommendation).toBe('approve');
    expect(a.figures.current_rent).toBe(8500);
    expect(a.figures.income_basis).toBe('verified');
  });

  it('refuses scanned documents with a clear message', async () => {
    const blank = await pdfWith([]);
    await expect(extractDocumentLocally('payslip', blank)).rejects.toBeInstanceOf(ExtractionError);
  });
});
