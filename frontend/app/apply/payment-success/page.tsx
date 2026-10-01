"use client";

import Link from "next/link";
import { CheckCircle2, ArrowRight, Loader2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { isValidUUID } from "@/lib/validation";

// PayFast's own confirmation webhook (ITN) can't reach localhost during
// local development, so this return page does what the webhook normally
// would: confirm the payment succeeded (the fact that PayFast redirected
// here at all means it did) and mark the application paid. Same documented
// workaround already used for handyman escrow funding.
function SuccessContent() {
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("application_id");
  const [status, setStatus] = useState<"confirming" | "done" | "error">("confirming");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    // The generic /checkout demo page (unrelated to a specific application)
    // passes a placeholder ID here instead of a real application UUID —
    // nothing to confirm in that case, just show success as before.
    if (!applicationId || !isValidUUID(applicationId)) {
      setStatus("done");
      return;
    }

    async function confirmPayment() {
      try {
        const res = await fetch(`/api/applications/${applicationId}/confirm-payment`, {
          method: "POST",
          credentials: "include",
        });
        const data = await res.json();
        if (!res.ok) {
          throw new Error(data.error || "Failed to confirm payment.");
        }
        setStatus("done");
      } catch (err) {
        setErrorMessage(err instanceof Error ? err.message : "Something went wrong.");
        setStatus("error");
      }
    }

    confirmPayment();
  }, [applicationId]);

  return (
    <div className="container min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12">
      <div className="mx-auto max-w-md text-center p-8 rounded-2xl border border-border bg-card shadow-lg">
        {status === "confirming" && (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-blue-100 text-blue-600 dark:bg-blue-950/50 dark:text-blue-400">
              <Loader2 className="h-10 w-10 animate-spin" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Confirming Payment…</h1>
            <p className="text-sm text-muted-foreground">Finalizing your application fee.</p>
          </>
        )}

        {status === "done" && (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400">
              <CheckCircle2 className="h-12 w-12" />
            </div>

            <h1 className="text-2xl font-bold tracking-tight mb-2">Payment Successful!</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Your payment has been processed. Your application is now marked as paid
              and ready for the landlord to review.
            </p>

            {applicationId && (
              <div className="p-3 mb-6 rounded-lg bg-muted text-xs font-mono text-muted-foreground break-all">
                Application ID: {applicationId}
              </div>
            )}

            <div className="flex flex-col gap-3">
              <Link
                href="/dashboard"
                className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-gold-600 transition-colors"
              >
                Go to Dashboard <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
              <Link
                href="/"
                className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent transition-colors"
              >
                Back to Home
              </Link>
            </div>
          </>
        )}

        {status === "error" && (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
              <XCircle className="h-12 w-12" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Couldn&apos;t Confirm Payment</h1>
            <p className="text-sm text-muted-foreground mb-6">{errorMessage}</p>
            <Link
              href="/"
              className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent transition-colors"
            >
              Back to Home
            </Link>
          </>
        )}
      </div>
    </div>
  );
}

export default function PaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
