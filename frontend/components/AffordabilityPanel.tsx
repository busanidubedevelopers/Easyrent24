"use client";

import { AlertTriangle, CheckCircle2, CircleHelp, ShieldAlert, ThumbsUp, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

export interface AffordabilityAssessment {
  recommendation: "approve" | "approve_with_conditions" | "decline" | "insufficient_information";
  score: number | null;
  headline: string;
  reasons: string[];
  conditions: string[];
  recommended_deposit_months: number;
  flags: { severity: "high" | "medium" | "positive"; text: string }[];
  figures: {
    proposed_rent: number | null;
    gross_income: number;
    net_income: number;
    income_basis: "verified" | "partly_verified" | "declared" | "none";
    current_rent: number | null;
    current_rent_source: "bank_statement" | "declared" | null;
    debt_repayments: number;
    living_costs: number;
    living_costs_source?: "declared" | "estimate";
    declared_expenses?: number | null;
    other_income_declared?: number;
    other_income_verified?: number;
    living_situation?: "renting" | "with_family" | "own_home" | "other" | null;
    disposable_after_rent: number | null;
    rent_to_gross_pct: number | null;
    rent_to_net_pct: number | null;
    debt_to_net_pct: number | null;
    rent_change_pct: number | null;
    max_affordable_rent: number;
  };
}

const VERDICT = {
  approve: { label: "Approve", icon: CheckCircle2, className: "bg-green-600 text-white", ring: "border-green-600/40 bg-green-50 dark:bg-green-950/30" },
  approve_with_conditions: { label: "Approve with conditions", icon: AlertTriangle, className: "bg-amber-500 text-white", ring: "border-amber-500/40 bg-amber-50 dark:bg-amber-950/30" },
  decline: { label: "Decline", icon: XCircle, className: "bg-red-600 text-white", ring: "border-red-600/40 bg-red-50 dark:bg-red-950/30" },
  insufficient_information: { label: "Need more information", icon: CircleHelp, className: "bg-slate-500 text-white", ring: "border-slate-400/40 bg-slate-50 dark:bg-slate-900" },
} as const;

const rand = (n: number | null | undefined) =>
  n === null || n === undefined ? "—" : `R${Math.round(n).toLocaleString("en-ZA")}`;

const BASIS: Record<AffordabilityAssessment["figures"]["income_basis"], string> = {
  verified: "from documents",
  partly_verified: "partly from documents",
  declared: "as declared — not verified",
  none: "no information",
};

function Figure({ label, value, hint, tone }: { label: string; value: string; hint?: string; tone?: "good" | "warn" | "bad" }) {
  return (
    <div className="rounded-lg border border-border bg-white dark:bg-slate-900 p-3">
      <p className="text-[11px] uppercase tracking-wider text-muted-foreground font-bold">{label}</p>
      <p className={cn(
        "text-lg font-black mt-0.5",
        tone === "good" && "text-green-600",
        tone === "warn" && "text-amber-600",
        tone === "bad" && "text-red-600",
      )}>{value}</p>
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

/**
 * The system's affordability assessment and recommendation for the
 * landlord/agent. Decision support: the figures and reasons are shown so the
 * recommendation can be checked, not just trusted.
 */
export function AffordabilityPanel({ assessment }: { assessment: AffordabilityAssessment }) {
  const v = VERDICT[assessment.recommendation];
  const f = assessment.figures;
  const r2g = f.rent_to_gross_pct;
  const Icon = v.icon;

  return (
    <section className={cn("rounded-2xl border-2 p-5 md:p-6 space-y-5", v.ring)} aria-label="Affordability assessment">
      <div className="flex flex-col sm:flex-row sm:items-start gap-4 justify-between">
        <div className="space-y-2 min-w-0">
          <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground">Affordability assessment</p>
          <span className={cn("inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-bold", v.className)}>
            <Icon className="h-4 w-4" /> {v.label}
          </span>
          <p className="text-base font-semibold">{assessment.headline}</p>
        </div>
        {assessment.score !== null && (
          <div className="shrink-0 text-center">
            <div className={cn(
              "h-20 w-20 rounded-full border-[6px] flex items-center justify-center text-2xl font-black bg-white dark:bg-slate-900",
              assessment.score >= 75 ? "border-green-500 text-green-600" : assessment.score >= 50 ? "border-amber-500 text-amber-600" : "border-red-500 text-red-600",
            )}>
              {assessment.score}
            </div>
            <p className="text-xs text-muted-foreground mt-1">score / 100</p>
          </div>
        )}
      </div>

      {assessment.conditions.length > 0 && (
        <div className="rounded-lg bg-white/70 dark:bg-slate-900/70 border border-border p-4">
          <p className="text-sm font-bold mb-2">Recommended conditions</p>
          <ul className="list-disc pl-5 space-y-1 text-sm">
            {assessment.conditions.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <Figure label="Rent asked" value={rand(f.proposed_rent)} hint="per month" />
        <Figure label="Gross income" value={rand(f.gross_income)} hint={BASIS[f.income_basis]} />
        <Figure label="Take-home" value={rand(f.net_income)} hint="per month" />
        <Figure
          label="Rent to income"
          value={r2g === null ? "—" : `${r2g}%`}
          hint="of gross · guideline 30%"
          tone={r2g === null ? undefined : r2g <= 30 ? "good" : r2g <= 40 ? "warn" : "bad"}
        />
        <Figure
          label="Current rent"
          value={rand(f.current_rent)}
          hint={
            f.current_rent_source === "bank_statement" ? "seen on bank statement"
            : f.current_rent_source === "declared" ? "as declared"
            : f.living_situation && f.living_situation !== "renting" ? "first-time renter"
            : "not renting / unknown"
          }
        />
        <Figure
          label="Living costs"
          value={rand(f.living_costs)}
          hint={f.living_costs_source === "declared" ? "declared by applicant" : f.declared_expenses ? "declared too low · estimated" : "estimated"}
          tone={f.living_costs_source === "declared" ? undefined : f.declared_expenses ? "warn" : undefined}
        />
        {(f.other_income_declared ?? 0) > 0 && (
          <Figure
            label="Other income"
            value={rand(f.other_income_verified)}
            hint={`of ${rand(f.other_income_declared)} declared · on statement`}
            tone={(f.other_income_verified ?? 0) >= (f.other_income_declared ?? 0) * 0.9 ? "good" : "warn"}
          />
        )}
        <Figure label="Debt repayments" value={rand(f.debt_repayments)} hint={f.debt_to_net_pct !== null ? `${f.debt_to_net_pct}% of take-home` : undefined} />
        <Figure
          label="Left after rent"
          value={rand(f.disposable_after_rent)}
          hint={`after debts + ${rand(f.living_costs)} living costs`}
          tone={f.disposable_after_rent === null ? undefined : f.disposable_after_rent < 0 ? "bad" : "good"}
        />
        <Figure label="Max affordable rent" value={rand(f.max_affordable_rent)} hint="per month" />
      </div>

      {assessment.flags.length > 0 && (
        <ul className="space-y-2">
          {assessment.flags.map((flag) => (
            <li key={flag.text} className="flex gap-2 text-sm">
              {flag.severity === "positive" ? (
                <ThumbsUp className="h-4 w-4 shrink-0 mt-0.5 text-green-600" />
              ) : flag.severity === "high" ? (
                <ShieldAlert className="h-4 w-4 shrink-0 mt-0.5 text-red-600" />
              ) : (
                <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
              )}
              <span>{flag.text}</span>
            </li>
          ))}
        </ul>
      )}

      {assessment.reasons.length > 0 && (
        <div className="text-sm text-muted-foreground space-y-1">
          {assessment.reasons.map((r) => <p key={r}>{r}</p>)}
        </div>
      )}

      <p className="text-xs text-muted-foreground">
        Living costs are estimated at 25% of take-home pay (at least R3 000 per adult). This is decision support — the final decision is yours.
      </p>
    </section>
  );
}
