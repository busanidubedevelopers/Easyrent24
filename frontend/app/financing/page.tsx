"use client";

import { useState, Suspense } from "react";
import { Check, Wallet, Building2, Landmark, Loader2 } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

function FinancingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const amount = searchParams.get("amount") || "500";
  const jobId = searchParams.get("jobId");
  
  const [step, setStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<string | null>(null);

  const handleApply = () => {
    setIsLoading(true);
    setTimeout(() => {
       setIsLoading(false);
       setStep(3); // Success
    }, 2500);
  };

  const handleComplete = () => {
     if (jobId) {
        router.push(`/handyman/job/${jobId}?funded=true`);
     } else {
        router.push("/dashboard");
     }
  };

  return (
    <div className="container max-w-2xl pt-20 pb-12 md:pb-16">
       <div className="text-center mb-8">
          <div className="relative h-48 w-full max-w-md mx-auto mb-6 rounded-xl overflow-hidden shadow-lg">
             {/* eslint-disable-next-line @next/next/no-img-element */}
             <img 
               src="/images/finance-growth.png" 
               alt="Financial Growth Illustration" 
               className="w-full h-full object-cover"
             />
          </div>
          <h1 className="text-3xl font-bold tracking-tight mb-2">Service Financing</h1>
          <p className="text-muted-foreground">Get a quick advance to cover your maintenance costs.</p>
       </div>

       <div className="rounded-xl border border-border bg-card shadow-sm p-6 md:p-8">
          {step === 1 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="bg-blue-50 dark:bg-blue-900/20 p-4 rounded-lg flex items-center justify-between">
                   <div>
                      <p className="text-sm font-medium text-blue-800 dark:text-blue-300">Requested Amount</p>
                      <h2 className="text-2xl font-bold text-blue-900 dark:text-blue-100">R {amount}.00</h2>
                   </div>
                   <Wallet className="h-8 w-8 text-blue-600 dark:text-blue-400" />
                </div>
                
                <h3 className="font-semibold text-lg">Select a Financial Provider</h3>
                <div className="grid gap-3">
                   {[
                      { id: "capitec", name: "Capitec PayDay", fee: "5%", time: "Instant" },
                      { id: "fnb", name: "FNB Temporary Loan", fee: "4.5%", time: "Instant" },
                      { id: "wonga", name: "Wonga Express", fee: "7%", time: "5 mins" },
                   ].map((provider) => (
                      <button
                        key={provider.id}
                        onClick={() => setSelectedProvider(provider.id)}
                        className={cn(
                           "flex items-center justify-between p-4 rounded-lg border-2 transition-all hover:bg-muted/50",
                           selectedProvider === provider.id ? "border-brand bg-brand/5" : "border-border"
                        )}
                      >
                         <div className="flex items-center gap-3">
                            <div className="h-10 w-10 rounded-full bg-zinc-200 dark:bg-zinc-800 flex items-center justify-center">
                               <Landmark className="h-5 w-5" />
                            </div>
                            <div className="text-left">
                               <div className="font-semibold">{provider.name}</div>
                               <div className="text-xs text-muted-foreground">Interest/Fee: {provider.fee}</div>
                            </div>
                         </div>
                         <div className="text-right">
                             <div className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded">{provider.time}</div>
                         </div>
                      </button>
                   ))}
                </div>

                <button 
                  disabled={!selectedProvider}
                  onClick={() => setStep(2)}
                  className="w-full inline-flex h-11 items-center justify-center rounded-md bg-brand px-8 text-sm font-medium text-white shadow transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                   Continue Application
                </button>
             </div>
          )}

          {step === 2 && (
             <div className="space-y-6 animate-in fade-in slide-in-from-right-4 duration-300">
                <div className="text-center">
                   <Building2 className="h-12 w-12 mx-auto text-brand mb-4" />
                   <h2 className="text-xl font-semibold">Employment Verification</h2>
                   <p className="text-sm text-muted-foreground">Confirm your employment details for approval.</p>
                </div>

                <div className="grid gap-4">
                   <div className="space-y-2">
                      <label className="text-sm font-medium">Employer Name</label>
                      <input className="flex h-10 w-full rounded-md border border-input bg-transparent px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" defaultValue="Tech Solutions Ltd" />
                   </div>
                   <div className="space-y-2">
                       <label className="text-sm font-medium">Monthly Net Income</label>
                       <div className="relative">
                          <span className="absolute left-3 top-2.5 text-muted-foreground">R</span>
                          <input className="flex h-10 w-full rounded-md border border-input bg-transparent px-7 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand" defaultValue="25000" />
                       </div>
                   </div>
                   <div className="flex items-center gap-2 pt-2">
                      <input type="checkbox" id="terms" className="h-4 w-4 rounded border-gray-300 text-brand focus:ring-brand" defaultChecked />
                      <label htmlFor="terms" className="text-sm text-muted-foreground">I agree to the credit check and terms of the loan.</label>
                   </div>
                </div>

                <button 
                  onClick={handleApply}
                  disabled={isLoading}
                  className="w-full inline-flex h-11 items-center justify-center rounded-md bg-brand px-8 text-sm font-medium text-white shadow transition-colors hover:bg-gold-600 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-50"
                >
                   {isLoading ? (
                      <>
                         <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                         Processing Approval...
                      </>
                   ) : (
                      "Submit Application"
                   )}
                </button>
             </div>
          )}

          {step === 3 && (
             <div className="flex flex-col items-center justify-center text-center space-y-4 animate-in fade-in zoom-in duration-300">
                <div className="h-20 w-20 bg-green-100 rounded-full flex items-center justify-center">
                   <Check className="h-10 w-10 text-green-600" />
                </div>
                <h2 className="text-2xl font-bold">Loan Approved!</h2>
                <p className="text-muted-foreground max-w-sm">
                   Your financing request for R {amount}.00 has been approved and the funds are ready to be transferred to the Escrow Account.
                </p>
                
                <div className="w-full bg-muted/30 p-4 rounded-lg border border-border mt-4">
                   <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Principal:</span>
                      <span className="font-medium">R {amount}.00</span>
                   </div>
                    <div className="flex justify-between text-sm mb-2">
                      <span className="text-muted-foreground">Repayment:</span>
                      <span className="font-medium">R {(parseInt(amount) * 1.05).toFixed(2)}</span>
                   </div>
                    <div className="flex justify-between text-sm">
                      <span className="text-muted-foreground">Due Date:</span>
                      <span className="font-medium">25th Feb 2026</span>
                   </div>
                </div>

                <div className="pt-4 w-full">
                    <button 
                       onClick={handleComplete}
                       className="w-full inline-flex h-11 items-center justify-center rounded-md bg-brand px-8 text-sm font-medium text-white shadow transition-colors hover:bg-gold-600"
                    >
                       Pay to Service Escrow
                    </button>
                </div>
             </div>
          )}
       </div>
    </div>
  );
}

export default function FinancingPage() {
  return (
    <Suspense fallback={
       <div className="container max-w-2xl py-12 flex justify-center">
          <Loader2 className="h-10 w-10 animate-spin text-brand" />
       </div>
    }>
      <FinancingContent />
    </Suspense>
  );
}
