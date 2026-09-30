"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Bot, CheckCircle2, HelpCircle, Loader2, ShieldAlert, Sparkles, ThumbsUp } from "lucide-react";
import { cn } from "@/lib/utils";

interface AnalystReport {
  summary: string;
  income_stability: "stable" | "variable" | "unclear";
  income_notes: string;
  spending_breakdown: { category: string; monthly_amount: number }[];
  additional_risks: { severity: "high" | "medium" | "low"; finding: string; evidence: string }[];
  positive_indicators: string[];
  agrees_with_assessment: boolean;
  assessment_comment: string;
  questions_for_applicant: string[];
}

interface ReportRow {
  status: "complete" | "failed";
  report: AnalystReport | null;
  error: string | null;
  created_at: string;
}

const rand = (n: number) => `R${Math.round(n).toLocaleString("en-ZA")}`;
const CATEGORY: Record<string, string> = {
  rent: "Rent", debt_repayments: "Debt repayments", groceries: "Groceries", transport: "Transport",
  insurance: "Insurance", school_and_childcare: "School & childcare", utilities_and_airtime: "Utilities & airtime",
  entertainment: "Entertainment", gambling: "Gambling", cash_withdrawals: "Cash withdrawals", transfers_out: "Transfers out", other: "Other",
};

/**
 * Claude's analyst report on the applicant's finances: a second opinion on
 * top of the rule-based assessment, requested by the landlord/agent.
 */
export function AiAnalystCard({ applicationId }: { applicationId: string }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [row, setRow] = useState<ReportRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/applications/${applicationId}/ai-report`);
    const body = await res.json().catch(() => ({}));
    if (res.ok) {
      setConfigured(body.configured);
      setRow(body.latest);
    }
  }, [applicationId]);

  useEffect(() => {
    load();
  }, [load]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/ai-report`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (body.latest) setRow(body.latest);
      if (!res.ok && !body.latest) throw new Error(body.error || "The AI analyst could not run.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "The AI analyst could not run.");
    } finally {
      setBusy(false);
    }
  };

  if (configured === null) return null;
  const report = row?.status === "complete" ? row.report : null;

  return (
    <section className="rounded-2xl border border-border bg-white dark:bg-slate-900 p-5 md:p-6 space-y-4" aria-label="AI analyst">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h4 className="font-bold flex items-center gap-2"><Bot className="h-5 w-5 text-brand" /> AI analyst</h4>
          <p className="text-sm text-muted-foreground">
            {configured
              ? "Claude reads the full payslip and bank statements and gives a second opinion on the assessment above."
              : "Not set up yet — add ANTHROPIC_API_KEY to .env and restart EasyRent to switch on the AI analyst."}
          </p>
        </div>
        {configured && (
          <button
            onClick={run}
            disabled={busy}
            className="shrink-0 inline-flex items-center gap-2 rounded-md bg-brand text-white px-4 py-2 text-sm font-medium hover:bg-brand/90 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />}
            {busy ? "Claude is reading the documents…" : report ? "Ask again" : "Ask the AI analyst"}
          </button>
        )}
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}
      {row?.status === "failed" && <p className="text-sm text-red-600 dark:text-red-400">{row.error}</p>}

      {report && (
        <div className="space-y-4 text-sm">
          <p className="text-base">{report.summary}</p>

          <div className={cn(
            "flex items-start gap-2 rounded-lg p-3",
            report.agrees_with_assessment ? "bg-green-50 text-green-900 dark:bg-green-950/40 dark:text-green-100" : "bg-amber-50 text-amber-900 dark:bg-amber-950/40 dark:text-amber-100"
          )}>
            {report.agrees_with_assessment ? <CheckCircle2 className="h-4 w-4 mt-0.5 shrink-0" /> : <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />}
            <p><strong>{report.agrees_with_assessment ? "Agrees with the assessment." : "Disagrees with the assessment."}</strong> {report.assessment_comment}</p>
          </div>

          <p><strong>Income:</strong> {report.income_stability} — {report.income_notes}</p>

          {report.spending_breakdown.length > 0 && (
            <div>
              <p className="font-bold mb-1">Where the money goes (per month)</p>
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-1">
                {report.spending_breakdown.map((s) => (
                  <li key={s.category} className="flex justify-between border-b border-border/60 py-0.5">
                    <span>{CATEGORY[s.category] ?? s.category}</span><span className="font-medium">{rand(s.monthly_amount)}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.additional_risks.length > 0 && (
            <div>
              <p className="font-bold mb-1">Risks the rules may have missed</p>
              <ul className="space-y-2">
                {report.additional_risks.map((r) => (
                  <li key={r.finding} className="flex gap-2">
                    <ShieldAlert className={cn("h-4 w-4 shrink-0 mt-0.5", r.severity === "high" ? "text-red-600" : r.severity === "medium" ? "text-amber-600" : "text-slate-500")} />
                    <span><strong>{r.finding}</strong> <span className="text-muted-foreground">{r.evidence}</span></span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {report.positive_indicators.length > 0 && (
            <ul className="space-y-1">
              {report.positive_indicators.map((p) => (
                <li key={p} className="flex gap-2"><ThumbsUp className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />{p}</li>
              ))}
            </ul>
          )}

          {report.questions_for_applicant.length > 0 && (
            <div>
              <p className="font-bold mb-1">Ask the applicant</p>
              <ul className="space-y-1">
                {report.questions_for_applicant.map((q) => (
                  <li key={q} className="flex gap-2"><HelpCircle className="h-4 w-4 shrink-0 mt-0.5 text-brand" />{q}</li>
                ))}
              </ul>
            </div>
          )}

          <p className="text-xs text-muted-foreground">Report from {new Date(row!.created_at).toLocaleString()}. AI advice — the decision is yours.</p>
        </div>
      )}
    </section>
  );
}
