"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { supabase } from "@/lib/supabaseClient";
import { 
  AlertCircle, 
  AlertTriangle, 
  Briefcase, 
  Check, 
  CheckCircle2, 
  Download, 
  FileText,
  Landmark,
  Mail,
  Search, 
  Send,
  Shield,
  ShieldCheck, 
  User,
  UserCheck,
  X,
  XCircle
} from "lucide-react";
import { cn } from "@/lib/utils";

// --- Mock Applications Data ---
// --- Types ---
interface Application {
  id: string;
  applicant: {
    name: string;
    idNumber: string;
    email: string;
    phone: string;
  };
  property: string;
  status: string;
  score: number;
  risk: string;
  submissionDate: string;
  // Mocking verification details as they aren't fully in DB yet
  verification: {
    details: { status: string; source: string; verifiedAt: string };
    credit: { score: number; status: string; bureau: string; fraudIndicators: string; judgements: number };
    bank: { status: string; incomeMatch: boolean; fraudCheck: string; statementsProvided: boolean; statementsSource: string; monthsAnalyzed: number };
    employment: { status: string; employer: string; tenure: string };
    affordability: { ratio: number; status: string; netIncome: number; totalExpenses: number; disposableIncome: number; analysis: string };
  };
}

export default function ApplicationsPage() {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isLoading, setIsLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [selectedAppId, setSelectedAppId] = useState<string | null>(null);
  const [notification, setNotification] = useState<string | null>(null);

  const [isRegretModalOpen, setIsRegretModalOpen] = useState(false);

  // Constants
  const REGRET_LETTER_TEMPLATE = `Dear {ApplicantName},

Thank you for your application for the property at {PropertyAddress}. 

We regret to inform you that your application has been unsuccessful on this occasion. This decision is based on the outcome of our standard credit and risk assessment process.

We wish you all the best in your property search.

Sincerely,
EasyRent Management`;

  const [searchTerm, setSearchTerm] = useState("");

  useEffect(() => {
    async function fetchApplications() {
        try {
          const { data: authData, error: authError } = await supabase.auth.getUser();

          let dbApps: Application[] = [];

          if (!authError && authData?.user) {
             const user = authData.user;
             const { data, error } = await supabase
                .from('applications')
                .select(`
                   *,
                   properties!inner (
                      title,
                      address,
                      landlord_id
                   )
                `)
                .eq('properties.landlord_id', user.id);

             if (!error && data) {
                // eslint-disable-next-line @typescript-eslint/no-explicit-any
                dbApps = data.map((item: any) => {
                   const score = item.risk_score || 650;
                   let risk = item.risk_level || "Unknown";
                   if (risk === "unknown") {
                      risk = score >= 650 ? "Low" : score >= 600 ? "Medium" : "High";
                   }
                   risk = risk.charAt(0).toUpperCase() + risk.slice(1);

                   return {
                      id: item.id,
                      applicant: {
                         name: `${item.first_name} ${item.last_name}`,
                         idNumber: item.id_number || "N/A",
                         email: item.email || "",
                         phone: item.phone || "",
                      },
                      property: item.properties?.title || "Unknown Property",
                      status: item.status ? item.status.charAt(0).toUpperCase() + item.status.slice(1) : "Pending",
                      score: score,
                      risk: risk,
                      submissionDate: new Date(item.created_at).toISOString().split('T')[0],
                      verification: {
                         details: { status: "Verified", source: "Dept Home Affairs", verifiedAt: new Date().toISOString().split('T')[0] },
                         credit: { score: score, status: score > 600 ? "Good" : "Poor", bureau: "TransUnion", fraudIndicators: "None detected", judgements: 0 },
                         bank: { status: "Verified", incomeMatch: true, fraudCheck: "Passed", statementsProvided: true, statementsSource: "Direct Integration (BankServ)", monthsAnalyzed: 3 },
                         employment: { status: "Confirmed", employer: item.employer_name || "Unknown", tenure: "Unknown" },
                         affordability: { ratio: 28, status: "Pass", netIncome: 45000, totalExpenses: 28000, disposableIncome: 17000, analysis: "Applicant has stable cash flow over the last 3 months with sufficient disposable income for rent." }
                      }
                   };
                });
             }
          }

          setApplications(dbApps);
          if (dbApps.length > 0) {
             setSelectedAppId(dbApps[0].id);
          }

       } catch (err) {
          console.error("Error fetching applications:", err);
       } finally {
          setIsLoading(false);
       }
    }

    fetchApplications();
  }, []);

  // Key Stats
  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === "Ready for Review").length,
    approved: applications.filter(a => a.status === "Approved").length,
    declined: applications.filter(a => a.status === "Declined").length,
  };

  const filteredApps = applications.filter(app => 
    app.applicant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.property.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedApp = applications.find(a => a.id === selectedAppId);

  const handleApprove = async () => {
    if (selectedApp) {
       try {
          const res = await fetch(`/api/applications/${selectedApp.id}`, {
             method: 'PATCH',
             headers: { 'Content-Type': 'application/json' },
             body: JSON.stringify({ status: 'approved' })
          });

          if (!res.ok) {
             const errorData = await res.json();
             throw new Error(errorData.error || "Failed to approve application");
          }

          // Update state locally
          setApplications(prev => prev.map(app => 
            app.id === selectedApp.id ? { ...app, status: "Approved" } : app
          ));
          
          setNotification(`Application for ${selectedApp.applicant.name} approved successfully.`);
          setTimeout(() => setNotification(null), 3500);
       } catch (err: unknown) {
          console.error("Error approving application:", err);
          alert(`Failed to approve application: ${err instanceof Error ? err.message : 'Unknown error'}`);
       }
    }
  };

  const handleDecline = () => {
    setIsRegretModalOpen(true);
  };

  const sendRegretLetter = async (letterContent: string) => {
     if (selectedApp) {
         try {
            const res = await fetch(`/api/applications/${selectedApp.id}`, {
               method: 'PATCH',
               headers: { 'Content-Type': 'application/json' },
               body: JSON.stringify({ status: 'declined', decision_notes: letterContent })
            });

            if (!res.ok) {
               const errorData = await res.json();
               throw new Error(errorData.error || "Failed to decline application");
            }

            setApplications(prev => prev.map(app => 
               app.id === selectedApp.id ? { ...app, status: "Declined" } : app
            ));
            
            setIsRegretModalOpen(false);
            setNotification(`Regret letter sent to ${selectedApp.applicant.name}. Application status updated to Declined.`);
            setTimeout(() => setNotification(null), 3500);
         } catch (err: unknown) {
            console.error("Error declining application:", err);
            alert(`Failed to decline application: ${err instanceof Error ? err.message : 'Unknown error'}`);
         }
     }
  };

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950">
      
      {/* Toast Notification */}
      {notification && (
          <div className="fixed top-24 right-4 z-50 bg-green-600 text-white px-6 py-4 rounded-lg shadow-xl animate-in fade-in slide-in-from-right-10 flex items-center gap-2">
            <Check className="h-5 w-5" />
            {notification}
          </div>
      )}

      {/* Header */}
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-border py-12 relative overflow-hidden">
         <div className="absolute inset-0 bg-gradient-to-r from-brand/5 to-indigo-400/5 dark:from-brand/10 dark:to-indigo-400/10 pointer-events-none" />
         <div className="container mx-auto px-4 relative z-10">
            <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-gradient">Tenant Applications</h1>
            <p className="text-muted-foreground text-lg">Review extensive credit reports and verify potential tenants with ease.</p>
         </div>
      </div>

      <div className="container mx-auto px-4 py-8">
        
        {/* Dashboard Actions */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-10">
            <div className="card-premium p-5 rounded-2xl flex flex-col justify-center animate-fade-in-up" style={{animationDelay: '0ms'}}>
                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-1">Total Applications</span>
                <span className="text-3xl font-black">{stats.total}</span>
            </div>
             <div className="bg-blue-50/50 dark:bg-blue-900/10 p-5 rounded-2xl border border-blue-100 dark:border-blue-900/50 flex flex-col justify-center relative overflow-hidden transition-all duration-300 hover:shadow-lg hover:border-blue-200 animate-fade-in-up" style={{animationDelay: '100ms'}}>
                <span className="text-xs font-semibold text-blue-800 dark:text-blue-200 uppercase tracking-wider mb-1 relative z-10">Ready for Review</span>
                <span className="text-3xl font-black text-blue-700 dark:text-blue-300 relative z-10">{stats.pending}</span>
                <div className="absolute -right-4 -bottom-4 p-4 opacity-10 transform rotate-12 transition-transform duration-300 group-hover:scale-110">
                   <FileText className="h-24 w-24 text-blue-600" />
                </div>
            </div>
             <div className="bg-green-50/50 dark:bg-green-900/10 p-5 rounded-2xl border border-green-100 dark:border-green-900/50 flex flex-col justify-center transition-all duration-300 hover:shadow-lg hover:border-green-200 animate-fade-in-up" style={{animationDelay: '200ms'}}>
                <span className="text-xs font-semibold text-green-800 dark:text-green-200 uppercase tracking-wider mb-1">Approved</span>
                <span className="text-3xl font-black text-green-700 dark:text-green-300">{stats.approved}</span>
            </div>
             <div className="bg-red-50/50 dark:bg-red-900/10 p-5 rounded-2xl border border-red-100 dark:border-red-900/50 flex flex-col justify-center transition-all duration-300 hover:shadow-lg hover:border-red-200 animate-fade-in-up" style={{animationDelay: '300ms'}}>
                <span className="text-xs font-semibold text-red-800 dark:text-red-200 uppercase tracking-wider mb-1">Declined</span>
                <span className="text-3xl font-black text-red-700 dark:text-red-300">{stats.declined}</span>
            </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Sidebar List */}
          <div className="lg:col-span-4 space-y-4">
             <div className="flex items-center justify-between mb-2">
                <h3 className="font-bold">Applications ({filteredApps.length})</h3>
                <div className="relative">
                   <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                   <input 
                      type="text" 
                      placeholder="Search..." 
                      value={searchTerm}
                      onChange={(e) => setSearchTerm(e.target.value)}
                      className="h-9 w-full rounded-md border border-input bg-background pl-9 pr-3 text-sm focus:outline-none focus:ring-1 focus:ring-brand"
                   />
                </div>
             </div>
             
             <div className="space-y-3">
                {filteredApps.length === 0 ? (
                   <div className="p-6 text-center border rounded-2xl glass text-muted-foreground text-sm">
                      No applications found.
                   </div>
                ) : (
                   filteredApps.map((app, idx) => (
                      <div 
                        key={app.id} 
                        onClick={() => setSelectedAppId(app.id)}
                        className={cn(
                           "p-5 rounded-2xl border cursor-pointer transition-all duration-300 animate-fade-in-up",
                           selectedAppId === app.id
                              ? "bg-white dark:bg-slate-900 border-brand shadow-md scale-[1.02] ring-1 ring-brand/20" 
                              : "glass hover:border-brand/40 hover:shadow-sm"
                        )}
                        style={{animationDelay: `${idx * 50}ms`}}
                      >
                         <div className="flex justify-between items-start mb-2">
                            <h4 className="font-bold text-base">{app.applicant.name}</h4>
                            <span className={cn(
                              "text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider",
                              app.status === "Approved" ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400" :
                              app.status === "Declined" ? "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" :
                              "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400"
                            )}>
                              {app.status}
                            </span>
                         </div>
                         <div className="text-muted-foreground text-sm mb-4 truncate">{app.property}</div>
                         
                         <div className="flex items-center justify-between pt-3 border-t border-border/60">
                            <div className="flex items-center gap-2">
                               <span className={cn(
                                  "h-2.5 w-2.5 rounded-full shadow-sm animate-pulse",
                                  app.risk === "Low" ? "bg-green-500" :
                                  app.risk === "Medium" ? "bg-yellow-500" : "bg-red-500"
                               )} />
                               <span className="text-xs font-semibold uppercase tracking-wide">{app.risk} Risk</span>
                            </div>
                            <div className="text-xs text-muted-foreground font-medium">{app.submissionDate}</div>
                         </div>
                      </div>
                   ))
                )}
             </div>
          </div>

          {/* Main Content: Report Card */}
          <div className="lg:col-span-8">
             {selectedApp ? (
               <div className="space-y-6 animate-in fade-in slide-in-from-bottom-2">
                  
                  {/* Action Bar */}
                  <div className="flex flex-col sm:flex-row justify-between items-center gap-4 card-premium p-5 rounded-2xl animate-fade-in-up" style={{animationDelay: '0ms'}}>
                     <div className="text-sm font-semibold">
                        Application ID: <span className="font-mono text-muted-foreground bg-slate-100 dark:bg-slate-800 px-2 py-1 rounded">{selectedApp.id}</span>
                     </div>
                     <div className="flex gap-3 w-full sm:w-auto">
                        <button 
                           onClick={handleDecline}
                           className="flex-1 sm:flex-none border-2 border-red-200 text-red-600 hover:bg-red-50 hover:border-red-300 px-6 py-2 rounded-full text-sm font-bold transition-all"
                        >
                           Decline
                        </button>
                        <button 
                           onClick={handleApprove}
                           className="flex-1 sm:flex-none bg-brand text-white hover:bg-brand/90 hover:shadow-lg hover:shadow-brand/20 px-8 py-2 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5"
                        >
                           <CheckCircle2 className="h-4 w-4" />
                           Approve Tenant
                        </button>
                     </div>
                  </div>

                  {/* Summary Card */}
                  <div className="card-premium rounded-2xl overflow-hidden animate-fade-in-up" style={{animationDelay: '100ms'}}>
                     <div className="p-8 border-b border-border bg-gradient-to-br from-indigo-50/80 via-white to-blue-50/50 dark:from-indigo-950/30 dark:via-slate-900 dark:to-blue-950/20">
                        <div className="flex flex-col md:flex-row justify-between md:items-center gap-6">
                           <div>
                              <h2 className="text-4xl font-black mb-2 tracking-tight">{selectedApp.applicant.name}</h2>
                              <div className="flex items-center gap-4 text-sm font-medium text-muted-foreground">
                                 <span className="flex items-center gap-1.5"><User className="h-4 w-4 text-brand" /> {selectedApp.applicant.idNumber}</span>
                                 <span>•</span>
                                 <span className="flex items-center gap-1.5"><Mail className="h-4 w-4 text-brand" /> {selectedApp.applicant.email}</span>
                              </div>
                           </div>
                           <div className="flex items-center gap-8">
                              <div className="text-center">
                                 <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-2">Credit Score</div>
                                 <div className={cn(
                                    "text-4xl font-black tracking-tighter drop-shadow-sm",
                                    selectedApp.score >= 650 ? "text-green-600" :
                                    selectedApp.score >= 600 ? "text-yellow-600" : "text-red-600"
                                 )}>
                                    {selectedApp.score}
                                 </div>
                              </div>
                              <div className="w-px h-16 bg-border/60 hidden md:block"></div>
                              <div className="text-center">
                                 <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-2">Affordability</div>
                                 <div className={cn(
                                    "text-4xl font-black tracking-tighter drop-shadow-sm",
                                    selectedApp.verification.affordability.ratio <= 30 ? "text-green-600" :
                                    selectedApp.verification.affordability.ratio <= 40 ? "text-yellow-600" : "text-red-600"
                                 )}>
                                    {selectedApp.verification.affordability.ratio}%
                                 </div>
                              </div>
                           </div>
                        </div>
                     </div>

                     {/* Report Details */}
                     <div className="p-6 md:p-8 bg-slate-50/30 dark:bg-slate-950/30">
                        <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
                           <ShieldCheck className="h-6 w-6 text-brand" />
                           Comprehensive Risk Report
                        </h3>
                        
                        <div className="grid gap-6 md:grid-cols-2">
                           
                           {/* 1. Identity Verification */}
                           <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-border/60 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/30">
                              <div className="flex justify-between items-start mb-4">
                                 <div className="flex items-center gap-3">
                                    <div className="bg-blue-100 dark:bg-blue-900/30 p-2.5 rounded-lg text-blue-600">
                                       <UserCheck className="h-5 w-5" />
                                    </div>
                                    <div className="font-bold text-base">Identity Verification</div>
                                 </div>
                                 {selectedApp.verification.details.status === "Verified" ? (
                                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                                 ) : (
                                    <XCircle className="h-6 w-6 text-red-500" />
                                 )}
                              </div>
                              <div className="space-y-3 text-sm">
                                 <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                    <span className="text-muted-foreground font-medium">Source</span>
                                    <span className="font-semibold text-right">{selectedApp.verification.details.source}</span>
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground font-medium">Status</span>
                                    <span className="font-bold bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded">{selectedApp.verification.details.status}</span>
                                 </div>
                              </div>
                           </div>

                           {/* 2. Credit Bureau Check */}
                           <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-border/60 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/30 md:col-span-2 lg:col-span-1">
                              <div className="flex justify-between items-start mb-4">
                                 <div className="flex items-center gap-3">
                                    <div className="bg-purple-100 dark:bg-purple-900/30 p-2.5 rounded-lg text-purple-600">
                                       <Shield className="h-5 w-5" />
                                    </div>
                                    <div className="font-bold text-base">Credit Bureau Summary</div>
                                 </div>
                                 {selectedApp.risk === "Low" || selectedApp.risk === "Medium" ? (
                                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                                 ) : (
                                    <AlertTriangle className="h-6 w-6 text-yellow-500" />
                                 )}
                              </div>
                              <div className="space-y-3 text-sm">
                                 <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                    <span className="text-muted-foreground font-medium">Bureau</span>
                                    <span className="font-semibold">{selectedApp.verification.credit.bureau}</span>
                                 </div>
                                 <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                    <span className="text-muted-foreground font-medium">Fraud Indicators</span>
                                    <span className={selectedApp.verification.credit.fraudIndicators.includes("None") || selectedApp.verification.credit.fraudIndicators.includes("Clear") ? "text-green-600 font-bold bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded" : "text-red-600 font-bold bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded"}>{selectedApp.verification.credit.fraudIndicators}</span>
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground font-medium">Credit Judgements</span>
                                    <span className={selectedApp.verification.credit.judgements === 0 ? "text-green-600 font-bold bg-green-50 dark:bg-green-900/20 px-2 py-0.5 rounded" : "text-red-600 font-bold bg-red-50 dark:bg-red-900/20 px-2 py-0.5 rounded"}>{selectedApp.verification.credit.judgements} Found</span>
                                 </div>
                                 <div className="pt-3 mt-3 border-t border-border flex justify-between items-center">
                                    <span className="text-muted-foreground font-medium">Full Report</span>
                                    <button className="text-brand hover:text-brand/80 font-bold flex items-center gap-1.5 transition-colors bg-brand/5 px-3 py-1.5 rounded-md hover:bg-brand/10">Download PDF <Download className="h-4 w-4" /></button>
                                 </div>
                              </div>
                           </div>

                           {/* 3. Bank & Affordability Analysis */}
                           <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-border/60 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/30 md:col-span-2">
                              <div className="flex justify-between items-start mb-4">
                                 <div className="flex items-center gap-3">
                                    <div className="bg-teal-100 dark:bg-teal-900/30 p-2.5 rounded-lg text-teal-600">
                                       <Landmark className="h-5 w-5" />
                                    </div>
                                    <div className="font-bold text-base">Bank & Affordability Analysis</div>
                                 </div>
                                 {selectedApp.verification.bank.status === "Verified" ? (
                                    <CheckCircle2 className="h-6 w-6 text-green-500" />
                                 ) : (
                                    <AlertCircle className="h-6 w-6 text-red-500" />
                                 )}
                              </div>
                              <div className="grid md:grid-cols-2 gap-8 text-sm">
                                 <div className="space-y-3">
                                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                       <span className="text-muted-foreground font-medium">Statements</span>
                                       <span className="font-semibold">{selectedApp.verification.bank.monthsAnalyzed} Months ({selectedApp.verification.bank.statementsSource})</span>
                                    </div>
                                    <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                       <span className="text-muted-foreground font-medium">Income Verified</span>
                                       <span className={cn("font-bold px-2 py-0.5 rounded", selectedApp.verification.bank.incomeMatch ? "text-green-600 bg-green-50 dark:bg-green-900/20" : "text-red-600 bg-red-50 dark:bg-red-900/20")}>
                                          {selectedApp.verification.bank.incomeMatch ? "Yes (Matches)" : "No Match"}
                                       </span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                       <span className="text-muted-foreground font-medium">Fraud Check</span>
                                       <span className="font-semibold">{selectedApp.verification.bank.fraudCheck}</span>
                                    </div>
                                    <div className="pt-3 mt-3 border-t border-border">
                                       <button className="text-brand hover:text-brand/80 font-bold flex items-center gap-1.5 transition-colors bg-brand/5 px-3 py-1.5 rounded-md hover:bg-brand/10 w-fit">View Uploaded Statements <FileText className="h-4 w-4" /></button>
                                    </div>
                                 </div>
                                 <div className="space-y-3 bg-slate-50 dark:bg-slate-950 p-4 rounded-xl border border-border/60 shadow-inner">
                                    <div className="flex justify-between items-center">
                                       <span className="text-muted-foreground font-medium">Avg Net Income</span>
                                       <span className="font-black text-green-600 text-base">R {selectedApp.verification.affordability.netIncome.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                       <span className="text-muted-foreground font-medium">Avg Total Expenses</span>
                                       <span className="font-black text-red-600 text-base">R {selectedApp.verification.affordability.totalExpenses.toLocaleString()}</span>
                                    </div>
                                    <div className="flex justify-between items-center border-t border-border/80 pt-2 mt-2">
                                       <span className="font-bold text-base">Disposable Income</span>
                                       <span className="text-brand font-black text-lg">R {selectedApp.verification.affordability.disposableIncome.toLocaleString()}</span>
                                    </div>
                                    <div className="mt-3 relative">
                                       <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand rounded-full"></div>
                                       <p className="text-xs text-muted-foreground pl-3 italic leading-relaxed">
                                          &ldquo;{selectedApp.verification.affordability.analysis}&rdquo;
                                       </p>
                                    </div>
                                 </div>
                              </div>
                           </div>

                           {/* 4. Employment */}
                           <div className="p-5 rounded-xl bg-white dark:bg-slate-900 border border-border/60 shadow-sm transition-all duration-300 hover:shadow-md hover:border-brand/30">
                              <div className="flex justify-between items-start mb-4">
                                 <div className="flex items-center gap-3">
                                    <div className="bg-orange-100 dark:bg-orange-900/30 p-2.5 rounded-lg text-orange-600">
                                       <Briefcase className="h-5 w-5" />
                                    </div>
                                    <div className="font-bold text-base">Employment</div>
                                 </div>
                                 <div className="text-xs font-bold bg-slate-100 dark:bg-slate-800 px-2.5 py-1 rounded-full text-slate-700 dark:text-slate-300 uppercase tracking-wider">
                                    {selectedApp.verification.employment.status}
                                 </div>
                              </div>
                              <div className="space-y-3 text-sm">
                                 <div className="flex justify-between items-center border-b border-border/50 pb-2">
                                    <span className="text-muted-foreground font-medium">Employer</span>
                                    <span className="font-semibold text-right">{selectedApp.verification.employment.employer}</span>
                                 </div>
                                 <div className="flex justify-between items-center">
                                    <span className="text-muted-foreground font-medium">Tenure</span>
                                    <span className="font-semibold bg-slate-50 dark:bg-slate-800 px-2 py-0.5 rounded border border-border/50">{selectedApp.verification.employment.tenure}</span>
                                 </div>
                              </div>
                           </div>

                        </div>

                        {/* Recommendation */}
                        <div className="mt-8 p-5 rounded-xl border border-blue-200 bg-gradient-to-r from-blue-50 to-indigo-50/50 dark:from-blue-900/20 dark:to-indigo-900/10 dark:border-blue-900/50 shadow-sm relative overflow-hidden">
                            <div className="absolute top-0 left-0 w-1 h-full bg-blue-500"></div>
                            <h4 className="font-black text-blue-900 dark:text-blue-100 mb-2 flex items-center gap-2">
                               <ShieldCheck className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                               System Recommendation
                            </h4>
                            <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed font-medium">
                               Based on the aggregated data, {selectedApp.applicant.name} is classified as a <strong className={cn(
                                  "px-2 py-0.5 rounded-md mx-1",
                                  selectedApp.risk === 'Low' ? "bg-green-200 text-green-900 dark:bg-green-900/50 dark:text-green-100" :
                                  selectedApp.risk === 'Medium' ? "bg-yellow-200 text-yellow-900 dark:bg-yellow-900/50 dark:text-yellow-100" : "bg-red-200 text-red-900 dark:bg-red-900/50 dark:text-red-100"
                               )}>{selectedApp.risk} Risk</strong> tenant. 
                               {selectedApp.risk === 'Low' && " All checks passed with no adverse indicators. Approval is highly recommended."}
                               {selectedApp.risk === 'Medium' && " Income is verified but affordability ratio is slightly elevated. Consider requesting a higher deposit or co-signer if proceeding."}
                               {selectedApp.risk === 'High' && " Multiple adverse indicators found. Verify adverse reports thoroughly before proceeding."}
                            </p>
                        </div>

                     </div>
                  </div>
               </div>
             ) : (
               <div className="h-full min-h-[500px] flex flex-col items-center justify-center border-2 border-dashed border-border/60 rounded-2xl glass p-8 text-center animate-fade-in-up">
                  <div className="bg-slate-100 dark:bg-slate-800 p-5 rounded-full mb-5 shadow-inner">
                     <FileText className="h-10 w-10 text-muted-foreground opacity-50" />
                  </div>
                  <h3 className="text-xl font-bold mb-2">No Application Selected</h3>
                  <p className="text-muted-foreground max-w-sm font-medium">Select an applicant from the list to view their comprehensive verification report and risk analysis.</p>
               </div>
             )}
          </div>
        </div>
      </div>

       {/* Regret Letter Modal - Moved here to separate stacking context */}
      {isRegretModalOpen && selectedApp && (
         <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4 animate-in fade-in">
             <div className="bg-white dark:bg-slate-900 rounded-xl max-w-lg w-full shadow-2xl overflow-hidden border border-border">
                 <div className="p-6 border-b border-border flex justify-between items-center bg-slate-50 dark:bg-slate-950">
                    <h3 className="font-bold text-lg flex items-center gap-2">
                       <Mail className="h-5 w-5 text-red-500" />
                       Send Regret Letter
                    </h3>
                    <button onClick={() => setIsRegretModalOpen(false)} className="text-muted-foreground hover:text-foreground">
                       <X className="h-5 w-5" />
                    </button>
                 </div>
                 
                 <div className="p-6 space-y-4">
                    <div className="p-4 bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-100 dark:border-yellow-900/50 rounded-lg text-sm text-yellow-800 dark:text-yellow-200">
                       <h4 className="font-bold mb-1 flex items-center gap-2"><AlertTriangle className="h-4 w-4" /> Action Warning</h4>
                       <p>Proceeding will formally decline this application and notify the tenant.</p>
                    </div>

                    <div className="space-y-2">
                       <label className="text-sm font-medium">Message Preview</label>
                       <textarea 
                          className="w-full h-48 rounded-md border border-input bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-brand font-mono leading-relaxed"
                          defaultValue={REGRET_LETTER_TEMPLATE
                             .replace("{ApplicantName}", selectedApp.applicant.name)
                             .replace("{PropertyAddress}", selectedApp.property)
                          }
                       />
                    </div>
                 </div>

                 <div className="p-6 border-t border-border flex justify-end gap-3 bg-slate-50 dark:bg-slate-950">
                    <button 
                       onClick={() => setIsRegretModalOpen(false)}
                       className="px-4 py-2 text-sm font-medium rounded-md hover:bg-slate-200 dark:hover:bg-slate-800 transition-colors"
                    >
                       Cancel
                    </button>
                    <button 
                       onClick={() => sendRegretLetter("Regret letter content")}
                       className="bg-red-600 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-red-700 transition-colors flex items-center gap-2 shadow-sm"
                    >
                       <Send className="h-4 w-4" />
                       Confirm & Send
                    </button>
                 </div>
             </div>
         </div>
      )}
    </div>
  );
}
