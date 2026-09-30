import type { BaseDocumentType } from './applications';
import { ExtractionError, type BankStatementData, type ExtractedByType, type IdDocumentData, type PayslipData } from './extraction';

// ============================================================================
// Built-in document reader (no AI, no API key)
//
// Reads the text layer of *digital* PDFs — the payslips and bank statements
// payroll systems and banks email out — and pulls out the fields the
// affordability assessment needs, using rules for common South African
// formats. Scanned documents and photos have no text layer: those need the
// AI reader (ANTHROPIC_API_KEY) or manual entry by the agent.
//
// Output has exactly the same shape as the AI reader, so verification and
// the assessment treat both the same; `notes` says it came from this reader.
// ============================================================================

export const LOCAL_READER_MODEL = 'builtin-text-reader';
const NOTE = 'Read by the built-in text reader — check the key figures against the document.';

const MONTHS: Record<string, number> = {
  jan: 1, feb: 2, mar: 3, apr: 4, may: 5, jun: 6, jul: 7, aug: 8, sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

/** PDF → text lines. Throws ExtractionError for documents without a text layer. */
export async function pdfText(bytes: ArrayBuffer | Buffer | Uint8Array): Promise<string> {
  const { extractText, getDocumentProxy } = await import('unpdf');
  const data = bytes instanceof Uint8Array ? new Uint8Array(bytes) : new Uint8Array(bytes as ArrayBuffer);
  const pdf = await getDocumentProxy(data);
  const { text } = await extractText(pdf, { mergePages: true });
  const clean = (Array.isArray(text) ? text.join('\n') : text).replace(/ /g, ' ');
  if (clean.replace(/\s/g, '').length < 40) {
    throw new ExtractionError(
      'This looks like a scanned or photographed document, which the built-in reader cannot read. Enter the figures manually, or set up the AI reader.'
    );
  }
  return clean;
}

// ── Parsing helpers ─────────────────────────────────────────────────────────

const AMOUNT = String.raw`[-+]?\s?R?\s?\d{1,3}(?:[ ,]\d{3})*(?:[.,]\d{2})|[-+]?\s?R?\s?\d+(?:[.,]\d{2})`;
const amountRe = () => new RegExp(AMOUNT, 'g');

/** "R 31 000.00" / "31,000.00" / "31000,00" / "-8 500.00" → number. */
export function parseAmount(raw: string): number | null {
  let s = raw.replace(/R/gi, '').replace(/\s/g, '');
  const negative = s.startsWith('-');
  s = s.replace(/^[-+]/, '');
  if (/,\d{2}$/.test(s) && !s.includes('.')) s = s.replace(/\./g, '').replace(',', '.');
  else s = s.replace(/,/g, '');
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}

/** Dates as YYYY-MM-DD, DD/MM/YYYY, DD-MM-YYYY, DD Mon YYYY or DD Mon (with a fallback year). */
export function parseDate(raw: string, fallbackYear?: number): string | null {
  let m = raw.match(/\b(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})\b/);
  if (m) return iso(+m[1], +m[2], +m[3]);
  m = raw.match(/\b(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})\b/);
  if (m) return iso(+m[3], +m[2], +m[1]);
  m = raw.match(/\b(\d{1,2})\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})\b/);
  const month = m ? MONTHS[m[2].slice(0, 3).toLowerCase()] : undefined;
  if (m && month) return iso(+m[3], month, +m[1]);
  m = raw.match(/\b(\d{1,2})\s+([A-Za-z]{3})\b/);
  if (m && fallbackYear && MONTHS[m[2].toLowerCase()]) return iso(fallbackYear, MONTHS[m[2].toLowerCase()], +m[1]);
  return null;
}

