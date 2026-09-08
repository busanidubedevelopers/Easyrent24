"use client";

import Link from "next/link";
import { CheckCircle2, ArrowRight } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense } from "react";

function SuccessContent() {
  const searchParams = useSearchParams();
  const applicationId = searchParams.get("application_id");

  return (
    <div className="container min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12">
      <div className="mx-auto max-w-md text-center p-8 rounded-2xl border border-border bg-card shadow-lg">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400">
          <CheckCircle2 className="h-12 w-12" />
        </div>
        
        <h1 className="text-2xl font-bold tracking-tight mb-2">Payment Successful!</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your payment via PayFast has been processed. Your application is now marked as paid.
        </p>

        {applicationId && (
          <div className="p-3 mb-6 rounded-lg bg-muted text-xs font-mono text-muted-foreground break-all">
            Application ID: {applicationId}
          </div>
        )}

        <div className="flex flex-col gap-3">
          <Link
            href="/dashboard"
            className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
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
