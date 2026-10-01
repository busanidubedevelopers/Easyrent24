"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { XCircle, RefreshCw } from "lucide-react";

export default function EscrowCancelledPage() {
  const params = useParams();
  const jobId = params?.id as string | undefined;

  return (
    <div className="container min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12">
      <div className="mx-auto max-w-md text-center p-8 rounded-2xl border border-border bg-card shadow-lg">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-amber-100 text-amber-600 dark:bg-amber-950/50 dark:text-amber-400">
          <XCircle className="h-12 w-12" />
        </div>

        <h1 className="text-2xl font-bold tracking-tight mb-2">Escrow Funding Cancelled</h1>
        <p className="text-sm text-muted-foreground mb-6">
          The PayFast transaction was cancelled. No funds were charged, and the job has not been
          started yet.
        </p>

        <div className="flex flex-col gap-3">
          <Link
            href={`/handyman/job/${jobId}`}
            className="inline-flex h-10 items-center justify-center rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-gold-600 transition-colors"
          >
            <RefreshCw className="mr-2 h-4 w-4" /> Try Again
          </Link>
          <Link
            href="/handyman"
            className="inline-flex h-10 items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent transition-colors"
          >
            Back to Handyman Board
          </Link>
        </div>
      </div>
    </div>
  );
}
