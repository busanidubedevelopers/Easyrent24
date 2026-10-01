"use client";

import { useRouter } from "next/navigation";
import { useState, useEffect } from "react";
import { db } from "@/lib/apiClient";
import { 

  AlertTriangle, 

  Check, 
  CheckCircle2, 

  FileText,

  Mail,
  Search, 
  Send,


  User,

  X,

} from "lucide-react";
import { cn } from "@/lib/utils";
import { VerificationPanel } from "@/components/VerificationPanel";

interface PropertyCatalogItem {
  id: string;
  title: string;
  address: string;
  price: number | string | null;
  status: string;
  property_type?: string | null;
  landlord_id?: string;
  created_at?: string;
}

interface Application {
  id: string;
  property_id?: string | null;
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
}

export default function ApplicationsPage() {
  const router = useRouter();
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  const [isLoading, setIsLoading] = useState(true);
  const [applications, setApplications] = useState<Application[]>([]);
  const [properties, setProperties] = useState<PropertyCatalogItem[]>([]);
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
        const { data: authData, error: authError } = await db.auth.getUser();

        const [propertiesRes, applicationsRes] = await Promise.all([
          fetch('/api/properties?limit=50'),
          authError || !authData?.user ? Promise.resolve(null) : fetch('/api/applications')
        ]);

        const propertyData = propertiesRes.ok ? ((await propertiesRes.json()) as { properties?: PropertyCatalogItem[] }).properties ?? [] : [];
        setProperties(propertyData);

        let dbApps: Application[] = [];

        if (applicationsRes && applicationsRes.ok) {
          const payload = (await applicationsRes.json()) as { applications?: Array<Record<string, unknown>> };
          const applicationRows = payload.applications ?? [];

          dbApps = applicationRows.map((item: Record<string, unknown>) => {
            const property = propertyData.find((entry) => entry.id === item.property_id);
            const score = Number(item.risk_score ?? 650);
            let risk = String(item.risk_level ?? 'unknown');
            if (risk === 'unknown') {
              risk = score >= 650 ? 'Low' : score >= 600 ? 'Medium' : 'High';
            }
            const displayStatus = String(item.status ?? 'pending')
              .replace(/_/g, ' ')
              .replace(/\b\w/g, (char) => char.toUpperCase());

            return {
              id: String(item.id ?? crypto.randomUUID()),
              property_id: typeof item.property_id === 'string' ? item.property_id : null,
              // Assessed below (via POST .../assess) whenever the DB hasn't scored
              // this application yet — this flag decides which ones get assessed.
              _unassessed: item.risk_score === null || item.risk_score === undefined,
              applicant: {
                name: `${String(item.first_name ?? '')} ${String(item.last_name ?? '')}`.trim() || 'Unknown Applicant',
                idNumber: String(item.id_number ?? 'N/A'),
                email: String(item.email ?? ''),
                phone: String(item.phone ?? ''),
              },
              property: property?.title || property?.address || 'Unknown Property',
              status:
                displayStatus === 'Pending' || displayStatus === 'Reviewing'
                  ? 'Ready for Review'
                  : displayStatus === 'Approved'
                    ? 'Approved'
                    : displayStatus === 'Declined'
                      ? 'Declined'
                      : displayStatus,
              score,
              risk: risk.charAt(0).toUpperCase() + risk.slice(1),
              submissionDate: item.created_at ? new Date(String(item.created_at)).toISOString().split('T')[0] : 'N/A',
            };
          });

          // Run the real risk assessment (backend/lib/creditCheck.ts — SA ID
          // validation + rent/income affordability) for any application the DB
          // hasn't scored yet, so the console shows the live applicant's actual
          // numbers rather than the pre-assessment placeholder above. Runs
          // silently in parallel; a failure just leaves that row on the
          // placeholder rather than blocking the page.
          const toAssess = dbApps.filter((app) => (app as unknown as { _unassessed?: boolean })._unassessed);
          if (toAssess.length > 0) {
            const assessedById = new Map<string, { application: Record<string, unknown>; assessment: { risk: { riskScore: number; riskLevel: string } } }>();
            await Promise.all(
              toAssess.map(async (app) => {
                try {
                  const res = await fetch(`/api/applications/${app.id}/assess`, { method: 'POST' });
                  if (res.ok) {
                    assessedById.set(app.id, await res.json());
                  }
                } catch (err) {
                  console.error(`Assessment failed for application ${app.id}:`, err);
                }
              })
            );

            if (assessedById.size > 0) {
              dbApps = dbApps.map((app) => {
                const result = assessedById.get(app.id);
                if (!result) return app;

                // Document-based checks (ID, income, affordability) live in the
                // VerificationPanel; only the credit risk score comes from here.
                const { riskScore, riskLevel } = result.assessment.risk;

                return {
                  ...app,
                  score: riskScore,
                  risk: riskLevel.charAt(0).toUpperCase() + riskLevel.slice(1),
                };
              });
            }
          }
        }

        setApplications(dbApps);
        if (dbApps.length > 0) {
          setSelectedAppId(dbApps[0].id);
        }
      } catch (err) {
        console.error('Error fetching applications:', err);
      } finally {
        setIsLoading(false);
      }
    }

    fetchApplications();
  }, []);

  // Key Stats
  const stats = {
    total: applications.length,
    pending: applications.filter(a => a.status === 'Ready for Review').length,
    approved: applications.filter(a => a.status === 'Approved').length,
    declined: applications.filter(a => a.status === 'Declined').length,
  };

  const filteredApps = applications.filter(app =>
    app.applicant.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    app.property.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const filteredProperties = properties.filter(property =>
    property.title?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    property.address?.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (property.property_type ?? '').toLowerCase().includes(searchTerm.toLowerCase())
  );

  const selectedApp = applications.find(a => a.id === selectedAppId);

  // Approval happens when the landlord sends the lease (/applications/lease/[id]),
  // after setting the terms — the send step also enforces the paid application fee.
  const handleApprove = () => {
    if (selectedApp) router.push(`/applications/lease/${selectedApp.id}`);
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
      <div className="bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-b border-border pt-20 pb-12 relative overflow-hidden">
         <div className="absolute inset-0 bg-gradient-to-r from-brand/5 to-indigo-400/5 dark:from-brand/10 dark:to-indigo-400/10 pointer-events-none" />
         <div className="container mx-auto px-4 relative z-10">
            <h1 className="text-4xl font-extrabold tracking-tight mb-2 text-gradient">Tenant Applications</h1>
            <p className="text-muted-foreground text-lg">Review each applicant’s due diligence, affordability and documents before you decide.</p>
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
                   filteredProperties.length > 0 ? (
                     <div className="space-y-3">
                       <div className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground px-1">Property catalog</div>
                       {filteredProperties.slice(0, 6).map((property) => (
                         <div key={property.id} className="p-4 rounded-2xl border border-border/80 bg-white dark:bg-slate-900 shadow-sm">
                           <div className="flex items-start justify-between gap-3 mb-2">
                             <div>
                               <h4 className="font-bold text-base">{property.title}</h4>
                               <div className="text-sm text-muted-foreground mt-1">{property.address}</div>
                             </div>
                             <span className="text-[10px] font-black px-2 py-1 rounded-full uppercase tracking-wider bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300">
                               {property.status}
                             </span>
                           </div>
                           <div className="flex items-center justify-between text-sm">
                             <span className="font-semibold text-brand">R {Number(property.price ?? 0).toLocaleString()}</span>
                             <span className="text-muted-foreground">{property.property_type ?? 'Property'}</span>
                           </div>
                         </div>
                       ))}
                     </div>
                   ) : (
                     <div className="p-6 text-center border rounded-2xl glass text-muted-foreground text-sm">
                       No applications or properties found.
                     </div>
                   )
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
                           className="flex-1 sm:flex-none bg-brand text-white hover:bg-gold-600 hover:shadow-lg hover:shadow-brand/20 px-8 py-2 rounded-full text-sm font-bold transition-all flex items-center justify-center gap-2 hover:-translate-y-0.5"
                        >
                           <CheckCircle2 className="h-4 w-4" />
                           Approve &amp; Generate Lease
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
                                 <div className="text-xs text-muted-foreground uppercase tracking-widest font-bold mb-2" title="EasyRent's own estimate from affordability. Not a credit bureau score.">Risk score</div>
                                 <div className={cn(
                                    "text-4xl font-black tracking-tighter drop-shadow-sm",
                                    selectedApp.score >= 650 ? "text-green-600" :
                                    selectedApp.score >= 600 ? "text-yellow-600" : "text-red-600"
                                 )}>
                                    {selectedApp.score}
                                 </div>
                                 <div className="mt-1 text-[10px] text-muted-foreground">Estimate, not a credit bureau score</div>
                              </div>
                           </div>
                        </div>
                     </div>

                     <div className="p-6 md:p-8 bg-slate-50/30 dark:bg-slate-950/30">
                        <VerificationPanel applicationId={selectedApp.id} />
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
