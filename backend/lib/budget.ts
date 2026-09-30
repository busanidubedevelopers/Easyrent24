// ============================================================================
// Tenant budget: what the applicant spends every month, what other income
// they have besides a salary, and where they live now. Shared by the
// application form, the API and the affordability assessment.
// ============================================================================

export const EXPENSE_CATEGORIES = [
  { key: 'groceries', label: 'Groceries & household goods' },
  { key: 'utilities', label: 'Water & electricity' },
  { key: 'transport', label: 'Transport & fuel' },
  { key: 'phone_internet', label: 'Cellphone & internet' },
  { key: 'insurance', label: 'Insurance (car, life, funeral)' },
  { key: 'medical', label: 'Medical aid & healthcare' },
  { key: 'education', label: 'School fees & childcare' },
  { key: 'dependants', label: 'Support for family & dependants' },
  { key: 'clothing', label: 'Clothing & personal care' },
  { key: 'entertainment', label: 'Entertainment & eating out' },
  { key: 'subscriptions', label: 'Subscriptions (TV, streaming, gym)' },
  { key: 'domestic', label: 'Domestic worker & garden services' },
  { key: 'debt', label: 'Loan, store & credit card repayments' },
  { key: 'savings', label: 'Savings & investments' },
  { key: 'other', label: 'Other regular expenses' },
] as const;

export type ExpenseCategory = (typeof EXPENSE_CATEGORIES)[number]['key'];
export type MonthlyExpenses = Partial<Record<ExpenseCategory, number>>;

/**
 * Categories that aren't day-to-day living costs: debt is assessed on its
 * own (against what the bank statement shows), and savings can be paused.
 */
const NON_LIVING: ExpenseCategory[] = ['debt', 'savings'];

export const INCOME_SOURCES = [
  { key: 'business', label: 'Own business / freelance work' },
  { key: 'rental_income', label: 'Rental income' },
  { key: 'maintenance', label: 'Maintenance received' },
  { key: 'family_support', label: 'Support from family' },
  { key: 'grant', label: 'SASSA grant' },
  { key: 'pension', label: 'Pension / annuity' },
  { key: 'investment', label: 'Investment income' },
  { key: 'bursary', label: 'Bursary / stipend' },
  { key: 'other', label: 'Other income' },
] as const;

export type IncomeSource = (typeof INCOME_SOURCES)[number]['key'];

export interface OtherIncome {
  source: IncomeSource;
  description?: string | null;
  amount: number;
}

export const LIVING_SITUATIONS = [
  { key: 'renting', label: 'I rent where I live now' },
  { key: 'with_family', label: 'I live with family / at home (no rent)' },
  { key: 'own_home', label: 'I own my home' },
  { key: 'other', label: 'Other (e.g. student residence, employer housing)' },
] as const;

export type LivingSituation = (typeof LIVING_SITUATIONS)[number]['key'];

const EXPENSE_KEYS = new Set<string>(EXPENSE_CATEGORIES.map((c) => c.key));
const SOURCE_KEYS = new Set<string>(INCOME_SOURCES.map((s) => s.key));
const SITUATION_KEYS = new Set<string>(LIVING_SITUATIONS.map((s) => s.key));
const MAX_AMOUNT = 10_000_000;

const round2 = (n: number) => Math.round(n * 100) / 100;

export function expenseLabel(key: string): string {
  return EXPENSE_CATEGORIES.find((c) => c.key === key)?.label ?? key;
}

export function incomeSourceLabel(key: string): string {
  return INCOME_SOURCES.find((s) => s.key === key)?.label ?? key;
}

/** Monthly living costs: all declared expenses except debt repayments and savings. */
export function livingExpensesTotal(expenses: MonthlyExpenses | null | undefined): number {
  if (!expenses) return 0;
  return round2(
    Object.entries(expenses)
      .filter(([k]) => !NON_LIVING.includes(k as ExpenseCategory))
      .reduce((s, [, v]) => s + (Number(v) || 0), 0)
  );
}

export function expensesTotal(expenses: MonthlyExpenses | null | undefined): number {
  if (!expenses) return 0;
  return round2(Object.values(expenses).reduce((s, v) => s + (Number(v) || 0), 0));
}

export function otherIncomeTotal(income: OtherIncome[] | null | undefined): number {
  return round2((income ?? []).reduce((s, i) => s + (Number(i.amount) || 0), 0));
}

/**
 * Cleans what the form sent: keeps known categories with positive amounts.
 * Returns the cleaned value plus any errors, so the API can reject bad input.
 */
export function parseMonthlyExpenses(raw: unknown): { value: MonthlyExpenses | null; errors: string[] } {
  if (raw === undefined || raw === null) return { value: null, errors: [] };
  if (typeof raw !== 'object' || Array.isArray(raw)) return { value: null, errors: ['Monthly expenses must be a list of amounts.'] };
  const value: MonthlyExpenses = {};
  const errors: string[] = [];
  for (const [key, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!EXPENSE_KEYS.has(key)) {
      errors.push(`Unknown expense category "${key}".`);
      continue;
    }
    if (v === '' || v === null || v === undefined) continue;
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0 || n > MAX_AMOUNT) {
      errors.push(`${expenseLabel(key)} must be an amount between R0 and R${MAX_AMOUNT.toLocaleString('en-ZA')}.`);
      continue;
    }
    if (n > 0) value[key as ExpenseCategory] = round2(n);
  }
  return { value, errors };
}

export function parseOtherIncome(raw: unknown): { value: OtherIncome[] | null; errors: string[] } {
  if (raw === undefined || raw === null) return { value: null, errors: [] };
  if (!Array.isArray(raw)) return { value: null, errors: ['Other income must be a list.'] };
  if (raw.length > 10) return { value: null, errors: ['List at most 10 other income sources.'] };
  const value: OtherIncome[] = [];
  const errors: string[] = [];
  for (const item of raw) {
    const row = (item ?? {}) as Record<string, unknown>;
    const source = String(row.source ?? '');
    const amount = Number(row.amount);
    const description = typeof row.description === 'string' ? row.description.trim().slice(0, 120) : '';
    if (!SOURCE_KEYS.has(source)) {
      errors.push(`Unknown income source "${source}".`);
    } else if (!Number.isFinite(amount) || amount <= 0 || amount > MAX_AMOUNT) {
      errors.push(`${incomeSourceLabel(source)}: enter the monthly amount.`);
    } else {
      value.push({ source: source as IncomeSource, description: description || null, amount: round2(amount) });
    }
  }
  return { value, errors };
}

export function parseLivingSituation(raw: unknown): { value: LivingSituation | null; errors: string[] } {
  if (raw === undefined || raw === null || raw === '') return { value: null, errors: [] };
  return SITUATION_KEYS.has(String(raw))
    ? { value: raw as LivingSituation, errors: [] }
    : { value: null, errors: ['Choose where you live now.'] };
}
