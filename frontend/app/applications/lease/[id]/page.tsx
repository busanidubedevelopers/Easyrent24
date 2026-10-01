"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, Check, CheckCircle2, ChevronDown, Download, FileSignature, Loader2, Mail, Pencil, Send } from "lucide-react";
import { cn } from "@/lib/utils";
import { LeaseDocumentView, type LeaseDocumentData } from "@/components/LeaseDocumentView";
import { LeaseSignForm } from "@/components/LeaseSignForm";
import { VerificationPanel } from "@/components/VerificationPanel";

type LeaseStatus = "draft" | "sent" | "tenant_signed" | "executed" | "cancelled";

interface Terms {
  monthly_rent: number;
  deposit: number;
  start_date: string;
  term_months: number;
  escalation_pct: number;
  rent_due_day: number;
  pets_allowed: boolean;
  utilities: "tenant_prepaid" | "tenant_metered" | "included";
  special_conditions: string | null;
}

interface LeaseRecord extends Terms {
  id: string;
  status: LeaseStatus;
  parties: { tenant: { name: string; email: string | null }; landlord: { name: string } };
  sent_at: string | null;
  tenant_signature: { signed_at: string } | null;
  executed_at: string | null;
}

interface AssessmentSummary {
  recommendation: "approve" | "approve_with_conditions" | "decline" | "insufficient_information";
  score: number | null;
  headline: string;
  conditions: string[];
  recommended_deposit_months: number;
}

const RECOMMENDATION_STYLE: Record<AssessmentSummary["recommendation"], { label: string; className: string }> = {
  approve: { label: "Approve", className: "border-green-300 bg-green-50 text-green-900 dark:border-green-900 dark:bg-green-950/40 dark:text-green-100" },
  approve_with_conditions: { label: "Approve with conditions", className: "border-amber-300 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-100" },
  decline: { label: "Decline", className: "border-red-300 bg-red-50 text-red-900 dark:border-red-900 dark:bg-red-950/40 dark:text-red-100" },
  insufficient_information: { label: "Need more information", className: "border-slate-300 bg-slate-50 text-slate-800 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100" },
};

interface PageData {
  assessment?: AssessmentSummary;
  application: { id: string; status: string; tenant_name: string };
  property: { id: string; title: string; address: string; price: number };
  lease: LeaseRecord | null;
  document: LeaseDocumentData | null;
  defaults: Terms;
}

const STEPS = [
  { title: "Set terms & send", description: "Approve the application and send the lease" },
  { title: "Tenant signature", description: "Tenant reviews and signs" },
  { title: "Countersign", description: "You sign to finalise" },
  { title: "Executed", description: "Signed PDF stored for both parties" },
];

const STEP_FOR: Record<LeaseStatus, number> = { draft: 0, sent: 1, tenant_signed: 2, executed: 3, cancelled: 0 };

const inputClass =
  "w-full px-3 py-2 rounded-md border border-input bg-background focus:outline-none focus:ring-2 focus:ring-brand";

function termsOf(source: Terms): Terms {
  return {
    monthly_rent: Number(source.monthly_rent),
    deposit: Number(source.deposit),
    start_date: source.start_date,
    term_months: Number(source.term_months),
    escalation_pct: Number(source.escalation_pct),
    rent_due_day: Number(source.rent_due_day),
    pets_allowed: source.pets_allowed,
    utilities: source.utilities,
    special_conditions: source.special_conditions,
  };
}

