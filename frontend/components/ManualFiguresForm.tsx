"use client";

import { useState } from "react";
import { Loader2, Plus, Trash2 } from "lucide-react";

const inputClass =
  "w-full px-3 py-2 rounded-md border border-input bg-background text-sm focus:outline-none focus:ring-2 focus:ring-brand";

/**
 * Lets the landlord/agent type in figures from the applicant's payslip and
 * bank statement (walk-in clients, paper documents, unreadable scans). The
 * assessment is recalculated as soon as they are saved.
 */
export function ManualFiguresForm({
  applicationId,
  hasCoApplicant,
  onSaved,
  onCancel,
}: {
  applicationId: string;
  hasCoApplicant: boolean;
  onSaved: (review: unknown) => void;
  onCancel: () => void;
}) {
  const [person, setPerson] = useState<"applicant" | "co_applicant">("applicant");
  const [gross, setGross] = useState("");
  const [net, setNet] = useState("");
  const [payDate, setPayDate] = useState("");
  const [employer, setEmployer] = useState("");
  const [garnishee, setGarnishee] = useState(false);
  const [months, setMonths] = useState("3");
  const [income, setIncome] = useState("");
  const [rent, setRent] = useState("");
  const [debts, setDebts] = useState<{ description: string; amount: string }[]>([]);
  const [returned, setReturned] = useState("0");
  const [gambling, setGambling] = useState("0");
  const [lowest, setLowest] = useState("");
  const [nameConfirmed, setNameConfirmed] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const n = (v: string) => (v.trim() === "" ? null : Number(v));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const body: Record<string, unknown> = { person, name_confirmed: nameConfirmed };
    if (gross || net) {
      body.payslip = {
        gross_pay: n(gross) ?? 0,
        net_pay: n(net) ?? 0,
        pay_date: payDate || null,
        employer_name: employer || null,
        garnishee_order: garnishee,
      };
    }
    if (income) {
      body.bank = {
        months: Number(months) || 3,
        average_monthly_income: n(income) ?? 0,
        current_rent: n(rent),
        debt_repayments: debts
          .filter((d) => d.description.trim() && d.amount)
          .map((d) => ({ description: d.description.trim(), monthly_amount: Number(d.amount) })),
        returned_debit_orders: Number(returned) || 0,
        gambling_transactions: Number(gambling) || 0,
        lowest_balance: n(lowest),
      };
    }
    if (!body.payslip && !body.bank) {
      setError("Enter at least the payslip gross/net pay or the bank statement's average monthly income.");
      return;
    }

    setBusy(true);
    try {
      const res = await fetch(`/api/applications/${applicationId}/manual-figures`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = data.details ? Object.values(data.details as Record<string, string[]>).flat().join(" ") : "";
        throw new Error(details || data.error || "Could not save the figures.");
      }
      onSaved(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the figures.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="rounded-xl border border-border bg-white dark:bg-slate-900 p-5 space-y-5" aria-label="Enter figures manually">
      <div>
        <h4 className="font-bold">Enter figures from the documents</h4>
        <p className="text-sm text-muted-foreground">Use this for walk-in clients or documents that can&apos;t be read automatically. Amounts are monthly, in rand.</p>
      </div>

      {hasCoApplicant && (
        <label className="text-sm font-medium space-y-1 block">
          <span>Whose documents?</span>
          <select className={inputClass} value={person} onChange={(e) => setPerson(e.target.value as typeof person)}>
            <option value="applicant">Main applicant</option>
            <option value="co_applicant">Co-applicant</option>
          </select>
        </label>
      )}

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold mb-1">Payslip</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm space-y-1"><span>Gross pay (R)</span>
            <input aria-label="Gross pay" type="number" min="0" step="0.01" className={inputClass} value={gross} onChange={(e) => setGross(e.target.value)} />
          </label>
          <label className="text-sm space-y-1"><span>Net pay (R)</span>
            <input aria-label="Net pay" type="number" min="0" step="0.01" className={inputClass} value={net} onChange={(e) => setNet(e.target.value)} />
          </label>
          <label className="text-sm space-y-1"><span>Pay date</span>
            <input aria-label="Pay date" type="date" className={inputClass} value={payDate} onChange={(e) => setPayDate(e.target.value)} />
          </label>
          <label className="text-sm space-y-1"><span>Employer</span>
            <input aria-label="Employer" className={inputClass} value={employer} onChange={(e) => setEmployer(e.target.value)} />
          </label>
        </div>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={garnishee} onChange={(e) => setGarnishee(e.target.checked)} />
          Payslip shows a garnishee / emolument attachment order
        </label>
      </fieldset>

      <fieldset className="space-y-3">
        <legend className="text-sm font-bold mb-1">Bank statement</legend>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="text-sm space-y-1"><span>Average monthly income (R)</span>
            <input aria-label="Average monthly income" type="number" min="0" step="0.01" className={inputClass} value={income} onChange={(e) => setIncome(e.target.value)} />
          </label>
          <label className="text-sm space-y-1"><span>Months covered</span>
            <input aria-label="Months covered" type="number" min="1" max="12" className={inputClass} value={months} onChange={(e) => setMonths(e.target.value)} />
          </label>
          <label className="text-sm space-y-1"><span>Rent they pay now (R, if any)</span>
            <input aria-label="Current rent paid" type="number" min="0" step="0.01" className={inputClass} value={rent} onChange={(e) => setRent(e.target.value)} />
          </label>
          <label className="text-sm space-y-1"><span>Lowest balance (R, negative if overdrawn)</span>
            <input aria-label="Lowest balance" type="number" step="0.01" className={inputClass} value={lowest} onChange={(e) => setLowest(e.target.value)} />
          </label>
          <label className="text-sm space-y-1"><span>Returned debit orders</span>
            <input aria-label="Returned debit orders" type="number" min="0" className={inputClass} value={returned} onChange={(e) => setReturned(e.target.value)} />
          </label>
          <label className="text-sm space-y-1"><span>Gambling transactions</span>
            <input aria-label="Gambling transactions" type="number" min="0" className={inputClass} value={gambling} onChange={(e) => setGambling(e.target.value)} />
          </label>
        </div>

        <div className="space-y-2">
          <p className="text-sm">Debt repayments (loans, cards, vehicle finance, store accounts)</p>
          {debts.map((d, i) => (
            <div key={i} className="flex gap-2">
              <input aria-label={`Debt ${i + 1} creditor`} placeholder="e.g. WesBank vehicle finance" className={inputClass} value={d.description}
                onChange={(e) => setDebts((all) => all.map((x, j) => (j === i ? { ...x, description: e.target.value } : x)))} />
              <input aria-label={`Debt ${i + 1} monthly amount`} type="number" min="0" placeholder="R / month" className={`${inputClass} max-w-[9rem]`} value={d.amount}
                onChange={(e) => setDebts((all) => all.map((x, j) => (j === i ? { ...x, amount: e.target.value } : x)))} />
              <button type="button" aria-label="Remove debt" onClick={() => setDebts((all) => all.filter((_, j) => j !== i))} className="p-2 text-muted-foreground hover:text-red-600">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
          ))}
          <button type="button" onClick={() => setDebts((all) => [...all, { description: "", amount: "" }])} className="text-sm font-medium text-brand flex items-center gap-1">
            <Plus className="h-4 w-4" /> Add debt repayment
          </button>
        </div>
      </fieldset>

      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" className="mt-1" checked={nameConfirmed} onChange={(e) => setNameConfirmed(e.target.checked)} />
        <span>I checked that the name on these documents matches the applicant.</span>
      </label>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      <div className="flex justify-end gap-3">
        <button type="button" onClick={onCancel} className="px-4 py-2 rounded-md border border-input text-sm font-medium">Cancel</button>
        <button type="submit" disabled={busy} className="bg-brand text-white px-5 py-2 rounded-md text-sm font-medium flex items-center gap-2 disabled:opacity-50">
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          Save &amp; assess
        </button>
      </div>
    </form>
  );
}
