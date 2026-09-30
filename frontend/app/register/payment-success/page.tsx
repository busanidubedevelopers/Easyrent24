"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import { ArrowRight, CheckCircle2, Loader2 } from "lucide-react";
import { claimInvite, type ClaimedInvite } from "@/lib/invites";

const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 10;

function SuccessContent() {
  const token = useSearchParams().get("invite");
  const [invite, setInvite] = useState<ClaimedInvite | null>(null);
  const [gaveUp, setGaveUp] = useState(false);

  // PayFast redirects the tenant back here before (or around the same time
  // as) its ITN reaches our webhook, so the invite may not be 'paid' yet.
  useEffect(() => {
    if (!token) return;
    let polls = 0;
    let timer: ReturnType<typeof setTimeout>;
    let stopped = false;

    // In sandbox/demo mode PayFast's ITN can't reach localhost; confirm off
    // the redirect instead (the server refuses this outside sandbox mode).
    let confirmed = false;
    const check = async () => {
      if (!confirmed) {
        confirmed = true;
        await fetch(`/api/invites/${encodeURIComponent(token)}/confirm-payment`, { method: "POST" }).catch(() => null);
      }
      const { invite } = await claimInvite(token);
      if (stopped) return;
      if (invite) setInvite(invite);
      if (invite?.status === "paid") return;
      if (++polls >= MAX_POLLS) return setGaveUp(true);
      timer = setTimeout(check, POLL_INTERVAL_MS);
    };
    check();

    return () => {
      stopped = true;
      clearTimeout(timer);
    };
  }, [token]);

  const paid = invite?.status === "paid";
  const applyHref = invite?.property_id
    ? `/apply?ref=${invite.property_id}&title=${encodeURIComponent(invite.property?.title ?? "")}&address=${encodeURIComponent(invite.property?.address ?? "")}`
    : "/apply";

  return (
    <div className="container min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12 px-4">
      <div className="mx-auto w-full max-w-md text-center p-8 rounded-2xl border border-border bg-card shadow-lg">
        {paid ? (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-full bg-green-100 text-green-600 dark:bg-green-950/50 dark:text-green-400">
              <CheckCircle2 className="h-12 w-12" />
            </div>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Registration complete</h1>
            <p className="text-sm text-muted-foreground mb-6">
              Your admin fee of R{invite.admin_fee_amount.toFixed(2)} has been received. You can now complete your rental application.
            </p>
            <Link
              href={applyHref}
              className="inline-flex h-10 w-full items-center justify-center rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-brand/90 transition-colors"
            >
              Start your application <ArrowRight className="ml-2 h-4 w-4" />
            </Link>
          </>
        ) : gaveUp ? (
          <>
            <h1 className="text-2xl font-bold tracking-tight mb-2">Still confirming your payment</h1>
            <p className="text-sm text-muted-foreground mb-6">
              The payment gateway hasn&apos;t confirmed your payment yet. This usually takes a minute. Refresh this page shortly, or contact your agent or landlord if it doesn&apos;t update.
            </p>
            <button
              onClick={() => window.location.reload()}
              className="inline-flex h-10 w-full items-center justify-center rounded-md border border-input bg-background px-6 text-sm font-medium hover:bg-accent transition-colors"
            >
              Refresh
            </button>
          </>
        ) : (
          <>
            <Loader2 className="mx-auto mb-6 h-10 w-10 animate-spin text-muted-foreground" />
            <h1 className="text-2xl font-bold tracking-tight mb-2">Confirming your payment…</h1>
            <p className="text-sm text-muted-foreground">Confirming your admin fee payment.</p>
          </>
        )}
      </div>
    </div>
  );
}

export default function RegisterPaymentSuccessPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center">Loading...</div>}>
      <SuccessContent />
    </Suspense>
  );
}