export default function LeaseWorkflowPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();

  const [data, setData] = useState<PageData | null>(null);
  const [terms, setTerms] = useState<Terms | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showChecks, setShowChecks] = useState(true);

  const load = useCallback(async () => {
    const res = await fetch(`/api/applications/${id}/lease`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || "Could not load this application.");
    setData(body);
    setTerms(termsOf(body.lease ?? body.defaults));
    setEditing(!body.lease || body.lease.status === "cancelled");
    setShowChecks(!body.lease || body.lease.status === "draft");
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const set = <K extends keyof Terms>(key: K, value: Terms[K]) => setTerms((t) => (t ? { ...t, [key]: value } : t));

  const saveDraft = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!terms) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/applications/${id}/lease`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...terms, special_conditions: terms.special_conditions || null }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) {
        const details = body.details ? Object.values(body.details as Record<string, string[]>).flat().join(" ") : "";
        throw new Error(details || body.error || "Could not save the lease.");
      }
      await load();
      setEditing(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the lease.");
    } finally {
      setBusy(false);
    }
  };

  const sendToTenant = async () => {
    if (!data?.lease) return;
    if (!confirm(`Approve ${data.application.tenant_name}'s application and send this lease for signature? The terms can't be changed after sending.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leases/${data.lease.id}/send`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not send the lease.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not send the lease.");
    } finally {
      setBusy(false);
    }
  };

  const cancelLease = async () => {
    if (!data?.lease) return;
    const signed = data.lease.status === "tenant_signed";
    if (!confirm(`Withdraw this lease?${signed ? " The tenant's signature will be voided." : ""} You can then edit the terms and issue a new one.`)) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/leases/${data.lease.id}/cancel`, { method: "POST" });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not withdraw the lease.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not withdraw the lease.");
    } finally {
      setBusy(false);
    }
  };

  if (!data || !terms) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        {error ? <p className="text-red-600">{error}</p> : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  const lease = data.lease;
  const status: LeaseStatus = lease?.status ?? "draft";
  const currentStep = STEP_FOR[status];
  const pdfHref = lease ? `/api/leases/${lease.id}/pdf` : null;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12">
      <div className="container max-w-6xl mx-auto px-4">
        <div className="flex items-center gap-4 mb-8">
          <button onClick={() => router.back()} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
            <ArrowLeft className="h-5 w-5" />
          </button>
          <div className="min-w-0">
            <h1 className="text-2xl font-bold">Lease: {data.application.tenant_name}</h1>
            <p className="text-muted-foreground truncate">{data.property.title} · {data.property.address}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          {/* Progress */}
          <div className="lg:col-span-4">
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-border p-6 shadow-sm">
              <h3 className="font-bold mb-6">Workflow status</h3>
              <div className="space-y-6">
                {STEPS.map((step, index) => {
                  const isActive = index === currentStep && status !== "executed";
                  const isCompleted = index < currentStep || status === "executed";
                  return (
                    <div key={step.title} className="relative flex gap-4">
                      {index !== STEPS.length - 1 && (
                        <div className={cn("absolute left-[15px] top-8 bottom-[-16px] w-0.5", isCompleted ? "bg-brand" : "bg-slate-200 dark:bg-slate-800")} />
                      )}
                      <div className={cn(
                        "h-8 w-8 rounded-full flex items-center justify-center shrink-0 z-10",
                        isActive ? "bg-brand text-white ring-4 ring-brand/20" : isCompleted ? "bg-brand text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                      )}>
                        {isCompleted ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{index + 1}</span>}
                      </div>
                      <div className={cn("pt-1", isActive || isCompleted ? "opacity-100" : "opacity-60")}>
                        <h4 className="font-semibold text-sm">{step.title}</h4>
                        <p className="text-xs text-muted-foreground">{step.description}</p>
                      </div>
                    </div>
                  );
                })}
              </div>
              {pdfHref && (
                <a href={pdfHref} className="mt-8 w-full inline-flex items-center justify-center gap-2 rounded-md border border-input px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:hover:bg-slate-800">
                  <Download className="h-4 w-4" /> {status === "executed" ? "Download signed PDF" : "Download draft PDF"}
                </a>
              )}
            </div>
          </div>

          {/* Action area */}
          <div className="lg:col-span-8 space-y-6">
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-300">{error}</div>
            )}

            <div className="bg-white dark:bg-slate-900 rounded-xl border border-border shadow-sm p-6 md:p-8">
              {(status === "draft" || status === "cancelled") && editing && data.assessment && (
                <div className={cn("mb-6 rounded-lg border p-4 text-sm space-y-1", RECOMMENDATION_STYLE[data.assessment.recommendation].className)}>
                  <p className="font-bold">
                    System recommendation: {RECOMMENDATION_STYLE[data.assessment.recommendation].label}
                    {data.assessment.score !== null && <> · score {data.assessment.score}/100</>}
                  </p>
                  <p>{data.assessment.headline}</p>
                  {data.assessment.conditions.length > 0 && (
                    <ul className="list-disc pl-5">{data.assessment.conditions.map((c) => <li key={c}>{c}</li>)}</ul>
                  )}
                  {data.assessment.recommended_deposit_months > 1 && !lease && (
                    <p className="font-medium">The deposit below is set to {data.assessment.recommended_deposit_months} months&apos; rent, as recommended.</p>
                  )}
                </div>
              )}

              {(status === "draft" || status === "cancelled") && editing && (
                <form onSubmit={saveDraft} className="space-y-5">
                  {status === "cancelled" && (
                    <div className="rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/10 dark:text-yellow-200">
                      The previous lease was withdrawn. Adjust the terms and generate a new lease to send.
                    </div>
                  )}
                  <h2 className="text-xl font-bold">Lease terms</h2>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <label className="text-sm font-medium space-y-1">
                      <span>Monthly rent (R)</span>
                      <input type="number" min="1" step="0.01" className={inputClass} value={terms.monthly_rent} onChange={(e) => set("monthly_rent", Number(e.target.value))} required />
                    </label>
                    <label className="text-sm font-medium space-y-1">
                      <span>Deposit (R)</span>
                      <input type="number" min="0" step="0.01" className={inputClass} value={terms.deposit} onChange={(e) => set("deposit", Number(e.target.value))} required />
                    </label>
                    <label className="text-sm font-medium space-y-1">
                      <span>Start date</span>
                      <input type="date" className={inputClass} value={terms.start_date} onChange={(e) => set("start_date", e.target.value)} required />
                    </label>
                    <label className="text-sm font-medium space-y-1">
                      <span>Term (months)</span>
                      <input type="number" min="1" max="60" className={inputClass} value={terms.term_months} onChange={(e) => set("term_months", Number(e.target.value))} required />
                    </label>
                    <label className="text-sm font-medium space-y-1">
                      <span>Annual escalation (%)</span>
                      <input type="number" min="0" max="25" step="0.5" className={inputClass} value={terms.escalation_pct} onChange={(e) => set("escalation_pct", Number(e.target.value))} required />
                    </label>
                    <label className="text-sm font-medium space-y-1">
                      <span>Rent due on day</span>
                      <input type="number" min="1" max="28" className={inputClass} value={terms.rent_due_day} onChange={(e) => set("rent_due_day", Number(e.target.value))} required />
                    </label>
                    <label className="text-sm font-medium space-y-1">
                      <span>Utilities</span>
                      <select className={inputClass} value={terms.utilities} onChange={(e) => set("utilities", e.target.value as Terms["utilities"])}>
                        <option value="tenant_prepaid">Prepaid meters, tenant buys</option>
                        <option value="tenant_metered">Metered, billed to tenant</option>
                        <option value="included">Included in rent</option>
                      </select>
                    </label>
                    <label className="text-sm font-medium flex items-center gap-3 pt-6">
                      <input type="checkbox" checked={terms.pets_allowed} onChange={(e) => set("pets_allowed", e.target.checked)} />
                      <span>Pets allowed</span>
                    </label>
                  </div>
                  <label className="text-sm font-medium space-y-1 block">
                    <span>Special conditions (optional)</span>
                    <textarea
                      rows={3}
                      maxLength={2000}
                      className={inputClass}
                      value={terms.special_conditions ?? ""}
                      onChange={(e) => set("special_conditions", e.target.value)}
                      placeholder="e.g. One parking bay (no. 14) is included."
                    />
                  </label>
                  <div className="flex justify-end gap-3 pt-4 border-t border-border">
                    {lease && status === "draft" && (
                      <button type="button" onClick={() => { setTerms(termsOf(lease)); setEditing(false); }} className="px-4 py-2 rounded-md border border-input text-sm font-medium">
                        Cancel
                      </button>
                    )}
                    <button type="submit" disabled={busy} className="bg-brand text-white px-6 py-2 rounded-md font-medium flex items-center gap-2 hover:bg-gold-600 disabled:opacity-50">
                      {busy && <Loader2 className="h-4 w-4 animate-spin" />}
                      Generate lease
                    </button>
                  </div>
                </form>
              )}

              {status === "draft" && !editing && data.document && (
                <div className="space-y-4">
                  <div className="flex items-center justify-between gap-4">
                    <h2 className="text-xl font-bold">Review lease</h2>
                    <button onClick={() => setEditing(true)} className="text-sm font-medium text-brand flex items-center gap-1">
                      <Pencil className="h-4 w-4" /> Edit terms
                    </button>
                  </div>
                  <LeaseDocumentView document={data.document} />
                  <div className="flex justify-end pt-4 border-t border-border">
                    <button onClick={sendToTenant} disabled={busy} className="bg-brand text-white px-6 py-3 rounded-md font-medium flex items-center gap-2 hover:bg-gold-600 disabled:opacity-50">
                      {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                      Approve & send to tenant
                    </button>
                  </div>
                </div>
              )}

              {status === "sent" && lease && (
                <div className="text-center py-8">
                  <div className="h-16 w-16 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 mx-auto mb-4">
                    <Mail className="h-8 w-8" />
                  </div>
                  <h2 className="text-xl font-bold mb-2">Waiting for the tenant to sign</h2>
                  <p className="text-muted-foreground max-w-md mx-auto">
                    {lease.parties.tenant.name} has been notified in the app. They can review and sign at the link below — share it with them if needed.
                  </p>
                  <p className="mt-4 text-sm font-mono break-all bg-slate-50 dark:bg-slate-950 border border-border rounded p-2">
                    {typeof window !== "undefined" ? `${window.location.origin}/leases/${lease.id}` : `/leases/${lease.id}`}
                  </p>
                  <button onClick={cancelLease} disabled={busy} className="mt-6 text-sm font-medium text-red-600 hover:underline disabled:opacity-50">
                    Withdraw lease
                  </button>
                </div>
              )}

              {status === "tenant_signed" && lease && (
                <div className="space-y-6">
                  <h2 className="text-xl font-bold">Countersign the lease</h2>
                  <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900 rounded-lg text-sm text-green-800 dark:text-green-200">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    {lease.parties.tenant.name} signed on {lease.tenant_signature ? new Date(lease.tenant_signature.signed_at).toLocaleString() : "—"}.
                  </div>
                  {data.document && <LeaseDocumentView document={data.document} />}
                  <LeaseSignForm leaseId={lease.id} expectedName={lease.parties.landlord.name} onSigned={load} submitLabel="Sign & finalise" />
                  <button onClick={cancelLease} disabled={busy} className="text-sm font-medium text-red-600 hover:underline disabled:opacity-50">
                    Withdraw lease instead
                  </button>
                </div>
              )}

              {status === "executed" && lease && (
                <div className="text-center py-8">
                  <div className="h-20 w-20 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 mx-auto mb-4">
                    <FileSignature className="h-10 w-10" />
                  </div>
                  <h2 className="text-2xl font-bold mb-2">Lease executed</h2>
                  <p className="text-muted-foreground max-w-md mx-auto mb-6">
                    Signed by both parties on {lease.executed_at ? new Date(lease.executed_at).toLocaleDateString() : "—"}. The signed PDF is stored and available to you and the tenant.
                  </p>
                  <a href={pdfHref!} className="inline-flex items-center gap-2 bg-brand text-white px-6 py-3 rounded-md font-medium hover:bg-gold-600">
                    <Download className="h-4 w-4" /> Download signed PDF
                  </a>
                </div>
              )}
            </div>

            {/* Due diligence evidence, shown before the decision */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-border shadow-sm">
              <button onClick={() => setShowChecks((v) => !v)} className="w-full flex items-center justify-between p-6 text-left font-bold">
                Applicant document checks
                <ChevronDown className={cn("h-5 w-5 transition-transform", showChecks && "rotate-180")} />
              </button>
              {showChecks && (
                <div className="px-6 pb-6">
                  <VerificationPanel applicationId={data.application.id} />
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
