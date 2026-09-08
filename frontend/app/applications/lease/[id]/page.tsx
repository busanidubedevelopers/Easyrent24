"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { 
  ArrowLeft, 
  Check, 
  CheckCircle2, 
  ChevronRight, 
  Download, 
  FileSignature, 
  Loader2, 
  Mail, 
  PenTool, 
  Send 
} from "lucide-react";
import { cn } from "@/lib/utils";

// Mock Data matching the Application ID
const APPLICATION_DATA = {
  id: "APP-2026-001",
  tenantName: "James Peterson",
  property: "Unit 301, The EasyLofts",
  rent: 8500,
  deposit: 8500,
  leaseStart: "2026-03-01",
  leaseTerm: "12 Months",
  landlordName: "EasyRent Mgmt",
  tenantEmail: "james.p@example.com"
};

const LEASE_STEPS = [
  { id: 1, title: "Draft & Send", description: "Review and email lease to tenant" },
  { id: 2, title: "Tenant Signature", description: "Waiting for James to sign" },
  { id: 3, title: "Landlord Signature", description: "Countersign the document" },
  { id: 4, title: "Finalized", description: "Stored in Documents" }
];

// Update import to include useParams if not already (it's not, need to check imports carefully) -- wait, useParams is better.
import { useParams } from "next/navigation";

