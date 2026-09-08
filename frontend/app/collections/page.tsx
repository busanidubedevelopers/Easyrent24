"use client";

import { useState } from "react";
import { 
  AlertTriangle, 
  ArrowRight, 
  Ban, 
  CheckCircle2, 
  FileText, 
  Gavel, 
  Mail, 
  MessageSquare, 
  Phone, 
  Scale, 
  ShieldAlert, 
  Users 
} from "lucide-react";
import { cn } from "@/lib/utils";
import Image from "next/image";

// Mock Data for Tenants in Arrears
const ARREARS_CASES = [
  {
    id: "case-101",
    tenantName: "Michael Foster",
    property: "Unit 404, The EasyLofts",
    arrearsAmount: 14500,
    daysOverdue: 45,
    status: "Late", 
    lastCommunication: "2026-01-25 (SMS Reminder)",
    leaseEnd: "2026-11-30",
    riskScore: "High",
  },
  {
    id: "case-102",
    tenantName: "Sarah Jenkins",
    property: "12 Greenway Drive",
    arrearsAmount: 8200,
    daysOverdue: 12,
    status: "Warning Sent",
    lastCommunication: "2026-02-01 (Email)",
    leaseEnd: "2026-06-30",
    riskScore: "Medium",
  },
  {
    id: "case-103",
    tenantName: "David Nkosi",
    property: "Flat 5, Rosebank Heights",
    arrearsAmount: 32000,
    daysOverdue: 95,
    status: "Legal Action",
    lastCommunication: "2026-01-10 (Letter of Demand)",
    leaseEnd: "Month-to-Month",
    riskScore: "Critical",
  },
];

const COLLECTION_AGENTS = [
  { id: 1, name: "SwiftRecover Legal", rate: "10%", rating: 4.8, specialized: "Evictions" },
  { id: 2, name: "Metro Debt Collections", rate: "8%", rating: 4.5, specialized: "Soft Collections" },
  { id: 3, name: "Titanium Enforcement", rate: "12%", rating: 4.9, specialized: "High Value" },
];

