"use client";

import { useCallback, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { CheckCircle2, Clock, Download, FileSignature, Loader2 } from "lucide-react";
import { LeaseDocumentView, type LeaseDocumentData } from "@/components/LeaseDocumentView";
import { LeaseSignForm } from "@/components/LeaseSignForm";

interface LeaseResponse {
  lease: {
    id: string;
    application_id: string;
    status: "draft" | "sent" | "tenant_signed" | "executed" | "cancelled";
    parties: { tenant: { name: string }; landlord: { name: string }; property: { title: string; address: string } };
    tenant_signature: { signed_at: string } | null;
    executed_at: string | null;
  };
  document: LeaseDocumentData;
  role: "landlord" | "tenant" | "admin";
  can_sign: boolean;
}

/**
 * Where the tenant reviews, signs and downloads their lease. Landlords
 * landing here are sent to their own workflow page.
 */
export default function TenantLeasePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [data, setData] = useState<LeaseResponse | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await fetch(`/api/leases/${id}`);
    if (res.status === 401) {
      router.replace(`/signin?redirect_to=${encodeURIComponent(`/leases/${id}`)}`);
      return;
    }
    const body = await res.json().catch(() => ({}));
    if (!res.ok) return setError(body.error || "Could not load this lease.");
    if (body.role === "landlord") {
      router.replace(`/applications/lease/${body.lease.application_id}`);
      return;
    }
    setData(body);
  }, [id, router]);

  useEffect(() => {
    load();
  }, [load]);

  if (!data) {
    return (
      <div className="min-h-screen flex items-center justify-center p-8 text-center">
        {error ? <p className="text-red-600">{error}</p> : <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />}
      </div>
    );
  }

  const { lease, document } = data;
  const pdfHref = `/api/leases/${lease.id}/pdf`;

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12">
      <div className="container max-w-3xl mx-auto px-4 space-y-6">
        <div>
          <h1 className="text-2xl font-bold">Your lease</h1>
          <p className="text-muted-foreground">{lease.parties.property.title} · {lease.parties.property.address}</p>
        </div>

        {lease.status === "cancelled" && (
          <div className="p-4 rounded-lg border border-red-200 bg-red-50 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-300">
            This lease was withdrawn by {lease.parties.landlord.name} and can no longer be signed. Any signature on it is void. If a revised lease is issued, you&apos;ll be notified.
          </div>
        )}

        {lease.status === "tenant_signed" && (
          <div className="flex items-center gap-3 p-4 rounded-lg border border-blue-200 bg-blue-50 text-sm text-blue-800 dark:border-blue-900/50 dark:bg-blue-900/10 dark:text-blue-200">
            <Clock className="h-5 w-5 shrink-0" />
            You signed on {lease.tenant_signature ? new Date(lease.tenant_signature.signed_at).toLocaleString() : "—"}. Waiting for {lease.parties.landlord.name} to countersign.
          </div>
        )}

        {lease.status === "executed" && (
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-lg border border-green-200 bg-green-50 text-sm text-green-800 dark:border-green-900/50 dark:bg-green-900/10 dark:text-green-200">
            <span className="flex items-center gap-3">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              Signed by both parties on {lease.executed_at ? new Date(lease.executed_at).toLocaleDateString() : "—"}.
            </span>
            <a href={pdfHref} className="inline-flex items-center gap-2 bg-green-700 text-white px-4 py-2 rounded-md font-medium hover:bg-green-800">
              <Download className="h-4 w-4" /> Download signed lease
            </a>
          </div>
        )}

        <div className="bg-white dark:bg-slate-900 rounded-xl border border-border shadow-sm p-6 md:p-8 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <h2 className="font-bold flex items-center gap-2"><FileSignature className="h-5 w-5 text-brand" /> Lease agreement</h2>
            {lease.status !== "executed" && lease.status !== "cancelled" && (
              <a href={pdfHref} className="text-sm font-medium text-brand flex items-center gap-1"><Download className="h-4 w-4" /> PDF</a>
            )}
          </div>
          <LeaseDocumentView document={document} />

          {data.can_sign && (
            <div className="pt-6 border-t border-border">
              <LeaseSignForm leaseId={lease.id} expectedName={lease.parties.tenant.name} onSigned={load} />
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
