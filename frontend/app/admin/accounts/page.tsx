"use client";

import { useCallback, useEffect, useState } from "react";
import { CheckCircle2, Clock, Loader2, ShieldCheck, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";

type Status = "pending" | "approved" | "rejected";

interface Account {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  account_type: "landlord" | "agent" | null;
  approval_status: Status;
  created_at: string;
  approved_at: string | null;
  rejection_reason: string | null;
  approved_by_name: string | null;
  property_count: number;
}

const TABS: { key: Status; label: string; icon: typeof Clock }[] = [
  { key: "pending", label: "Awaiting approval", icon: Clock },
  { key: "approved", label: "Approved", icon: CheckCircle2 },
  { key: "rejected", label: "Rejected", icon: XCircle },
];

const date = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString("en-ZA", { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";

/**
 * Super admin: every landlord and agent account must be approved here
 * before it can sign in. Tenants don't need approval.
 */
export default function AccountApprovalsPage() {
  const [status, setStatus] = useState<Status>("pending");
  const [accounts, setAccounts] = useState<Account[] | null>(null);
  const [counts, setCounts] = useState<Record<Status, number>>({ pending: 0, approved: 0, rejected: 0 });
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [rejecting, setRejecting] = useState<{ id: string; reason: string } | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    const res = await fetch(`/api/admin/accounts?status=${status}`);
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || "Could not load accounts.");
    setAccounts(body.accounts);
    setCounts(body.counts);
  }, [status]);

  useEffect(() => {
    setAccounts(null);
    load();
  }, [load]);

  const decide = async (account: Account, action: "approve" | "reject", reason?: string) => {
    setBusyId(account.id);
    setError(null);
    setNotice(null);
    try {
      const res = await fetch(`/api/admin/accounts/${account.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action, reason }),
      });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body.error || "Could not save the decision.");
      setRejecting(null);
      setNotice(`${account.full_name || account.email} ${action === "approve" ? "approved — they can sign in now" : "rejected"}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save the decision.");
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="container max-w-5xl py-10">
      <div className="mb-6">
        <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
          <ShieldCheck className="h-8 w-8 text-brand" /> Account approvals
        </h1>
        <p className="text-muted-foreground mt-1">
          Every landlord and agent must be approved before they can sign in, list properties or invite tenants. Tenants sign up without approval.
        </p>
      </div>

      <div className="flex gap-2 mb-6 border-b border-border">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setStatus(key)}
            className={cn(
              "flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 -mb-px transition-colors",
              status === key ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:text-foreground"
            )}
          >
            <Icon className="h-4 w-4" /> {label}
            <span className="rounded-full bg-muted px-2 py-0.5 text-xs">{counts[key]}</span>
          </button>
        ))}
      </div>

      {notice && <p className="mb-4 rounded-lg bg-green-50 dark:bg-green-950/40 text-green-800 dark:text-green-200 px-4 py-3 text-sm" data-testid="approval-notice">{notice}</p>}
      {error && <p className="mb-4 text-sm text-red-600 dark:text-red-400">{error}</p>}

      {!accounts ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : accounts.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          {status === "pending" ? "No accounts are waiting for approval." : `No ${status} accounts.`}
        </p>
      ) : (
        <ul className="divide-y divide-border rounded-xl border border-border bg-card">
          {accounts.map((a) => (
            <li key={a.id} className="p-5" data-testid="account-row">
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="font-semibold flex items-center gap-2">
                    {a.full_name || "(no name)"}
                    <span className="text-[10px] uppercase tracking-wider font-bold text-brand bg-brand/10 rounded px-1.5 py-0.5">
                      {a.account_type === "agent" ? "Agent" : "Landlord"}
                    </span>
                  </p>
                  <p className="text-sm text-muted-foreground break-all">{a.email}{a.phone ? ` · ${a.phone}` : ""}</p>
                  <p className="text-xs text-muted-foreground mt-1">
                    Signed up {date(a.created_at)} · {a.property_count} propert{a.property_count === 1 ? "y" : "ies"}
                    {a.approval_status === "approved" && ` · approved ${date(a.approved_at)}${a.approved_by_name ? ` by ${a.approved_by_name}` : ""}`}
                  </p>
                  {a.approval_status === "rejected" && a.rejection_reason && (
                    <p className="text-xs text-red-600 dark:text-red-400 mt-1">Reason: {a.rejection_reason}</p>
                  )}
                </div>

                <div className="flex shrink-0 gap-2">
                  {a.approval_status !== "approved" && (
                    <button
                      onClick={() => decide(a, "approve")}
                      disabled={busyId === a.id}
                      className="inline-flex items-center gap-1 rounded-md bg-green-600 px-4 py-2 text-sm font-medium text-white hover:bg-green-700 disabled:opacity-50"
                    >
                      {busyId === a.id ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />} Approve
                    </button>
                  )}
                  {a.approval_status !== "rejected" && (
                    <button
                      onClick={() => setRejecting({ id: a.id, reason: "" })}
                      disabled={busyId === a.id}
                      className="inline-flex items-center gap-1 rounded-md border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 dark:text-red-300 dark:hover:bg-red-950/40 disabled:opacity-50"
                    >
                      <XCircle className="h-4 w-4" /> {a.approval_status === "approved" ? "Revoke" : "Reject"}
                    </button>
                  )}
                </div>
              </div>

              {rejecting?.id === a.id && (
                <div className="mt-4 flex flex-col sm:flex-row gap-2">
                  <input
                    autoFocus
                    value={rejecting.reason}
                    onChange={(e) => setRejecting({ id: a.id, reason: e.target.value })}
                    placeholder="Reason (shown to the applicant), e.g. could not verify EAAB/PPRA registration"
                    className="flex-1 h-10 rounded-md border border-input bg-background px-3 text-sm"
                  />
                  <button
                    onClick={() => decide(a, "reject", rejecting.reason)}
                    disabled={!rejecting.reason.trim() || busyId === a.id}
                    className="rounded-md bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-700 disabled:opacity-50"
                  >
                    Confirm
                  </button>
                  <button onClick={() => setRejecting(null)} className="rounded-md px-4 py-2 text-sm text-muted-foreground hover:text-foreground">
                    Cancel
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