function iso(y: number, m: number, d: number): string | null {
  if (m < 1 || m > 12 || d < 1 || d > 31 || y < 1900 || y > 2100) return null;
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

const lines = (text: string) => text.split(/\r?\n/).map((l) => l.replace(/\s+/g, ' ').trim()).filter(Boolean);

/** First amount that follows a label, on the same line. */
function amountAfter(text: string, label: RegExp): number | null {
  for (const line of lines(text)) {
    const m = line.match(label);
    if (!m || m.index === undefined) continue;
    const rest = line.slice(m.index + m[0].length);
    const a = rest.match(amountRe());
    if (a) return parseAmount(a[0]);
  }
  return null;
}

function valueAfter(text: string, label: RegExp): string | null {
  for (const line of lines(text)) {
    const m = line.match(label);
    if (m && m.index !== undefined) {
      const v = line.slice(m.index + m[0].length).replace(/^[\s:.-]+/, '').trim();
      if (v) return v;
    }
  }
  return null;
}

// ── Payslip ─────────────────────────────────────────────────────────────────

const DEDUCTION_LABELS =
  /\b(PAYE|UIF|SDL|Pension(?: fund)?|Provident(?: fund)?|Retirement annuity|Medical aid|Medical|Union(?: fees)?|Loan(?: repayment)?|Staff loan|Garnishee(?: order)?|Emolument attachment(?: order)?|EAO|Funeral(?: cover)?|Insurance)\b\s*:?\s*/gi;

export function readPayslip(text: string): PayslipData {
  const gross = amountAfter(text, /\b(gross\s*(pay|salary|earnings|income|remuneration)?|total\s*earnings)\b\s*:?/i);
  const net = amountAfter(text, /\b(net+\s*(pay|salary|income|amount)?|take[-\s]?home(\s*pay)?|amount\s*paid)\b\s*:?/i);
  const payDateRaw = valueAfter(text, /\b(pay\s*date|payment\s*date|date\s*paid)\b/i) ?? valueAfter(text, /\bperiod\s*(end(ing)?)?\b/i);

  const deductions: { description: string; amount: number }[] = [];
  for (const line of lines(text)) {
    for (const m of line.matchAll(DEDUCTION_LABELS)) {
      const after = line.slice((m.index ?? 0) + m[0].length);
      const a = after.match(new RegExp(`^(${AMOUNT})`));
      const amount = a ? parseAmount(a[1]) : null;
      if (amount !== null) deductions.push({ description: m[1], amount: Math.abs(amount) });
    }
  }

  const freqText = valueAfter(text, /\b(pay\s*)?frequency\b/i) ?? text;
  const pay_frequency = /\bfortnight/i.test(freqText) ? 'fortnightly' : /\bweekly\b/i.test(freqText) ? 'weekly' : 'monthly';

  const firstLine = lines(text)[0] ?? '';
  const employerLine = lines(text).find((l) => /\((pty|proprietary)\)\s*ltd|\blimited\b|\bltd\b|\binc\b|\bcc\b/i.test(l));

  return {
    document_matches_type: /pay\s*slip|payslip|salary\s*advice|remuneration\s*advice|net\s*pay|gross\s*(pay|salary)/i.test(text),
    legibility: gross !== null || net !== null ? 'clear' : 'partial',
    notes: NOTE,
    employee_name: valueAfter(text, /\b(employee(\s*name)?|name\s*of\s*employee)\b\s*:?/i),
    employee_id_number: (text.match(/\b\d{13}\b/) ?? [null])[0],
    employer_name: (employerLine ?? firstLine).replace(/\s*[-–]\s*pay\s*slip.*$/i, '').trim() || null,
    job_title: valueAfter(text, /\b(job\s*title|position|occupation|designation)\b\s*:?/i)?.split(/\s{2,}|\s+(pay|frequency)\b/i)[0] ?? null,
    pay_date: payDateRaw ? parseDate(payDateRaw) : null,
    pay_frequency,
    gross_pay: gross === null ? null : Math.abs(gross),
    net_pay: net === null ? null : Math.abs(net),
    deductions,
    garnishee_order: /garnish|emolument\s*attachment|\bEAO\b|court\s*order/i.test(text),
  };
}

// ── Bank statement ──────────────────────────────────────────────────────────

const INCOME_RE = /\b(salary|sal\b|wage|wages|payroll|pay\s*credit|remuneration|nett?\s*pay|stipend)\b/i;
const RENT_RE = /\b(rent|rentals?|lettings?|leasing|property\s*(mgmt|management)|estates?|realty|pam\s*golding|seeff|rawson|remax|re\/max|harcourts|chas\s*everitt|jawitz|tenant)\b/i;
const DEBT_RE = /\b(loan|finance|vehicle|vaf|credit\s*card|card\s*repay|home\s*loan|bond|wesbank|mfc|direct\s*axis|african\s*bank|capfin|fnb\s*loan|absa\s*loan|nedloan|edgars|jet\b|truworths|woolworths\s*card|foschini|tfg|rcs|lewis|ackermans|mr\s*price\s*money|homechoice|pep\s*money|finchoice)\b/i;
const GAMBLING_RE = /\b(bet|bets|betting|betway|hollywoodbets|supabets|sportingbet|lottostar|lotto|lottery|casino|sun\s*bet|tsogo|gbets|playabets|world\s*sports\s*betting)\b/i;
const RETURNED_RE = /\b(returned|unpaid|dishonou?red|insufficient\s*funds|rd\s*fee|reversal\s*of\s*debit|debit\s*order\s*return)\b/i;
/** Non-salary credits: business income, grants, maintenance, family support, cash deposits… */
const OTHER_INCOME_RE = /\b(deposit|cash\s*dep|dep\b|payment\s*from|pmt\s*from|received|inward|eft\s*credit|credit\s*transfer|magtape\s*credit|sassa|grant|maintenance|pension|annuity|dividend|interest\s*earned|rental\s*income|commission|allowance|bursary|freelance|invoice|client|tutoring|consulting)\b/i;
const NOT_INCOME_RE = /\b(fees?|charges?|refund|reversal|reversed|loan\s*(payout|advance|disbursement)|cashback)\b/i;
const TRANSFER_RE = /\b(transfer\s*(from|to)\s*(own|savings|cheque)|own\s*account|inter[-\s]?account)\b/i;

/** The date at the start of a transaction line, in any supported format. */
const DATE_PREFIX = /^\s*(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\.?(\s+\d{4})?)\s+/;

interface Txn {
  date: string;
  description: string;
  amount: number; // + credit, − debit
}

export function parseTransactions(text: string, fallbackYear: number): Txn[] {
  const out: Txn[] = [];
  for (const line of lines(text)) {
    const date = parseDate(line.slice(0, 16), fallbackYear);
    if (!date) continue;
    const amounts = [...line.matchAll(amountRe())];
    if (!amounts.length) continue;
    // With "amount balance" columns, the transaction amount is the first figure after the description.
    const first = amounts.find((a) => (a.index ?? 0) > 6) ?? amounts[0];
    let amount = parseAmount(first[0]);
    if (amount === null || amount === 0) continue;
    const description = line
      .slice(0, first.index)
      .replace(DATE_PREFIX, '')
      .replace(/\s+/g, ' ')
      .trim();
    const tail = line.slice((first.index ?? 0) + first[0].length, (first.index ?? 0) + first[0].length + 4);
    const explicitSign = /^\s*[-+]/.test(first[0]);
    if (/^\s*dr\b/i.test(tail)) amount = -Math.abs(amount);
    else if (/^\s*cr\b/i.test(tail)) amount = Math.abs(amount);
    else if (!explicitSign) amount = INCOME_RE.test(description) || (OTHER_INCOME_RE.test(description) && !/\b(fees?|charges?)\b/i.test(description)) ? Math.abs(amount) : -Math.abs(amount);
    out.push({ date, description: description || 'Transaction', amount });
  }
  return out;
}

function creditorName(description: string): string {
  return description.replace(/\b\d[\d\s/-]*\b/g, ' ').replace(/\s+/g, ' ').trim().split(' ').slice(0, 3).join(' ') || description;
}

export function readBankStatement(text: string): BankStatementData {
  const periodLine = valueAfter(text, /\b(statement\s*)?period\b\s*:?/i) ?? '';
  const periodDates = [...periodLine.matchAll(/(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{4}|\d{1,2}\s+[A-Za-z]{3,9}\s+\d{4})/g)]
    .map((m) => parseDate(m[0]))
    .filter((d): d is string => Boolean(d));
  const year = Number((periodDates[0] ?? text.match(/\b20\d{2}\b/)?.[0] ?? `${new Date().getFullYear()}`).slice(0, 4));

  const txns = parseTransactions(text, year);
  const dates = txns.map((t) => t.date).sort();
  const period_start = periodDates[0] ?? dates[0] ?? null;
  const period_end = periodDates[1] ?? dates[dates.length - 1] ?? null;

  const income_deposits = txns
    .filter((t) => t.amount > 0 && INCOME_RE.test(t.description) && !TRANSFER_RE.test(t.description))
    .map((t) => ({ date: t.date, description: t.description, amount: t.amount }));
  const other_credits = txns
    .filter((t) => t.amount > 0 && !INCOME_RE.test(t.description) && !TRANSFER_RE.test(t.description) && !NOT_INCOME_RE.test(t.description))
    .map((t) => ({ date: t.date, description: t.description, amount: t.amount }));
  const rent_payments = txns
    .filter((t) => t.amount < 0 && RENT_RE.test(t.description))
    .map((t) => ({ date: t.date, description: t.description, amount: Math.abs(t.amount) }));

  const debtByCreditor = new Map<string, number[]>();
  for (const t of txns) {
    if (t.amount < 0 && DEBT_RE.test(t.description) && !RENT_RE.test(t.description)) {
      const key = creditorName(t.description);
      debtByCreditor.set(key, [...(debtByCreditor.get(key) ?? []), Math.abs(t.amount)]);
    }
  }
  const months = new Set(txns.map((t) => t.date.slice(0, 7))).size || 1;
  const debt_repayments = [...debtByCreditor.entries()].map(([description, amounts]) => ({
    description,
    monthly_amount: Math.round((amounts.reduce((s, a) => s + a, 0) / months) * 100) / 100,
  }));

  const holderRaw = valueAfter(text, /\b(account\s*holder|account\s*name|name)\b\s*:?/i);
  const lowest = amountAfter(text, /\blowest\s*balance\b\s*:?/i);
  const closing = amountAfter(text, /\bclosing\s*balance\b\s*:?/i);
  const acct = text.match(/(?:account(?:\s*(?:no|number))?)\s*:?\s*[*x\d\s-]*?(\d{4})\b/i);

  return {
    document_matches_type: /statement/i.test(text) && /\b(balance|account)\b/i.test(text),
    legibility: txns.length > 0 ? 'clear' : 'partial',
    notes: txns.length ? NOTE : `${NOTE} No transaction lines could be recognised.`,
    account_holder: holderRaw ? holderRaw.replace(/\s+(account|acc)\b.*$/i, '').trim() : null,
    bank_name: (text.match(/\b(FNB|First National Bank|Absa|Standard Bank|Nedbank|Capitec|TymeBank|Discovery Bank|African Bank|Investec|Bidvest Bank)\b/i) ?? [null])[0],
    account_number_last4: acct ? acct[1] : null,
    period_start,
    period_end,
    income_deposits,
    other_credits,
    closing_balance: closing,
    lowest_balance: lowest,
    returned_debit_orders: txns.filter((t) => RETURNED_RE.test(t.description)).length,
    rent_payments,
    debt_repayments,
    gambling_transactions: txns.filter((t) => GAMBLING_RE.test(t.description)).length,
  };
}

// ── ID document ─────────────────────────────────────────────────────────────

export function readIdDocument(text: string): IdDocumentData {
  const idNumber = (text.match(/\b\d{13}\b/) ?? [null])[0];
  const dobRaw = valueAfter(text, /\b(date\s*of\s*birth|birth\s*date|DOB)\b\s*:?/i);
  const sexRaw = valueAfter(text, /\b(sex|gender)\b\s*:?/i);
  const expiryRaw = valueAfter(text, /\b(date\s*of\s*expiry|expiry(\s*date)?|valid\s*until)\b\s*:?/i);
  return {
    document_matches_type: /identity|smart\s*id|id\s*card|passport|republic\s*of\s*south\s*africa|driv(er|ing)'?s?\s*licen[cs]e/i.test(text),
    legibility: idNumber ? 'clear' : 'partial',
    notes: NOTE,
    document_kind: /passport/i.test(text) ? 'passport' : /smart\s*id|id\s*card/i.test(text) ? 'smart_id_card' : /licen[cs]e/i.test(text) ? 'drivers_licence' : /identity\s*document|id\s*book/i.test(text) ? 'green_id_book' : 'other',
    first_names: valueAfter(text, /\b(names|first\s*names?|forenames?|given\s*names?)\b\s*:?/i),
    surname: valueAfter(text, /\b(surname|last\s*name|family\s*name)\b\s*:?/i),
    id_number: idNumber,
    date_of_birth: dobRaw ? parseDate(dobRaw) : null,
    sex: sexRaw ? (/^m/i.test(sexRaw) ? 'M' : /^f/i.test(sexRaw) ? 'F' : null) : null,
    nationality: valueAfter(text, /\b(nationality|citizenship)\b\s*:?/i),
    expiry_date: expiryRaw ? parseDate(expiryRaw) : null,
  };
}

/** Reads a digital PDF with the built-in rules. */
export async function extractDocumentLocally<T extends BaseDocumentType>(
  documentType: T,
  bytes: ArrayBuffer | Buffer | Uint8Array
): Promise<ExtractedByType[T]> {
  const text = await pdfText(bytes);
  const readers: { [K in BaseDocumentType]: (t: string) => ExtractedByType[K] } = {
    payslip: readPayslip,
    bank_statement: readBankStatement,
    id_document: readIdDocument,
  };
  return readers[documentType](text) as ExtractedByType[T];
}