export default function LeaseWorkflowPage() {
  const params = useParams();
  const id = params.id as string;
  const router = useRouter(); // Restore router

  const [currentStep, setCurrentStep] = useState(1);
  const [isLoading, setIsLoading] = useState(false);
  const [notification, setNotification] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [showConfetti, setShowConfetti] = useState(false);

  // Simulation states
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isTenantSigned, setIsTenantSigned] = useState(false);
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isLandlordSigned, setIsLandlordSigned] = useState(false);

  // Helper to advance step with fake delay
  const advanceStep = (nextStep: number) => {
    setIsLoading(true);
    setTimeout(() => {
        setCurrentStep(nextStep);
        setIsLoading(false);
    }, 1200);
  };

  const handleSendToTenant = () => {
    setNotification("Lease sent to James Peterson via email for digital signature.");
    setTimeout(() => setNotification(null), 3000);
    advanceStep(2);
  };

  const simulateTenantSigning = () => {
     // This would happen async in real life
     setNotification("Tenant has viewed and signed the document.");
     setTimeout(() => setNotification(null), 3000);
     setIsTenantSigned(true);
     // Auto advance after sim
     setTimeout(() => setCurrentStep(3), 1000);
  };

  const handleLandlordSign = () => {
     setIsLandlordSigned(true);
     setNotification("You have successfully countersigned the lease.");
     setTimeout(() => setNotification(null), 3000);
     advanceStep(4);
     setShowConfetti(true);
  };

  const handleFinish = () => {
    router.push("/documents?tab=contracts&new=true");
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 py-12">
       {/* Toast */}
       {notification && (
          <div className="fixed top-24 right-4 z-50 bg-green-600 text-white px-6 py-4 rounded-lg shadow-xl animate-in fade-in slide-in-from-right-10 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            {notification}
          </div>
       )}

       <div className="container max-w-5xl mx-auto px-4">
          
          {/* Header */}
          <div className="flex items-center gap-4 mb-8">
             <button onClick={() => router.back()} className="p-2 hover:bg-slate-200 dark:hover:bg-slate-800 rounded-full transition-colors">
                <ArrowLeft className="h-5 w-5" />
             </button>
             <div>
                <h1 className="text-2xl font-bold">Lease Workflow</h1>
                <p className="text-muted-foreground">Application #{id} • {APPLICATION_DATA.tenantName}</p>
             </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
             
             {/* Left: Progress Stepper */}
             <div className="lg:col-span-4">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-border p-6 shadow-sm">
                   <h3 className="font-bold mb-6">Workflow Status</h3>
                   <div className="space-y-6">
                      {LEASE_STEPS.map((step, index) => {
                         const isActive = step.id === currentStep;
                         const isCompleted = step.id < currentStep;
                         return (
                            <div key={step.id} className="relative flex gap-4">
                               {/* Line connector */}
                               {index !== LEASE_STEPS.length - 1 && (
                                  <div className={cn(
                                    "absolute left-[15px] top-8 bottom-[-16px] w-0.5",
                                    isCompleted ? "bg-brand" : "bg-slate-200 dark:bg-slate-800"
                                  )} />
                               )}
                               
                               <div className={cn(
                                  "h-8 w-8 rounded-full flex items-center justify-center shrink-0 z-10 transition-colors",
                                  isActive ? "bg-brand text-white ring-4 ring-brand/20" : 
                                  isCompleted ? "bg-brand text-white" : "bg-slate-100 dark:bg-slate-800 text-slate-400"
                               )}>
                                  {isCompleted ? <Check className="h-4 w-4" /> : <span className="text-xs font-bold">{step.id}</span>}
                               </div>
                               <div className={cn("pt-1", isActive ? "opacity-100" : "opacity-60")}>
                                  <h4 className="font-semibold text-sm">{step.title}</h4>
                                  <p className="text-xs text-muted-foreground">{step.description}</p>
                               </div>
                            </div>
                         );
                      })}
                   </div>
                </div>
             </div>

             {/* Right: Action Area */}
             <div className="lg:col-span-8">
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-border shadow-sm overflow-hidden min-h-[500px] flex flex-col">
                   
                   {/* Step 1: Draft & Send */}
                   {currentStep === 1 && (
                      <div className="p-8 flex-1 flex flex-col animate-in fade-in slide-in-from-right-4">
                         <div className="flex-1">
                            <h2 className="text-xl font-bold mb-4">Review {APPLICATION_DATA.tenantName}&apos;s Lease</h2>
                            <div className="bg-slate-50 dark:bg-slate-950 p-6 rounded-lg border border-border font-mono text-sm max-h-[300px] overflow-y-auto mb-6">
                               <p className="font-bold mb-4">RESIDENTIAL LEASE AGREEMENT</p>
                               <p className="mb-2"><strong>Landlord:</strong> {APPLICATION_DATA.landlordName}</p>
                               <p className="mb-2"><strong>Tenant:</strong> {APPLICATION_DATA.tenantName}</p>
                               <p className="mb-2"><strong>Property:</strong> {APPLICATION_DATA.property}</p>
                               <p className="mb-4"><strong>Term:</strong> {APPLICATION_DATA.leaseTerm} commencing {APPLICATION_DATA.leaseStart}</p>
                               <p className="mb-2"><strong>Rent:</strong> R {APPLICATION_DATA.rent.toLocaleString()} per month</p>
                               <p className="mb-4"><strong>Security Deposit:</strong> R {APPLICATION_DATA.deposit.toLocaleString()}</p>
                               <p className="text-muted-foreground italic">[... Standard Clauses A through Z ...]</p>
                            </div>
                         </div>
                         <div className="flex justify-end pt-4 border-t border-border">
                            <button 
                              onClick={handleSendToTenant}
                              disabled={isLoading}
                              className="bg-brand text-white px-6 py-3 rounded-md font-medium flex items-center gap-2 hover:bg-brand/90 transition-all"
                            >
                               {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
                               Approve & Email to Tenant
                            </button>
                         </div>
                      </div>
                   )}

                   {/* Step 2: Tenant Signature (Waiting) */}
                   {currentStep === 2 && (
                      <div className="p-8 flex-1 flex flex-col items-center justify-center text-center animate-in fade-in slide-in-from-right-4">
                         <div className="h-20 w-20 rounded-full bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center text-blue-600 mb-6 animate-pulse">
                            <Mail className="h-10 w-10" />
                         </div>
                         <h2 className="text-xl font-bold mb-2">Waiting for Tenant Signature</h2>
                         <p className="text-muted-foreground max-w-md mb-8">
                            We&apos;ve sent the digital lease to <strong>{APPLICATION_DATA.tenantEmail}</strong>. 
                            You will be notified once they have signed.
                         </p>
                         
                         {/* Demo Only Control */}
                         <div className="p-4 border border-dashed border-slate-300 dark:border-slate-700 rounded-lg bg-slate-50 dark:bg-slate-900/50 max-w-sm">
                            <p className="text-xs uppercase font-bold text-muted-foreground mb-2">Demo Control</p>
                            <button 
                              onClick={simulateTenantSigning}
                              className="text-sm bg-white dark:bg-slate-800 border border-border px-4 py-2 rounded shadow-sm hover:bg-slate-50 transition-colors w-full"
                            >
                               Simulate &quot;James Signs Lease&quot;
                            </button>
                         </div>
                      </div>
                   )}

                   {/* Step 3: Landlord Countersign */}
                   {currentStep === 3 && (
                      <div className="p-8 flex-1 flex flex-col animate-in fade-in slide-in-from-right-4">
                         <h2 className="text-xl font-bold mb-4">Action Required: Countersign Lease</h2>
                         <div className="flex items-center gap-3 p-4 bg-green-50 dark:bg-green-900/20 border border-green-100 dark:border-green-900 rounded-lg mb-6">
                            <CheckCircle2 className="h-5 w-5 text-green-600" />
                            <p className="text-sm text-green-800 dark:text-green-200">
                               James Peterson signed on {new Date().toLocaleDateString()} at {new Date().toLocaleTimeString()}
                            </p>
                         </div>

                         <div className="flex-1 bg-slate-50 dark:bg-slate-950 p-8 rounded-lg border border-border flex flex-col items-center justify-center mb-6 relative group cursor-pointer transition-colors hover:bg-slate-100 dark:hover:bg-slate-900">
                            <div className="absolute top-4 left-4">
                               <FileSignature className="h-6 w-6 text-muted-foreground" />
                            </div>
                            
                            {/* Signature Area */}
                            <div className="w-full max-w-md border-b-2 border-slate-300 dark:border-slate-700 pb-2 text-center">
                               <p className="font-handwriting text-4xl text-brand rotate-[-2deg] opacity-0 group-hover:opacity-100 transition-opacity duration-500 scale-110">
                                  {APPLICATION_DATA.landlordName}
                               </p>
                            </div>
                            <p className="text-xs text-muted-foreground mt-2">Click below to place your digital signature</p>
                         </div>

                         <div className="flex justify-end pt-4 border-t border-border">
                            <button 
                              onClick={handleLandlordSign}
                              disabled={isLoading}
                              className="bg-brand text-white px-8 py-3 rounded-md font-bold flex items-center gap-2 hover:bg-brand/90 transition-all shadow-lg hover:shadow-xl hover:-translate-y-0.5"
                            >
                               {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <PenTool className="h-4 w-4" />}
                               Sign & Finalize
                            </button>
                         </div>
                      </div>
                   )}

                   {/* Step 4: Success / Stored */}
                   {currentStep === 4 && (
                      <div className="p-8 flex-1 flex flex-col items-center justify-center text-center animate-in fade-in zoom-in duration-500">
                         <div className="h-24 w-24 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 mb-6">
                            <FileSignature className="h-12 w-12" />
                         </div>
                         <h2 className="text-2xl font-bold mb-2">Lease Agreement Finalized!</h2>
                         <p className="text-muted-foreground max-w-md mb-8">
                            The contract has been legally executed by both parties and securely stored in your Documents Centre. A copy has been emailed to the tenant.
                         </p>
                         
                         <div className="flex flex-col sm:flex-row gap-4 w-full justify-center">
                            <button 
                              onClick={handleFinish}
                              className="bg-brand text-white px-6 py-3 rounded-md font-medium hover:bg-brand/90 transition-colors flex items-center justify-center gap-2"
                            >
                               Go to Documents <ChevronRight className="h-4 w-4" />
                            </button>
                            <button className="px-6 py-3 rounded-md font-medium border border-input hover:bg-slate-50 dark:hover:bg-slate-900 transition-colors flex items-center justify-center gap-2">
                               <Download className="h-4 w-4" /> Download PDF
                            </button>
                         </div>
                      </div>
                   )}

                </div>
             </div>
          </div>
       </div>
    </div>
  );
}
