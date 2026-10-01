"use client";

import Link from "next/link";
import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CreditCard, Loader2, Lock, ShieldCheck } from "lucide-react";
import { claimInvite, type ClaimedInvite } from "@/lib/invites";

function PayAdminFee() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get("invite");
  const cancelled = searchParams.get("cancelled") === "1";

  const [invite, setInvite] = useState<ClaimedInvite | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isPaying, setIsPaying] = useState(false);

  useEffect(() => {
    if (!token) {
      setError("This page needs an invite link from your agent or landlord.");
      return;
    }
    claimInvite(token).then(({ invite, error, unauthenticated }) => {
      if (unauthenticated) {
        const back = `/register/pay?invite=${encodeURIComponent(token)}`;
        router.replace(`/signin?redirect_to=${encodeURIComponent(back)}`);
        return;
      }
      if (error) return setError(error);
      if (invite?.status === "paid") {
        router.replace(`/register/payment-success?invite=${encodeURIComponent(token)}`);
        return;
      }
      setInvite(invite ?? null);
    });
  }, [token, router]);

  const handlePay = async () => {
    if (!token) return;
    setIsPaying(true);
    setError(null);

    try {
      const res = await fetch(`/api/invites/${encodeURIComponent(token)}/pay`, { method: "POST" });
      const data = await res.json();
      if (!res.ok || !data.processUrl) {
        throw new Error(data.error || "Failed to start the payment");
      }

      // PayFast requires a form POST, not a redirect with query params.
      const form = document.createElement("form");
      form.method = "POST";
      form.action = data.processUrl;
      for (const [key, value] of Object.entries(data.fields)) {
        const input = document.createElement("input");
        input.type = "hidden";
        input.name = key;
        input.value = String(value);
        form.appendChild(input);
      }
      document.body.appendChild(form);
      form.submit();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not start the payment");
      setIsPaying(false);
    }
  };

  return (
    <div className="container min-h-[calc(100vh-4rem)] flex flex-col items-center justify-center py-12 px-4">
      <div className="w-full max-w-md rounded-2xl border border-border bg-card p-8 shadow-lg">
        <h1 className="text-2xl font-bold tracking-tight mb-1">Pay your admin fee</h1>
        <p className="text-sm text-muted-foreground mb-6">
          Your agent or landlord charges a once-off admin fee to complete your registration.
        </p>

        {cancelled && (
          <div className="mb-6 rounded-lg border border-yellow-200 bg-yellow-50 p-3 text-sm text-yellow-800 dark:border-yellow-900/50 dark:bg-yellow-900/10 dark:text-yellow-200">
            Payment was cancelled. You can try again whenever you&apos;re ready.
          </div>
        )}

        {error && (
          <div className="mb-6 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-900/10 dark:text-red-300">
            {error}
          </div>
        )}

        {!invite && !error && (
          <div className="flex justify-center py-8">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        )}

        {invite && (
          <>
            <div className="rounded-lg bg-muted/50 p-4 mb-6 space-y-3 text-sm">
              {invite.property && (
                <div>
                  <p className="text-muted-foreground">Property</p>
                  <p className="font-medium">{invite.property.title}</p>
                  <p className="text-muted-foreground">{invite.property.address}</p>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-border pt-3">
                <span className="font-medium">Admin fee</span>
                <span className="text-lg font-bold">R{invite.admin_fee_amount.toFixed(2)}</span>
              </div>
            </div>

            <button
              onClick={handlePay}
              disabled={isPaying}
              className="w-full inline-flex h-11 items-center justify-center gap-2 rounded-md bg-brand px-6 text-sm font-medium text-white hover:bg-gold-600 transition-colors disabled:opacity-50"
            >
              {isPaying ? <Loader2 className="h-4 w-4 animate-spin" /> : <CreditCard className="h-4 w-4" />}
              Pay admin fee
            </button>

            <div className="mt-4 flex items-center justify-center gap-4 text-xs text-muted-foreground">
              <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> Secure checkout</span>
              <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Secure card payment</span>
            </div>
          </>
        )}

        <p className="mt-6 text-center text-xs text-muted-foreground">
          Questions about this fee? Contact the agent or landlord who invited you. <Link href="/" className="underline">Home</Link>
        </p>
      </div>
    </div>
  );
}

export default function RegisterPayPage() {
  return (
    <Suspense fallback={<div className="p-12 text-center">Loading...</div>}>
      <PayAdminFee />
    </Suspense>
  );
}
