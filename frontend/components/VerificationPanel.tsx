"use client";

import { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, CircleDashed, FileSearch, Keyboard, Loader2, RefreshCw, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { AffordabilityPanel, type AffordabilityAssessment } from "@/components/AffordabilityPanel";
import { ManualFiguresForm } from "@/components/ManualFiguresForm";
import { AiAnalystCard } from "@/components/AiAnalystCard";
import { DueDiligenceCard } from "@/components/DueDiligenceCard";

type CheckStatus = "pass" | "warn" | "fail" | "missing";

interface VerificationCheck {
  key: string;
  label: string;
  status: CheckStatus;
  detail: string;
}

type BaseType = "id_document" | "payslip" | "bank_statement";
type DocType = BaseType | `co_${BaseType}`;

interface ExtractionRow {
  document_type: DocType;
  status: "complete" | "failed";
  extracted: Record<string, unknown> | null;
  error: string | null;
  model?: string | null;
  created_at: string;
}

interface VerificationResponse {
  has_co_applicant?: boolean;
  uploaded: string[];
  assessment?: AffordabilityAssessment;
  extractions: Partial<Record<DocType, ExtractionRow>>;
  verification: {
    checks: VerificationCheck[];
    verified_monthly_income: number | null;
    income_source: "payslip" | "bank_statement" | null;
    co_applicant_verified_monthly_income: number | null;
    rent_to_income_pct: number | null;
  };
  skipped?: { document_type: string; reason: string }[];
}

const DOC_LABELS: Record<BaseType, string> = {
  id_document: "Identity document",
  payslip: "Payslip",
  bank_statement: "Bank statement",
};
const BASE_TYPES = Object.keys(DOC_LABELS) as BaseType[];

const docLabel = (type: string) =>
  type.startsWith("co_") ? `Co-applicant ${DOC_LABELS[type.slice(3) as BaseType]?.toLowerCase() ?? type}` : DOC_LABELS[type as BaseType] ?? type;

/** Fields worth showing a landlord at a glance, per document type. */
const SUMMARY_FIELDS: Record<BaseType, [string, string][]> = {
  id_document: [["first_names", "First names"], ["surname", "Surname"], ["id_number", "ID number"], ["date_of_birth", "Date of birth"], ["document_kind", "Type"]],
  payslip: [["employee_name", "Employee"], ["employer_name", "Employer"], ["pay_date", "Pay date"], ["gross_pay", "Gross pay"], ["net_pay", "Net pay"]],
  bank_statement: [["account_holder", "Account holder"], ["bank_name", "Bank"], ["period_start", "From"], ["period_end", "To"], ["closing_balance", "Closing balance"]],
};

const STATUS_STYLE: Record<CheckStatus, { icon: typeof CheckCircle2; className: string }> = {
  pass: { icon: CheckCircle2, className: "text-green-600 dark:text-green-400" },
  warn: { icon: AlertTriangle, className: "text-yellow-600 dark:text-yellow-400" },
  fail: { icon: XCircle, className: "text-red-600 dark:text-red-400" },
  missing: { icon: CircleDashed, className: "text-slate-400" },
};

const rand = (n: number) => `R${n.toLocaleString("en-ZA", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function formatValue(key: string, value: unknown): string {
  if (value === null || value === undefined || value === "") return "—";
  if (typeof value === "number" && /pay|balance/.test(key)) return rand(value);
  return String(value).replace(/_/g, " ");
}

/**
 * The system's affordability assessment and recommendation, plus the
 * evidence behind it: what was read from (or entered for) the applicant's
 * ID, payslip and bank statement, and how that compares to what they
 * declared. Shown to landlords/agents before they approve and create a lease.
 */
export function VerificationPanel({ applicationId }: { applicationId: string }) {
  const [data, setData] = useState<VerificationResponse | null>(null);
  const [showManual, setShowManual] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isRunning, setIsRunning] = useState(false);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/applications/${applicationId}/extract`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || "Could not load document checks.");
    setData(body);
  }, [applicationId]);

  useEffect(() => {
    setData(null);
    load();
  }, [load]);

  // Documents are read in the background right after the applicant submits.
  // While any uploaded document hasn't been read yet, refresh every few
  // seconds (for up to a minute) so the review never shows a stale gap.
  const pending = data ? data.uploaded.filter((t) => !data.extractions[t as DocType]).length : 0;
  const [polls, setPolls] = useState(0);
  useEffect(() => {
    if (!pending || polls >= 20) return;
    const timer = setTimeout(() => {
      setPolls((n) => n + 1);
      load();
    }, 3000);
    return () => clearTimeout(timer);
  }, [pending, polls, load]);

  const runChecks = async () => {
    setIsRunning(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${applicationId}/extract`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}",
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Document check failed.");
      setData(body);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Document check failed.");
    } finally {
      setIsRunning(false);
    }
  };

  const checks = data?.verification.checks ?? [];
  const counts = checks.reduce((acc, c) => ({ ...acc, [c.status]: (acc[c.status] ?? 0) + 1 }), {} as Partial<Record<CheckStatus, number>>);

  return (
    <div className="space-y-6">
      {data && <DueDiligenceCard applicationId={applicationId} refreshKey={data} />}
      {data?.assessment && <AffordabilityPanel assessment={data.assessment} />}
      {data && <AiAnalystCard applicationId={applicationId} />}

      {data && (
        showManual ? (
          <ManualFiguresForm
            applicationId={applicationId}
            hasCoApplicant={Boolean(data.has_co_applicant)}
            onSaved={(review) => { setData(review as VerificationResponse); setShowManual(false); }}
            onCancel={() => setShowManual(false)}
          />
        ) : (
          <button
            onClick={() => setShowManual(true)}
            className="inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors"
          >
            <Keyboard className="h-4 w-4" /> Enter payslip &amp; bank figures
          </button>
        )
      )}

      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-xl font-bold flex items-center gap-2">
            <FileSearch className="h-6 w-6 text-brand" /> Document verification
          </h3>
          <p className="text-sm text-muted-foreground">
            What was read from the applicant&apos;s payslip, bank statement and ID, and how it compares to what they declared. The assessment above is built from this.
          </p>
        </div>
        <button
          onClick={runChecks}
          disabled={isRunning || (data !== null && data.uploaded.length === 0)}
          className="shrink-0 inline-flex items-center gap-2 rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent transition-colors disabled:opacity-50"
        >
          {isRunning ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {isRunning ? "Reading documents…" : Object.keys(data?.extractions ?? {}).length ? "Re-read documents" : "Read documents & assess"}
        </button>
      </div>

      {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!data && !error && (
        <div className="flex justify-center py-8"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      )}

      {data && (
        <>
          {data.uploaded.length === 0 && (
            <p className="text-sm text-muted-foreground">The applicant hasn&apos;t uploaded any documents yet.</p>
          )}

          {data.skipped?.map((s) => (
            <p key={s.document_type} className="text-sm text-yellow-700 dark:text-yellow-300">
              {docLabel(s.document_type)}: {s.reason}
            </p>
          ))}

          <p className="text-sm font-medium space-x-3">
            <span className="text-green-600">{counts.pass ?? 0} checks pass</span>
            <span className="text-yellow-600">{counts.warn ?? 0} warn</span>
            <span className="text-red-600">{counts.fail ?? 0} fail</span>
          </p>

          <ul className="divide-y divide-border rounded-xl border border-border bg-white dark:bg-slate-900">
            {checks.map((check) => {
              const { icon: Icon, className } = STATUS_STYLE[check.status];
              return (
                <li key={check.key} className="flex gap-3 p-4">
                  <Icon className={cn("h-5 w-5 shrink-0 mt-0.5", className)} />
                  <div className="min-w-0">
                    <p className="font-semibold text-sm">{check.label}</p>
                    <p className="text-sm text-muted-foreground break-words">{check.detail}</p>
                  </div>
                </li>
              );
            })}
          </ul>

          <div className="grid gap-4 md:grid-cols-3">
            {(["", "co_"] as const)
              .filter((prefix) => prefix === "" || data.uploaded.some((t) => t.startsWith("co_")) || checks.some((c) => c.key.startsWith("co_")))
              .flatMap((prefix) => BASE_TYPES.map((base) => ({ type: `${prefix}${base}` as DocType, base })))
              .map(({ type, base }) => {
              const row = data.extractions[type];
              return (
                <div key={type} className="rounded-xl border border-border bg-white dark:bg-slate-900 p-4 text-sm">
                  <p className="font-bold mb-2 flex items-center justify-between gap-2">{docLabel(type)}{row?.model && <span className="text-[10px] uppercase tracking-wider font-bold text-brand bg-brand/10 rounded px-1.5 py-0.5">{row.model.startsWith("manual") ? "Entered manually" : row.model === "builtin-text-reader" ? "Read automatically" : "Read by AI"}</span>}</p>
                  {!data.uploaded.includes(type) && !row ? (
                    <p className="text-muted-foreground">Not uploaded</p>
                  ) : !row ? (
                    <p className="text-muted-foreground">Uploaded, not checked yet</p>
                  ) : row.status === "failed" ? (
                    <p className="text-red-600 dark:text-red-400">{row.error}</p>
                  ) : (
                    <dl className="space-y-1">
                      {SUMMARY_FIELDS[base].map(([key, label]) => (
                        <div key={key} className="flex justify-between gap-2">
                          <dt className="text-muted-foreground">{label}</dt>
                          <dd className="font-medium text-right break-all">{formatValue(key, row.extracted?.[key])}</dd>
                        </div>
                      ))}
                      {typeof row.extracted?.notes === "string" && (
                        <p className="pt-2 text-xs text-yellow-700 dark:text-yellow-300">{row.extracted.notes}</p>
                      )}
                    </dl>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
