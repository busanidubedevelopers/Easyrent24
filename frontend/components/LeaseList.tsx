"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Download, File, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface LeaseSummary {
  id: string;
  application_id: string;
  role: "landlord" | "tenant";
  status: "draft" | "sent" | "tenant_signed" | "executed" | "cancelled";
  monthly_rent: number;
  start_date: string;
  end_date: string;
  property: { title: string; address: string };
  tenant_name: string;
  landlord_name: string;
}

const STATUS: Record<LeaseSummary["status"], { label: string; className: string }> = {
  draft: { label: "Draft", className: "bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300" },
  sent: { label: "Awaiting tenant", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300" },
  tenant_signed: { label: "Awaiting countersign", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-200" },
  executed: { label: "Active", className: "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300" },
  cancelled: { label: "Withdrawn", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300" },
};

const EXPIRY_WARNING_DAYS = 60;

const rand = (n: number) => `R${n.toLocaleString("en-ZA", { maximumFractionDigits: 2 })}`;

function daysUntil(isoDate: string): number {
  return Math.ceil((new Date(`${isoDate}T23:59:59`).getTime() - Date.now()) / 86_400_000);
}

/**
 * Every lease the signed-in user is party to, with its status and PDF. Used
 * by the tenant's "My Lease" page and the landlord's documents vault.
 */
export function LeaseList({ emptyMessage }: { emptyMessage: React.ReactNode }) {
  const [leases, setLeases] = useState<LeaseSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/leases")
      .then(async (res) => {
        const body = await res.json().catch(() => ({}));
        if (!res.ok) throw new Error(body.error || "Could not load leases.");
        setLeases(body.leases);
      })
      .catch((err: Error) => setError(err.message));
  }, []);

  if (error) return <p className="text-sm text-red-600 dark:text-red-400">{error}</p>;
  if (!leases) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  if (leases.length === 0) return <div className="text-center text-muted-foreground py-12">{emptyMessage}</div>;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
      {leases.map((lease) => {
        const days = daysUntil(lease.end_date);
        const expiring = lease.status === "executed" && days >= 0 && days <= EXPIRY_WARNING_DAYS;
        const ended = lease.status === "executed" && days < 0;
        const badge = ended ? { label: "Ended", className: STATUS.draft.className } : STATUS[lease.status];
        const href = lease.role === "landlord" ? `/applications/lease/${lease.application_id}` : `/leases/${lease.id}`;

        return (
          <div key={lease.id} className="bg-white dark:bg-slate-900 rounded-xl border border-border p-6 shadow-sm relative overflow-hidden flex flex-col">
            {expiring && (
              <div className="absolute top-0 right-0 bg-orange-500 text-white text-[10px] font-bold px-3 py-1 rounded-bl-lg">
                EXPIRES IN {days} DAYS
              </div>
            )}
            <div className="flex items-start justify-between mb-4 gap-2">
              <div className="h-10 w-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 flex items-center justify-center text-indigo-600 shrink-0">
                <File className="h-5 w-5" />
              </div>
              <span className={cn("text-xs font-medium px-2.5 py-1 rounded-full", badge.className)}>{badge.label}</span>
            </div>

            <h3 className="font-bold text-lg mb-1 truncate">{lease.role === "landlord" ? lease.tenant_name : lease.property.title}</h3>
            <p className="text-sm text-muted-foreground mb-4 truncate">
              {lease.role === "landlord" ? lease.property.title : lease.property.address}
            </p>

            <dl className="space-y-2 mb-6 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Rent</dt><dd className="font-medium">{rand(lease.monthly_rent)} / month</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Period</dt><dd className="font-medium">{lease.start_date} → {lease.end_date}</dd></div>
              {lease.role === "tenant" && (
                <div className="flex justify-between"><dt className="text-muted-foreground">Landlord</dt><dd className="font-medium truncate ml-2">{lease.landlord_name}</dd></div>
              )}
            </dl>

            <div className="flex gap-2 mt-auto">
              <Link href={href} className="flex-1 bg-brand text-white py-2 rounded-md text-sm font-medium hover:bg-brand/90 transition-colors text-center">
                {lease.role === "tenant" && lease.status === "sent" ? "Review & sign" : "Open"}
              </Link>
              {lease.status !== "cancelled" && (
                <a href={`/api/leases/${lease.id}/pdf`} className="flex-1 bg-slate-100 dark:bg-slate-800 py-2 rounded-md text-sm font-medium hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors flex items-center justify-center gap-2">
                  <Download className="h-3 w-3" /> PDF
                </a>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
