"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronDown, CircleDashed, ClipboardCheck, Download, Loader2, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "passed" | "attention" | "failed" | "outstanding";

interface Section {
  key: string;
  title: string;
  status: Status;
  summary: string;
  items: { label: string; status: Status; detail: string }[];
}

interface DueDiligence {
  reference: string;
  overall: Status;
  overall_summary: string;
  sections: Section[];
}

const STYLE: Record<Status, { label: string; icon: typeof CheckCircle2; text: string; tile: string }> = {
  passed: { label: "Passed", icon: CheckCircle2, text: "text-green-600", tile: "border-green-200 bg-green-50/60 dark:border-green-900 dark:bg-green-950/30" },
  attention: { label: "Needs attention", icon: AlertTriangle, text: "text-amber-600", tile: "border-amber-200 bg-amber-50/60 dark:border-amber-900 dark:bg-amber-950/30" },
  failed: { label: "Failed", icon: XCircle, text: "text-red-600", tile: "border-red-200 bg-red-50/60 dark:border-red-900 dark:bg-red-950/30" },
  outstanding: { label: "Outstanding", icon: CircleDashed, text: "text-slate-500", tile: "border-border bg-slate-50 dark:bg-slate-900" },
};

/**
 * The application's due diligence at a glance: identity, income, bank
 * conduct, affordability, documents and fees, each with its evidence — and
 * the printable report for the file or the property owner.
 */
export function DueDiligenceCard({ applicationId, refreshKey }: { applicationId: string; refreshKey?: unknown }) {
  const [dd, setDd] = useState<DueDiligence | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/applications/${applicationId}/due-diligence`)
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load due diligence.");
        if (!cancelled) setDd(body);
      })
      .catch((err: Error) => !cancelled && setError(err.message));
    return () => {
      cancelled = true;
    };
  }, [applicationId, refreshKey]);

  if (error) return <p className="text-sm text-red-600">{error}</p>;
  if (!dd) return <div className="flex justify-center py-6"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;

  const overall = STYLE[dd.overall];
  const OverallIcon = overall.icon;
  const openSection = dd.sections.find((s) => s.key === open);

  return (
    <section className="rounded-2xl border-2 border-brand/30 bg-white dark:bg-slate-900 p-5 md:p-6 space-y-5" aria-label="Due diligence">
      <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
        <div className="space-y-1">
          <p className="text-xs uppercase tracking-widest font-bold text-muted-foreground flex items-center gap-2">
            <ClipboardCheck className="h-4 w-4 text-brand" /> Due diligence · {dd.reference}
          </p>
          <p className={cn("text-xl font-black flex items-center gap-2", overall.text)}>
            <OverallIcon className="h-6 w-6" /> {overall.label}
          </p>
          <p className="text-sm">{dd.overall_summary}</p>
        </div>
        <a
          href={`/api/applications/${applicationId}/due-diligence/pdf`}
          className="shrink-0 inline-flex items-center gap-2 rounded-md bg-brand text-white px-4 py-2 text-sm font-medium hover:bg-gold-600"
        >
          <Download className="h-4 w-4" /> Download due diligence report
        </a>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {dd.sections.map((s) => {
          const st = STYLE[s.status];
          const Icon = st.icon;
          return (
            <button
              key={s.key}
              onClick={() => setOpen(open === s.key ? null : s.key)}
              className={cn("text-left rounded-xl border p-3 transition-shadow hover:shadow-md", st.tile, open === s.key && "ring-2 ring-brand")}
              aria-expanded={open === s.key}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="font-bold text-sm">{s.title}</span>
                <Icon className={cn("h-5 w-5 shrink-0", st.text)} />
              </span>
              <span className={cn("block text-xs font-semibold mt-1", st.text)}>{st.label}</span>
              <span className="block text-xs text-muted-foreground mt-1 line-clamp-2">{s.summary}</span>
            </button>
          );
        })}
      </div>

      {openSection && (
        <div className="rounded-xl border border-border p-4">
          <p className="font-bold mb-3 flex items-center gap-2"><ChevronDown className="h-4 w-4" /> {openSection.title}</p>
          <ul className="space-y-2">
            {openSection.items.map((item, i) => {
              const st = STYLE[item.status];
              const Icon = st.icon;
              return (
                <li key={i} className="flex gap-2 text-sm">
                  <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", st.text)} />
                  <span><strong>{item.label}:</strong> {item.detail}</span>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </section>
  );
}
