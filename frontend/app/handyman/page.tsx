"use client";

import { useState, useEffect } from "react";
import Image from "next/image";
import { Search, Plus, MapPin, Clock, Filter, ArrowRight } from "lucide-react";
import Link from "next/link";
import { cn } from "@/lib/utils";

interface HandymanItem {
  id: string;
  title: string;
  category: string;
  location: string;
  budget: string;
  posted: string;
  status: string;
  image: string;
}

interface HandymanProfile {
  id?: string;
  full_name?: string | null;
  role?: string;
  services_offered?: string[];
  experience_years?: number;
  certifications?: string[];
  phone?: string | null;
}

interface AssignedTicket {
  id: string;
  title: string;
  description: string;
  priority: "low" | "medium" | "high" | "emergency";
  status: "pending" | "in_progress" | "resolved" | "closed";
  created_at: string;
}

export default function HandymanDashboard() {
  const [activeTab, setActiveTab] = useState("client");
  const [jobs, setJobs] = useState<HandymanItem[]>([]);
  const [profile, setProfile] = useState<HandymanProfile | null>(null);
  const [assignedTickets, setAssignedTickets] = useState<AssignedTicket[]>([]);
  const [resolvingTicketId, setResolvingTicketId] = useState<string | null>(null);

  useEffect(() => {
    async function loadDashboard() {
      try {
        const [meRes, jobsRes, maintenanceRes] = await Promise.all([
          fetch('/api/auth/me', { credentials: 'include' }),
          fetch('/api/handyman/jobs', { credentials: 'include' }),
          fetch('/api/maintenance', { credentials: 'include' }),
        ]);

        if (meRes.ok) {
          const meJson = await meRes.json();
          const nextProfile = meJson.profile ?? null;
          setProfile(nextProfile);
          if (nextProfile?.role === 'handyman') {
            setActiveTab('provider');
          }
        }

        if (jobsRes.ok) {
          const json = await jobsRes.json();
          const data: any[] = json.jobs ?? [];
          setJobs(data.map((job: any) => ({
             id: job.id,
             title: job.title,
             category: job.category || 'General',
             location: job.location,
             budget: job.budget_range || 'TBD',
             posted: new Date(job.created_at).toLocaleDateString(),
             status: job.status,
             image: (job.images && job.images.length > 0) ? job.images[0] : "/images/handyman-tools.png"
          })));
        } else {
          setJobs([]);
        }

        if (maintenanceRes.ok) {
          const json = await maintenanceRes.json();
          setAssignedTickets(json.requests ?? []);
        } else {
          setAssignedTickets([]);
        }
      } catch (err) {
        console.error('Error loading handyman dashboard:', err);
        setJobs([]);
        setAssignedTickets([]);
      }
    }
    loadDashboard();
  }, []);

  const markTicketResolved = async (ticketId: string) => {
    setResolvingTicketId(ticketId);
    try {
      const res = await fetch(`/api/maintenance/${ticketId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ status: 'resolved' }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Failed to update ticket');
      }

      setAssignedTickets(prev => prev.map(t => (t.id === ticketId ? { ...t, status: 'resolved' } : t)));
    } catch (err) {
      console.error('Error resolving ticket:', err);
      alert(`Failed to mark resolved: ${err instanceof Error ? err.message : 'Unknown error'}`);
    } finally {
      setResolvingTicketId(null);
    }
  };

  return (
    <div className="container pt-20 pb-8 md:pb-12">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Handyman Services</h1>
          <p className="text-muted-foreground mt-1">Manage your requests or find work in your area.</p>
        </div>
        
        <div className="flex gap-2 bg-muted p-1 rounded-lg">
           <button 
             onClick={() => setActiveTab("client")}
             className={cn("px-4 py-2 text-sm font-medium rounded-md transition-all", activeTab === "client" ? "bg-white text-black shadow" : "text-muted-foreground hover:text-foreground")}
           >
             I need a Service
           </button>
           <button 
             onClick={() => setActiveTab("provider")}
             className={cn("px-4 py-2 text-sm font-medium rounded-md transition-all", activeTab === "provider" ? "bg-white text-black shadow" : "text-muted-foreground hover:text-foreground")}
           >
             I&apos;m a Pro
           </button>
        </div>
      </div>

      {activeTab === "client" ? (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
           {/* CTA */}
           <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-8 md:p-12 text-white shadow-xl group">
              {/* Background Image with Overlay */}
              <div 
                className="absolute inset-0 bg-[url('/images/handyman-tools.png')] bg-cover bg-center opacity-40 transition-transform duration-700 group-hover:scale-105"
                aria-hidden="true"
              />
              <div className="absolute inset-0 bg-gradient-to-r from-blue-900/90 to-blue-800/75" />

              <div className="relative z-10 max-w-2xl">
                 <h2 className="text-2xl font-bold md:text-3xl mb-4">Need something fixed or cleaned?</h2>
                 <p className="text-blue-100 mb-8 max-w-lg">
                    Post a job description, get verified bids within minutes, and pay securely only when the work is done.
                 </p>
                 <Link 
                   href="/handyman/request" 
                   className="inline-flex items-center justify-center rounded-full bg-white px-6 py-3 text-sm font-bold text-blue-600 shadow-lg hover:bg-blue-50 transition-colors"
                 >
                    <Plus className="mr-2 h-4 w-4" />
                    Post a New Job
                 </Link>
              </div>
           </div>
           
           {/* My Requests */}
           <div>
              <div className="flex items-center justify-between mb-4">
                 <h3 className="font-semibold text-xl">Your Active Requests</h3>
                 <Link href="#" className="text-sm text-brand hover:underline">View All</Link>
              </div>
              
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                 {jobs.map((job) => (
                    <Link key={job.id} href={`/handyman/job/${job.id}`} className="block group">
                       <div className="rounded-xl border border-border bg-card overflow-hidden transition-all hover:border-brand/50 hover:shadow-md h-full flex flex-col">
                          {/* Image Header */}
                          <div className="relative h-40 w-full bg-muted">
                            <Image 
                              src={job.image} 
                              alt={job.title} 
                              fill 
                              className="object-cover transition-transform duration-500 group-hover:scale-110"
                            />
                            <div className="absolute top-3 right-3">
                                <span className={cn(
                                   "px-2.5 py-1 rounded-full text-xs font-bold uppercase tracking-wider shadow-sm backdrop-blur-md",
                                   job.status === "open" ? "bg-green-500/90 text-white" : "bg-blue-500/90 text-white"
                                )}>
                                   {job.status.replace("_", " ")}
                                </span>
                            </div>
                          </div>

                          <div className="p-5 flex flex-col flex-1">
                             <div className="flex justify-between items-start mb-2">
                                <span className="inline-flex items-center rounded-full bg-secondary px-2.5 py-0.5 text-xs font-medium text-secondary-foreground">
                                   {job.category}
                                </span>
                             </div>
                             <h4 className="font-bold text-lg mb-2 group-hover:text-brand transition-colors line-clamp-1">{job.title}</h4>
                             <div className="flex items-center text-sm text-muted-foreground mb-4">
                                <MapPin className="h-3.5 w-3.5 mr-1" /> {job.location}
                                <span className="mx-2">•</span>
                                <Clock className="h-3.5 w-3.5 mr-1" /> {job.posted}
                             </div>
                             <div className="flex items-center justify-between border-t border-border pt-4 mt-auto">
                                <span className="font-semibold text-sm">{job.budget}</span>
                                <span className="text-xs text-muted-foreground flex items-center group-hover:translate-x-1 transition-transform">
                                   View Details <ArrowRight className="ml-1 h-3 w-3" />
                                </span>
                             </div>
                          </div>
                       </div>
                    </Link>
                 ))}
                 
                 {/* New placeholder card */}
                 <Link href="/handyman/request" className="block h-full">
                    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-muted-foreground/30 bg-muted/20 p-5 h-full min-h-[300px] hover:bg-muted/30 transition-colors">
                       <div className="h-14 w-14 rounded-full bg-background border flex items-center justify-center mb-4 shadow-sm">
                          <Plus className="h-6 w-6 text-muted-foreground" />
                       </div>
                       <span className="font-medium text-lg text-muted-foreground">Create New Request</span>
                    </div>
                 </Link>
              </div>
           </div>
        </div>
      ) : (
        <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
           <div className="rounded-2xl border border-indigo-200 bg-gradient-to-r from-indigo-50 to-white p-5 shadow-sm dark:border-indigo-500/30 dark:from-slate-900 dark:to-slate-950">
             <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
               <div>
                 <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-600 dark:text-indigo-400">Service provider</p>
                 <h3 className="mt-2 text-2xl font-bold text-slate-900 dark:text-white">{profile?.full_name || 'Professional Handyman'}</h3>
               </div>
               <div className="rounded-full bg-indigo-600 px-3 py-1 text-sm font-semibold text-white">
                 {profile?.role === 'handyman' ? 'Available' : 'Provider'}
               </div>
             </div>

             <div className="mt-4 grid gap-3 md:grid-cols-3">
               <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                 <p className="text-xs uppercase tracking-wide text-slate-500">Services</p>
                 <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                   {(profile?.services_offered && profile.services_offered.length > 0)
                     ? profile.services_offered.join(', ')
                     : 'General maintenance'}
                 </p>
               </div>
               <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                 <p className="text-xs uppercase tracking-wide text-slate-500">Experience</p>
                 <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                   {profile?.experience_years ? `${profile.experience_years} years` : 'New provider'}
                 </p>
               </div>
               <div className="rounded-xl border border-slate-200 bg-white p-3 dark:border-slate-700 dark:bg-slate-900">
                 <p className="text-xs uppercase tracking-wide text-slate-500">Certifications</p>
                 <p className="mt-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                   {(profile?.certifications && profile.certifications.length > 0)
                     ? profile.certifications.join(', ')
                     : 'Not added yet'}
                 </p>
               </div>
             </div>
           </div>

           {/* Assigned Maintenance Tickets — landlord assigned these directly, no bidding involved */}
           {assignedTickets.length > 0 && (
             <div>
               <h3 className="font-semibold text-xl mb-4">Assigned to You</h3>
               <div className="grid gap-4">
                 {assignedTickets.map(ticket => (
                   <div key={ticket.id} className="flex flex-col md:flex-row gap-4 rounded-xl border border-border bg-card p-4">
                     <div className="flex-1">
                       <div className="flex items-center gap-2 mb-1">
                         <h4 className="font-bold text-lg">{ticket.title}</h4>
                         <span className={cn(
                           "px-2.5 py-0.5 rounded-full text-xs font-bold uppercase",
                           ticket.priority === 'emergency' ? 'bg-red-100 text-red-800' :
                           ticket.priority === 'high' ? 'bg-orange-100 text-orange-800' :
                           ticket.priority === 'medium' ? 'bg-yellow-100 text-yellow-800' :
                           'bg-blue-100 text-blue-800'
                         )}>
                           {ticket.priority}
                         </span>
                       </div>
                       <p className="text-sm text-muted-foreground line-clamp-2 max-w-2xl">{ticket.description}</p>
                     </div>
                     <div className="flex flex-col items-end justify-center min-w-[150px] gap-2">
                       <span className="text-xs font-medium text-slate-500 capitalize">{ticket.status.replace('_', ' ')}</span>
                       {ticket.status !== 'resolved' && ticket.status !== 'closed' && (
                         <button
                           onClick={() => markTicketResolved(ticket.id)}
                           disabled={resolvingTicketId === ticket.id}
                           className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand/90 disabled:opacity-50"
                         >
                           {resolvingTicketId === ticket.id ? '...' : 'Mark Resolved'}
                         </button>
                       )}
                     </div>
                   </div>
                 ))}
               </div>
             </div>
           )}

           {/* Provider View */}
           <div className="flex flex-col md:flex-row gap-4 mb-6">
              <div className="relative flex-1">
                 <Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                 <input
                   placeholder="Search jobs by keyword..."
                   className="w-full h-10 rounded-md border border-input pl-9 pr-3 text-sm focus:outline-none focus:ring-2 focus:ring-brand"
                 />
              </div>
              <button className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium hover:bg-accent">
                 <Filter className="mr-2 h-4 w-4" /> Filters
              </button>
           </div>

           <div className="grid gap-4">
              {jobs.map((job) => (
                 <div key={job.id} className="flex flex-col md:flex-row gap-4 rounded-xl border border-border bg-card p-4 hover:border-brand/40 transition-colors group">
                    <div className="relative h-48 md:h-32 md:w-48 rounded-lg overflow-hidden flex-shrink-0 bg-muted">
                        <Image 
                           src={job.image} 
                           alt={job.title} 
                           fill 
                           className="object-cover group-hover:scale-105 transition-transform duration-500"
                        />
                    </div>
                    <div className="flex-1 flex flex-col justify-center">
                       <div className="flex items-center gap-2 mb-1">
                          <h4 className="font-bold text-lg hover:text-brand cursor-pointer">{job.title}</h4>
                          <span className="inline-flex items-center rounded-full bg-secondary px-2 py-0.5 text-xs font-medium">
                             {job.category}
                          </span>
                       </div>
                       <p className="text-sm text-muted-foreground line-clamp-2 max-w-2xl mb-3">
                          Client needs assistance with {job.title.toLowerCase()}. Please inspect and provide quote.
                       </p>
                       <div className="flex items-center gap-4 text-xs text-muted-foreground">
                          <span className="flex items-center"><MapPin className="h-3 w-3 mr-1" /> {job.location}</span>
                          <span className="flex items-center"><Clock className="h-3 w-3 mr-1" /> {job.posted}</span>
                       </div>
                    </div>
                    <div className="flex flex-col items-end justify-center min-w-[150px] border-l pl-4 border-border md:border-l-0 md:border-t-0 border-t pt-4 md:pt-0">
                       <div className="text-lg font-bold mb-1">{job.budget}</div>
                       <Link 
                         href={`/handyman/job/${job.id}`}
                         className="inline-flex items-center justify-center rounded-md bg-brand px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-brand/90"
                       >
                         View & Bid
                       </Link>
                    </div>
                 </div>
              ))}
           </div>
        </div>
      )}
    </div>
  );
}