export default function CollectionsPage() {
  const [selectedCase, setSelectedCase] = useState<string | null>(null);
  const [activeStage, setActiveStage] = useState<string>("communication"); // communication, demand, agent, cancellation, eviction
  const [notification, setNotification] = useState<string | null>(null);

  const currentCase = ARREARS_CASES.find(c => c.id === selectedCase);

  const handleSendReminder = (type: string) => {
    setNotification(`${type} payment reminder sent to tenant successfully.`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleGenerateDemand = () => {
    setNotification("Formal Letter of Demand has been generated and emailed.");
    setActiveStage("agent"); // Move to next suggested stage
    setTimeout(() => setNotification(null), 3000);
  };

  const handleHireAgent = (agentName: string) => {
    setNotification(`${agentName} has been appointed to this case.`);
    setTimeout(() => setNotification(null), 3000);
  };

  const handleCancelLease = () => {
    if (confirm("Are you sure you want to initiate lease cancellation? This is a legal action.")) {
       setNotification("Lease cancellation notice has been issued.");
       setActiveStage("eviction");
       setTimeout(() => setNotification(null), 3000);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-border py-8">
         <div className="container mx-auto px-4">
            <h1 className="text-3xl font-bold tracking-tight mb-2">Collections & Evictions</h1>
            <p className="text-muted-foreground">Manage arrears, issue legal notices, and recover revenue efficiently.</p>
         </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        
        {/* Notification Toast */}
        {notification && (
          <div className="fixed top-24 right-4 z-50 bg-green-600 text-white px-6 py-4 rounded-lg shadow-xl animate-in fade-in slide-in-from-right-10 flex items-center gap-2">
            <CheckCircle2 className="h-5 w-5" />
            {notification}
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Detailed Workflow View (Left/Main Panel) */}
          <div className="lg:col-span-8 space-y-6">
             {selectedCase && currentCase ? (
               <div className="bg-white dark:bg-slate-900 rounded-xl border border-border overflow-hidden shadow-sm">
                  {/* Case Header */}
                  <div className="p-6 border-b border-border bg-slate-50/50 dark:bg-slate-900/50 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
                     <div>
                        <div className="flex items-center gap-2 mb-1">
                           <h2 className="text-2xl font-bold">{currentCase.tenantName}</h2>
                           <span className={cn(
                             "px-2.5 py-0.5 rounded-full text-xs font-medium border",
                             currentCase.riskScore === "Critical" ? "bg-red-100 text-red-700 border-red-200" :
                             currentCase.riskScore === "High" ? "bg-orange-100 text-orange-700 border-orange-200" :
                             "bg-yellow-100 text-yellow-700 border-yellow-200"
                           )}>
                             {currentCase.riskScore} Risk
                           </span>
                        </div>
                        <p className="text-muted-foreground text-sm">{currentCase.property}</p>
                     </div>
                     <div className="text-right">
                        <div className="text-sm text-muted-foreground">Outstanding Amount</div>
                        <div className="text-2xl font-bold text-red-600">R {currentCase.arrearsAmount.toLocaleString()}</div>
                     </div>
                  </div>

                  {/* Workflow Tabs */}
                  <div className="flex border-b border-border overflow-x-auto">
                     <button 
                       onClick={() => setActiveStage("communication")}
                       className={cn("flex flex-col items-center gap-1 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap", activeStage === "communication" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:bg-slate-50")}
                     >
                        <MessageSquare className="h-4 w-4" />
                        Communication
                     </button>
                     <button 
                       onClick={() => setActiveStage("demand")}
                       className={cn("flex flex-col items-center gap-1 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap", activeStage === "demand" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:bg-slate-50")}
                     >
                        <FileText className="h-4 w-4" />
                        Written Demand
                     </button>
                     <button 
                       onClick={() => setActiveStage("agent")}
                       className={cn("flex flex-col items-center gap-1 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap", activeStage === "agent" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:bg-slate-50")}
                     >
                        <Users className="h-4 w-4" />
                        Collections Agent
                     </button>
                     <button 
                       onClick={() => setActiveStage("cancellation")}
                       className={cn("flex flex-col items-center gap-1 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap", activeStage === "cancellation" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:bg-slate-50")}
                     >
                        <Ban className="h-4 w-4" />
                        Cancel Lease
                     </button>
                     <button 
                       onClick={() => setActiveStage("eviction")}
                       className={cn("flex flex-col items-center gap-1 px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap", activeStage === "eviction" ? "border-brand text-brand" : "border-transparent text-muted-foreground hover:bg-slate-50")}
                     >
                        <Scale className="h-4 w-4" />
                        Eviction
                     </button>
                  </div>

                  {/* Content Area */}
                  <div className="p-6 md:p-8 min-h-[400px]">
                     
                     {/* 1. Communication Stage */}
                     {activeStage === "communication" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                           <div>
                              <h3 className="text-lg font-semibold mb-2">Communicate Arrears</h3>
                              <p className="text-muted-foreground text-sm">Send a formal but friendly reminder to the tenant regarding the outstanding balance of R {currentCase.arrearsAmount.toLocaleString()}.</p>
                           </div>

                           <div className="grid md:grid-cols-2 gap-4">
                              <div className="border border-border rounded-xl p-6 hover:border-brand/50 transition-colors cursor-pointer" onClick={() => handleSendReminder("SMS")}>
                                 <div className="h-10 w-10 rounded-full bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-blue-600 mb-4">
                                    <MessageSquare className="h-5 w-5" />
                                 </div>
                                 <h4 className="font-semibold mb-1">Send SMS Payment Link</h4>
                                 <p className="text-sm text-muted-foreground">Send a secure payment link directly to {currentCase.tenantName}&apos;s mobile.</p>
                              </div>
                              <div className="border border-border rounded-xl p-6 hover:border-brand/50 transition-colors cursor-pointer" onClick={() => handleSendReminder("Email")}>
                                 <div className="h-10 w-10 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-indigo-600 mb-4">
                                    <Mail className="h-5 w-5" />
                                 </div>
                                 <h4 className="font-semibold mb-1">Send Statement via Email</h4>
                                 <p className="text-sm text-muted-foreground">Email a detailed statement of arrears with a &quot;Reply&quot; request.</p>
                              </div>
                           </div>

                           <div className="bg-slate-50 dark:bg-slate-900/50 p-4 rounded-lg border border-border">
                              <h4 className="text-sm font-semibold mb-2 flex items-center gap-2">
                                 <Phone className="h-4 w-4" />
                                 Call Script Preview
                              </h4>
                              <p className="text-sm text-muted-foreground italic">
                                 &quot;Hi {currentCase.tenantName}, this is EasyRent regarding your unit at {currentCase.property}. We noticed your payment of R {currentCase.arrearsAmount} is {currentCase.daysOverdue} days overdue. Is there an issue with the payment method we can assist with?&quot;
                              </p>
                           </div>
                        </div>
                     )}

                     {/* 2. Written Demand Stage */}
                     {activeStage === "demand" && (
                         <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                            <div className="flex justify-between items-start">
                               <div>
                                 <h3 className="text-lg font-semibold mb-2">Letter of Demand</h3>
                                 <p className="text-muted-foreground text-sm">Issue a Section 129 Letter of Demand (NCA Compliant) requiring payment within 7 days.</p>
                               </div>
                               <button 
                                 onClick={handleGenerateDemand}
                                 className="bg-brand text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-brand/90 transition-colors"
                               >
                                 Generate & Send
                               </button>
                            </div>

                            <div className="bg-white dark:bg-slate-950 border border-slate-200 dark:border-slate-800 shadow-sm rounded-lg p-8 max-w-2xl mx-auto font-serif text-sm leading-relaxed">
                               <div className="text-center border-b border-slate-100 pb-4 mb-6">
                                  <div className="font-bold text-lg uppercase tracking-wider">Formal Letter of Demand</div>
                                  <div className="text-red-600 font-bold text-xs mt-1">IMPORTANT LEGAL NOTICE</div>
                               </div>
                               <p className="mb-4"><strong>To:</strong> {currentCase.tenantName}</p>
                               <p className="mb-4"><strong>Property:</strong> {currentCase.property}</p>
                               <p className="mb-4"><strong>Date:</strong> {new Date().toLocaleDateString()}</p>
                               
                               <p className="mb-4">
                                  Dear {currentCase.tenantName},
                               </p>
                               <p className="mb-4">
                                  We note with concern that your rental account is in arrears in the amount of <strong>R {currentCase.arrearsAmount.toLocaleString()}</strong>.
                                  This amount has been outstanding for {currentCase.daysOverdue} days.
                               </p>
                               <p className="mb-4">
                                  You are hereby formally placed in breach of your lease agreement. We demand immediate payment of the full outstanding amount within <strong>7 (seven) business days</strong> from the date of this letter.
                               </p>
                               <p className="mb-6">
                                  Failure to rectify this breach allows the landlord to cancel the lease agreement immediately and institute legal proceedings for eviction and recovery of costs.
                               </p>
                               <p>
                                  Sincerely,<br/>
                                  EasyRent Collections Dept.
                               </p>
                            </div>
                         </div>
                     )}

                     {/* 3. Collection Agent Stage */}
                     {activeStage === "agent" && (
                        <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                           <div>
                              <h3 className="text-lg font-semibold mb-2">Hire a Specialist</h3>
                              <p className="text-muted-foreground text-sm">Appoint a registered debt collector to recover funds on a success-fee basis.</p>
                           </div>

                           <div className="grid gap-4">
                              {COLLECTION_AGENTS.map((agent) => (
                                 <div key={agent.id} className="group border border-border rounded-xl p-4 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between hover:border-brand/50 hover:shadow-sm transition-all">
                                    <div className="flex items-start gap-4">
                                       <div className="h-12 w-12 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center font-bold text-slate-600 dark:text-slate-400">
                                          {agent.name.charAt(0)}
                                       </div>
                                       <div>
                                          <h4 className="font-bold">{agent.name}</h4>
                                          <div className="flex items-center gap-2 text-sm mt-1">
                                             <div className="flex text-yellow-500">
                                                {"★".repeat(Math.round(agent.rating))}
                                             </div>
                                             <span className="text-muted-foreground">•</span>
                                             <span className="text-muted-foreground">{agent.specialized}</span>
                                          </div>
                                       </div>
                                    </div>
                                    
                                    <div className="mt-4 sm:mt-0 flex w-full sm:w-auto items-center justify-between sm:justify-end gap-6">
                                       <div className="text-right">
                                          <div className="text-xs text-muted-foreground">Success Fee</div>
                                          <div className="font-bold text-green-600">{agent.rate}</div>
                                       </div>
                                       <button 
                                          onClick={() => handleHireAgent(agent.name)}
                                          className="bg-slate-900 dark:bg-white text-white dark:text-slate-900 px-4 py-2 rounded-md text-sm font-medium hover:opacity-90 transition-opacity"
                                       >
                                          Hire
                                       </button>
                                    </div>
                                 </div>
                              ))}
                           </div>
                        </div>
                     )}

                     {/* 4. Cancellation Stage */}
                     {activeStage === "cancellation" && (
                         <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                            <div className="bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900 rounded-lg p-4 flex gap-3">
                               <AlertTriangle className="h-5 w-5 text-red-600 flex-shrink-0" />
                               <div>
                                  <h4 className="text-sm font-bold text-red-900 dark:text-red-200">Legal Warning</h4>
                                  <p className="text-sm text-red-800 dark:text-red-300 mt-1">Cancelling a lease requires proof of material breach and that proper written demand (Stage 2) was ignored. Ensure you have followed due process.</p>
                               </div>
                            </div>
                            
                            <div>
                               <h3 className="text-lg font-semibold mb-2">Notice of Cancellation</h3>
                               <p className="text-muted-foreground text-sm">Generate the final notice to terminate the lease agreement effective immediately.</p>
                            </div>

                            <div className="border border-border rounded-lg p-6 bg-slate-50 dark:bg-slate-900/30">
                               <div className="flex flex-col gap-4">
                                  <label className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" className="h-4 w-4 rounded border-primary text-brand focus:ring-brand" />
                                     <span className="text-sm">I confirm that 20 business days (or agreed period) have passed since Letter of Demand.</span>
                                  </label>
                                  <label className="flex items-center gap-2 cursor-pointer">
                                     <input type="checkbox" className="h-4 w-4 rounded border-primary text-brand focus:ring-brand" />
                                     <span className="text-sm">I confirm outstanding amount remains unpaid.</span>
                                  </label>
                               </div>
                               
                               <button 
                                 onClick={handleCancelLease}
                                 className="mt-6 w-full sm:w-auto flex items-center justify-center gap-2 bg-red-600 text-white px-6 py-3 rounded-md font-bold hover:bg-red-700 transition-colors"
                               >
                                 <Ban className="h-4 w-4" />
                                 Issue Cancellation Notice
                               </button>
                            </div>
                         </div>
                     )}

                     {/* 5. Eviction Stage */}
                     {activeStage === "eviction" && (
                         <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                             <div>
                               <h3 className="text-lg font-semibold mb-2">Eviction Proceedings</h3>
                               <p className="text-muted-foreground text-sm">When the tenant refuses to vacate after cancellation, you must obtain a court order.</p>
                            </div>

                            <div className="grid md:grid-cols-3 gap-6">
                               {/* Standard Process Info */}
                               <div className="col-span-1 md:col-span-2 space-y-4">
                                  <div className="relative pl-8 border-l-2 border-slate-200 dark:border-slate-800 space-y-8">
                                     <div className="relative">
                                        <div className="absolute -left-[37px] top-0 h-4 w-4 rounded-full border-2 border-brand bg-background z-10"></div>
                                        <h4 className="font-semibold text-sm">Draft Eviction Application</h4>
                                        <p className="text-sm text-muted-foreground mt-1">Attorney drafts papers illustrating your ownership and the tenant&apos;s unlawful occupation.</p>
                                     </div>
                                     <div className="relative">
                                        <div className="absolute -left-[37px] top-0 h-4 w-4 rounded-full border-2 border-border bg-background z-10"></div>
                                        <h4 className="font-semibold text-sm">Service by Sheriff</h4>
                                        <p className="text-sm text-muted-foreground mt-1">The Sheriff serves the application to the tenant and municipality.</p>
                                     </div>
                                     <div className="relative">
                                        <div className="absolute -left-[37px] top-0 h-4 w-4 rounded-full border-2 border-border bg-background z-10"></div>
                                        <h4 className="font-semibold text-sm">Court Hearing</h4>
                                        <p className="text-sm text-muted-foreground mt-1">Magistrate/Judge hears the matter. If unopposed, an order is granted.</p>
                                     </div>
                                  </div>
                               </div>

                               {/* Action Card */}
                               <div className="bg-slate-900 text-white rounded-xl p-6 flex flex-col justify-between">
                                  <div>
                                     <ShieldAlert className="h-8 w-8 text-red-500 mb-4" />
                                     <h4 className="text-xl font-bold mb-2">Eviction Attorney</h4>
                                     <p className="text-slate-300 text-sm mb-6">Connect with our partner eviction attorneys for a flat-fee consultation.</p>
                                  </div>
                                  <button className="w-full bg-white text-slate-900 py-3 rounded-lg font-bold text-sm hover:bg-slate-100 transition-colors">
                                     Request Legal Quote
                                  </button>
                               </div>
                            </div>
                         </div>
                     )}

                  </div>
               </div>
             ) : (
               /* Empty State: Select a case */
               /* Empty State: Select a case */
               <div className="h-full min-h-[400px] flex flex-col items-center justify-center border border-dashed border-border rounded-xl bg-slate-50/50 dark:bg-slate-900/50 p-8 text-center overflow-hidden relative">
                  <div className="relative h-40 w-40 mb-6 opacity-80 hover:scale-105 transition-transform duration-500">
                     <Image 
                        src="/images/finance-growth.png" 
                        alt="Recover Revenue" 
                        fill
                        className="object-contain"
                     />
                  </div>
                  <h3 className="text-lg font-semibold mb-2">Select a Case to Analyze</h3>
                  <p className="text-muted-foreground max-w-sm">
                     Choose a tenant from the list to view detailed arrears info, risk scores, and initiate recovery workflows.
                  </p>
               </div>
             )}
          </div>

          {/* Sidebar (List of Arrears) */}
          <div className="lg:col-span-4 space-y-4">
             <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold">Active Arrears ({ARREARS_CASES.length})</h3>
                <button className="text-sm text-brand font-medium hover:underline">View All</button>
             </div>
             
             <div className="space-y-3">
                {ARREARS_CASES.map(c => (
                   <div 
                     key={c.id} 
                     onClick={() => setSelectedCase(c.id)}
                     className={cn(
                        "p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md",
                        selectedCase === c.id 
                           ? "bg-white dark:bg-slate-900 border-brand ring-1 ring-brand" 
                           : "bg-white dark:bg-slate-900 border-border hover:border-brand/50"
                     )}
                   >
                      <div className="flex justify-between items-start mb-2">
                         <h4 className="font-semibold text-sm">{c.tenantName}</h4>
                         <span className="text-xs font-bold text-red-600 bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded-full">
                           {c.daysOverdue} days
                         </span>
                      </div>
                      <div className="text-muted-foreground text-xs mb-3 truncate">{c.property}</div>
                      
                      <div className="flex items-center justify-between pt-3 border-t border-border">
                         <div>
                            <div className="text-[10px] text-muted-foreground uppercase tracking-wider font-semibold">Arrears</div>
                            <div className="font-bold text-sm">R {c.arrearsAmount.toLocaleString()}</div>
                         </div>
                         <ArrowRight className={cn("h-4 w-4 transition-transform", selectedCase === c.id ? "text-brand translate-x-1" : "text-muted-foreground")} />
                      </div>
                   </div>
                ))}
             </div>
             
             {/* Stats Card */}
             <div className="bg-slate-900 text-white rounded-xl p-6 mt-6">
                <h4 className="font-bold mb-4 flex items-center gap-2">
                   <Gavel className="h-4 w-4 text-brand" />
                   System Status
                </h4>
                <div className="space-y-4">
                   <div className="flex justify-between items-center text-sm border-b border-slate-700 pb-2">
                      <span className="text-slate-400">Total Arrears</span>
                      <span className="font-bold">R 54,700</span>
                   </div>
                   <div className="flex justify-between items-center text-sm border-b border-slate-700 pb-2">
                      <span className="text-slate-400">Avg. Recovery Time</span>
                      <span className="font-bold">28 days</span>
                   </div>
                   <div className="flex justify-between items-center text-sm">
                      <span className="text-slate-400">Success Rate</span>
                      <span className="font-bold text-green-400">84%</span>
                   </div>
                </div>
             </div>
          </div>

        </div>
      </div>
    </div>
  );
}
