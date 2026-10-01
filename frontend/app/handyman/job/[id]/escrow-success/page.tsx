"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import { CheckCircle2, Loader2, XCircle, ArrowRight } from "lucide-react";

// PayFast's own confirmation webhook (ITN) can't reach localhost during
// local development, so this return page does what the webhook normally
// would: confirm the payment succeeded (the fact that PayFast redirected
// here at all means it did) and create the held escrow_transactions row.
// Same documented workaround already used for application fee payments.
export default function EscrowSuccessPage() {
  const params = useParams();
  const jobId = params?.id as string | undefined;
  const [status, setStatus] = useState<"confirming" | "done" | "error">("confirming");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!jobId) return;

    async function confirmEscrow() {
      try {
        const res = await fetch(`/api/handyman/jobs/${jobId}/escrow/confirm`, {
          method: "POST",
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to confirm escrow funding.");
        }
        setStatus("done");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("error");
      }
    }

    confirmEscrow();
  }, [jobId]);

  return (
    <div className="container min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12">
      <div className="mx-auto max-w-md text-center p-8 rounded-2xl border border-border bg-card shadow-lg">
        {status === "confirming" && (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Loader2 className="h-10 w-10 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Confirming Escrow…</h1>
            <p className="text-sm text-muted-foreground">Securing the funds for this job.</p>
          </>
        )}

        {status === "done" && (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Escrow Funded!</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Payment via PayFast was successful. Funds are now held securely and released to the
              handyman once you approve the completed work.
            </p>
            <Link
              href={`/handyman/job/${jobId}`}
              className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-gold-600 transition-colors"
            >
              Back to Job <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <XCircle className="h-12 w-12" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Couldn&apos;t Confirm Escrow</h1>
            <p className="text-sm text-muted-foreground mb-6">{errorMessage}</p>
            <Link
              href={`/handyman/job/${jobId}`}
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent transition-colors"
            >
              Back to Job
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
