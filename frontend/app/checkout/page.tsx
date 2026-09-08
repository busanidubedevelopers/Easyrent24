"use client";

import { useState, useEffect } from "react";
import { CreditCard, Lock, ShieldCheck, ExternalLink, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabaseClient";

export default function CheckoutPage() {
  const [isLoading, setIsLoading] = useState(false);
  const [userEmail, setUserEmail] = useState("demo@easyrent.com");

  useEffect(() => {
    supabase.auth.getUser().then(({ data }) => {
      if (data?.user?.email) {
        setUserEmail(data.user.email);
      }
    });
  }, []);

  const handlePayFast = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      const res = await fetch("/api/payments/payfast/checkout", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ amount: 250, email: userEmail }),
      });

      const data = await res.json();
      if (!res.ok || !data.processUrl) {
        throw new Error(data.error || "Failed to initialize PayFast");
      }

      // Create a temporary hidden form and submit it to PayFast
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
    } catch (err: unknown) {
      console.error("PayFast checkout error:", err);
      const msg = err instanceof Error ? err.message : "Error initiating PayFast payment";
      alert(msg);
      setIsLoading(false);
    }
  };

  return (
    <div className="container max-w-4xl py-12 md:py-16">
      <div className="mb-8 md:mb-12 text-center">
        <h1 className="text-3xl font-bold tracking-tight md:text-4xl">Application Checkout</h1>
        <p className="mt-2 text-muted-foreground">Complete your tenant screening & application fee via PayFast.</p>
      </div>

      <div className="grid gap-8 lg:grid-cols-3">
        {/* Order Summary */}
        <div className="lg:col-span-1">
          <div className="rounded-xl border border-border bg-card p-6 shadow-sm">
            <h3 className="text-lg font-semibold mb-4">Summary</h3>
            
            <div className="space-y-3 text-sm border-b border-border pb-4 mb-4">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Application Processing</span>
                <span>R 200.00</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Credit & Identity Check</span>
                <span>R 50.00</span>
              </div>
            </div>
            
            <div className="flex justify-between items-center font-bold text-lg">
              <span>Total Due</span>
              <span className="text-brand">R 250.00</span>
            </div>
            
            <div className="mt-6 flex items-center gap-2 text-xs text-muted-foreground bg-green-50 dark:bg-green-950/30 p-2.5 rounded-lg border border-green-200 dark:border-green-900">
              <ShieldCheck className="h-4 w-4 text-green-600 dark:text-green-400 shrink-0" />
              <span>Secure 256-bit encrypted PayFast gateway</span>
            </div>
          </div>
        </div>

        {/* Payment Action */}
        <div className="lg:col-span-2">
          <div className="rounded-xl border border-border bg-card p-6 md:p-8 text-center flex flex-col items-center justify-center min-h-[320px]">
            <div className="mb-6 flex items-center justify-center gap-4">
              <div className="p-3 rounded-full bg-red-100 text-red-600 dark:bg-red-950/50 dark:text-red-400">
                <CreditCard className="h-8 w-8" />
              </div>
              <div className="p-3 rounded-full bg-muted text-muted-foreground">
                <Lock className="h-8 w-8" />
              </div>
            </div>

            <h3 className="text-xl font-bold mb-2">PayFast Sandbox Demo</h3>
            <p className="text-sm text-muted-foreground mb-6 max-w-md">
              Clicking below will redirect to the official PayFast Sandbox checkout page where you can demo live Card, Instant EFT, SnapScan, and Zapper payments.
            </p>

            <button
              onClick={handlePayFast}
              disabled={isLoading}
              className="w-full max-w-sm inline-flex h-12 items-center justify-center rounded-md bg-brand px-8 text-base font-semibold text-white shadow-md transition-colors hover:bg-brand/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
            >
              {isLoading ? (
                <>
                  <Loader2 className="mr-2 h-5 w-5 animate-spin" /> Redirecting to PayFast...
                </>
              ) : (
                <>
                  Pay with PayFast (R 250.00) <ExternalLink className="ml-2 h-4 w-4" />
                </>
              )}
            </button>

            <p className="mt-4 text-xs text-muted-foreground">
              Mode: <span className="font-semibold text-amber-600">PayFast Sandbox</span> (No real card charged)
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
