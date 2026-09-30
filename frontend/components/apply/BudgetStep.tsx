"use client";

import { Plus, Trash2 } from "lucide-react";
import { EXPENSE_CATEGORIES, INCOME_SOURCES, LIVING_SITUATIONS } from "@backend/lib/budget";
import type { BudgetIncomeRow } from "@/store/useApplyStore";

const inputClass =
  "flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

const rand = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
const sum = (values: string[]) => values.reduce((s, v) => s + (Number(v) || 0), 0);

interface Props {
  livingSituation: string;
  currentRent: string;
  otherIncome: BudgetIncomeRow[];
  expenses: Record<string, string>;
  onChange: (patch: { livingSituation?: string; currentRent?: string; otherIncome?: BudgetIncomeRow[]; expenses?: Record<string, string> }) => void;
}

/**
 * Application step: where the applicant lives now, income besides their
 * salary, and their recurring monthly expenses. The affordability
 * assessment uses the declared expenses, and counts other income only
 * where the bank statement shows it.
 */
export function BudgetStep({ livingSituation, currentRent, otherIncome, expenses, onChange }: Props) {
  const expensesTotal = sum(Object.values(expenses));
  const otherTotal = sum(otherIncome.map((r) => r.amount));

  const setIncome = (i: number, patch: Partial<BudgetIncomeRow>) =>
    onChange({ otherIncome: otherIncome.map((row, j) => (j === i ? { ...row, ...patch } : row)) });

  return (
    <div className="space-y-8 animate-in fade-in slide-in-from-right-4 duration-300">
      <div className="space-y-1">
        <h2 className="text-xl font-semibold">Your Monthly Budget</h2>
        <p className="text-sm text-muted-foreground">
          Helps the landlord see that the rent fits your budget. Be realistic: figures are checked against your payslip and bank statement.
        </p>
      </div>

      {/* Where you live now */}
      <section className="space-y-3">
        <label htmlFor="livingSituation" className="text-sm font-medium leading-none">Where do you live now?</label>
        <select
          id="livingSituation"
          value={livingSituation}
          onChange={(e) => onChange({ livingSituation: e.target.value, ...(e.target.value !== "renting" ? { currentRent: "" } : {}) })}
          className={`${inputClass} bg-background`}
        >
          <option value="" disabled>Select</option>
          {LIVING_SITUATIONS.map((s) => (
            <option key={s.key} value={s.key}>{s.label}</option>
          ))}
        </select>
        {livingSituation === "renting" && (
          <div className="space-y-2">
            <label htmlFor="currentRent" className="text-sm font-medium leading-none">Current monthly rent</label>
            <div className="relative">
              <span className="absolute left-3 top-3 text-sm text-muted-foreground">R</span>
              <input id="currentRent" type="number" min="0" value={currentRent} onChange={(e) => onChange({ currentRent: e.target.value })} className={`${inputClass} px-7`} placeholder="0.00" />
            </div>
            <p className="text-[0.8rem] text-muted-foreground">Shows the landlord you already manage a similar rent.</p>
          </div>
        )}
        {livingSituation && livingSituation !== "renting" && (
          <p className="text-[0.8rem] text-muted-foreground">
            No problem if you haven&apos;t rented before: you&apos;ll be assessed on the income shown on your payslip and bank statement.
          </p>
        )}
      </section>

      {/* Other income */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Other monthly income (besides your salary)</h3>
          <p className="text-[0.8rem] text-muted-foreground">
            E.g. a side business, rental income, maintenance or support from family. It must show as deposits on your bank statement to count.
          </p>
        </div>
        {otherIncome.map((row, i) => (
          <div key={i} className="grid gap-2 md:grid-cols-[1fr_1fr_10rem_auto] items-start" data-testid="other-income-row">
            <select aria-label="Income source" value={row.source} onChange={(e) => setIncome(i, { source: e.target.value })} className={`${inputClass} bg-background`}>
              <option value="" disabled>Source</option>
              {INCOME_SOURCES.map((s) => (
                <option key={s.key} value={s.key}>{s.label}</option>
              ))}
            </select>
            <input aria-label="Description" value={row.description} onChange={(e) => setIncome(i, { description: e.target.value })} className={inputClass} placeholder="Description (optional)" />
            <div className="relative">
              <span className="absolute left-3 top-3 text-sm text-muted-foreground">R</span>
              <input aria-label="Monthly amount" type="number" min="0" value={row.amount} onChange={(e) => setIncome(i, { amount: e.target.value })} className={`${inputClass} px-7`} placeholder="per month" />
            </div>
            <button type="button" aria-label="Remove income source" onClick={() => onChange({ otherIncome: otherIncome.filter((_, j) => j !== i) })} className="h-10 px-2 text-muted-foreground hover:text-red-600">
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange({ otherIncome: [...otherIncome, { source: "", description: "", amount: "" }] })}
          className="inline-flex items-center gap-1 text-sm font-medium text-brand hover:underline"
        >
          <Plus className="h-4 w-4" /> Add other income
        </button>
        {otherTotal > 0 && <p className="text-sm">Other income: <strong>{rand(otherTotal)}</strong> per month</p>}
      </section>

      {/* Expenses */}
      <section className="space-y-3">
        <div>
          <h3 className="text-sm font-medium">Recurring monthly expenses</h3>
          <p className="text-[0.8rem] text-muted-foreground">Leave empty what doesn&apos;t apply. Don&apos;t include your current rent.</p>
        </div>
        <div className="grid gap-4 md:grid-cols-2">
          {EXPENSE_CATEGORIES.map((c) => (
            <div key={c.key} className="space-y-1">
              <label htmlFor={`expense-${c.key}`} className="text-xs font-medium text-muted-foreground">{c.label}</label>
              <div className="relative">
                <span className="absolute left-3 top-3 text-sm text-muted-foreground">R</span>
                <input
                  id={`expense-${c.key}`}
                  type="number"
                  min="0"
                  value={expenses[c.key] ?? ""}
                  onChange={(e) => onChange({ expenses: { ...expenses, [c.key]: e.target.value } })}
                  className={`${inputClass} px-7`}
                  placeholder="0"
                />
              </div>
            </div>
          ))}
        </div>
        <p className="text-sm rounded-lg bg-muted/60 px-4 py-3">
          Total monthly expenses: <strong data-testid="expenses-total">{rand(expensesTotal)}</strong>
        </p>
      </section>
    </div>
  );
}
